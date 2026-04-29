import { makeSlot } from "@/lib/simulation";
import type { Aircraft, AtcPlanAssignment, AtcTraceItem, ControlMode, Phase, Point } from "@/types/atc";

const RUNWAY_THRESHOLD = { x: 63.3, y: 69.0 };
const MERGE_POINT = { x: 62.4, y: 76.4 };
const DOWNWIND_POINT = { x: 58.8, y: 66.8 };
const EXTENDED_DOWNWIND_POINT = { x: 53.4, y: 58.5 };
const HOLD_POINT = { x: 42.5, y: 57.5 };

type VectorOption = {
  name: string;
  assignedPhase: Phase;
  routeLeg: number;
  target: Point;
  speed: number;
  altitude: number;
  delaySeconds: number;
  trackMiles: number;
};

type AtcPlanResult = {
  assignments: AtcPlanAssignment[];
  trace: AtcTraceItem[];
};

type TrackPrediction = {
  ac: Aircraft;
  etaRunway: number;
  readyTime: number;
  fuelPriority: number;
};

type RunwayScheduleItem = TrackPrediction & {
  sequence: number;
  runwayTime: number;
  spacing: number;
};

export function planArrivals(aircraft: Aircraft[], mode: ControlMode): AtcPlanAssignment[] {
  return planArrivalsWithTrace(aircraft, mode).assignments;
}

export function planArrivalsWithTrace(aircraft: Aircraft[], mode: ControlMode): AtcPlanResult {
  const trace: AtcTraceItem[] = [];
  addTrace(trace, "Supervisor Agent", "plan.start", "YSSY", `Planning ${aircraft.length} tracks`, "Loaded normalized track state and selected the planning pipeline.", "info");

  if (aircraft.length >= 50) return planPeakTraffic(aircraft, mode, trace);

  const ranked = aircraft
    .filter((ac) => ac.phase !== "landed" && ac.phase !== "departed")
    .map((ac) => ({
      ac,
      etaScore: estimateEtaSeconds(ac),
    }))
    .sort((a, b) => {
      const fuelPriority = fuelPriorityScore(b.ac) - fuelPriorityScore(a.ac);
      if (fuelPriority !== 0) return fuelPriority;
      return a.etaScore - b.etaScore;
    });

  let runwayTime = 0;
  const assignments = ranked.map(({ ac, etaScore }, index) => {
    const spacing = runwaySpacingSeconds(ranked[index - 1]?.ac, ac, mode);
    runwayTime = Math.max(Math.ceil(etaScore), runwayTime + spacing);
    const delay = Math.max(0, runwayTime - etaScore);
    const sequence = index + 1;
    const vectorPlan = chooseVectorPlan(ac, runwayTime, etaScore, mode);

    return {
      aircraftId: ac.id,
      sequence,
      slot: makeSlot(Math.ceil(runwayTime / 300)),
      delay,
      assignedPhase: vectorPlan.assignedPhase,
      routeLeg: vectorPlan.routeLeg,
      heading: headingTo(ac, vectorPlan.target),
      altitude: vectorPlan.altitude,
      speed: vectorPlan.speed,
      ...instructionFor(ac, sequence, delay, mode, vectorPlan),
    };
  });

  addTrace(
    trace,
    "Runway Scheduler",
    "schedule.complete",
    "34L",
    `${assignments.length} aircraft sequenced`,
    "Used ETA, fuel priority, wake spacing, and vector cost scoring for the standard traffic planner.",
    "decision",
  );
  return { assignments, trace };
}

function planPeakTraffic(aircraft: Aircraft[], mode: ControlMode, trace: AtcTraceItem[] = []): AtcPlanResult {
  const active = aircraft
    .filter((ac) => ac.phase !== "landed" && ac.phase !== "departed")
    .slice();

  addTrace(
    trace,
    "Prediction Agent",
    "predict.batch",
    "busy-hour bank",
    `${active.length} active tracks predicted`,
    "Computed runway ETA, release readiness, fuel priority, and operation type for every live track.",
    "info",
  );

  const predictions = active.map((ac): TrackPrediction => {
    const etaRunway = estimateEtaSeconds(ac);
    const readyTime = ac.operation === "departure" ? Math.max(ac.releaseAt, etaRunway) : etaRunway;
    return {
      ac,
      etaRunway,
      readyTime,
      fuelPriority: fuelPriorityScore(ac),
    };
  });

  const schedule = buildRunwaySchedule(predictions, mode, trace);
  const assignments = schedule.map((item) => {
    const delay = Math.max(0, item.runwayTime - item.etaRunway);
    const vectorPlan =
      item.ac.operation === "departure" ? managedDeparturePlan(item.ac, item.runwayTime) : managedArrivalPlan(item.ac, delay, item.sequence);

    return {
      aircraftId: item.ac.id,
      sequence: item.sequence,
      slot: makeSlot(Math.ceil(item.runwayTime), 1),
      delay,
      assignedPhase: vectorPlan.assignedPhase,
      routeLeg: vectorPlan.routeLeg,
      heading: headingTo(item.ac, vectorPlan.target),
      altitude: vectorPlan.altitude,
      speed: vectorPlan.speed,
      ...instructionFor(item.ac, item.sequence, delay, mode, vectorPlan),
    };
  });

  const resolvedAssignments = resolveProjectedConflicts(active, assignments, trace);

  addTrace(
    trace,
    "Supervisor Agent",
    "plan.commit",
    "YSSY",
    `${resolvedAssignments.length} validated clearances committed`,
    "Converted the runway schedule, delay absorption choices, and conflict-resolution pass into ATC assignments.",
    "decision",
  );

  return { assignments: resolvedAssignments, trace };
}

function buildRunwaySchedule(predictions: TrackPrediction[], mode: ControlMode, trace: AtcTraceItem[]) {
  const ordered = predictions.slice().sort((a, b) => {
    const finalPriority = terminalPriority(b.ac) - terminalPriority(a.ac);
    if (finalPriority !== 0) return finalPriority;

    const fuelPriority = b.fuelPriority - a.fuelPriority;
    if (fuelPriority !== 0) return fuelPriority;

    const ready = a.readyTime - b.readyTime;
    if (Math.abs(ready) > 45) return ready;

    return (a.ac.sequence || Number.MAX_SAFE_INTEGER) - (b.ac.sequence || Number.MAX_SAFE_INTEGER);
  });

  let runwayTime = 0;
  let previous: RunwayScheduleItem | undefined;
  const schedule = ordered.map((prediction, index): RunwayScheduleItem => {
    const spacing = peakRunwaySpacingSeconds(previous?.ac, prediction.ac, mode);
    runwayTime = Math.max(Math.ceil(prediction.readyTime), runwayTime + spacing);
    const item = {
      ...prediction,
      sequence: index + 1,
      runwayTime,
      spacing,
    };
    previous = item;
    return item;
  });

  const arrivals = schedule.filter((item) => item.ac.operation === "arrival").length;
  const departures = schedule.length - arrivals;
  const spanMinutes = Math.round((schedule.at(-1)?.runwayTime ?? 0) / 60);
  addTrace(
    trace,
    "Runway Scheduler",
    "schedule.optimize",
    "34L",
    `${arrivals} arrivals and ${departures} departures over ${spanMinutes} min`,
    "Built a single runway timeline from predicted readiness and wake/runway spacing instead of using the JSON order as a fixed sequence.",
    "decision",
  );

  return schedule;
}

function terminalPriority(ac: Aircraft) {
  if (ac.phase === "final") return 4;
  if (ac.phase === "base") return 3;
  if (ac.phase === "departure" && ac.releaseAt <= 60) return 2;
  if (ac.phase === "downwind") return 1;
  return 0;
}

function peakRunwaySpacingSeconds(previous: Aircraft | undefined, current: Aircraft, mode: ControlMode) {
  if (!previous) return 0;

  if (previous.operation === "arrival" && current.operation === "arrival") return runwaySpacingSeconds(previous, current, mode);
  if (previous.operation === "departure" && current.operation === "departure") return mode === "ai" ? 90 : 120;
  if (previous.operation === "arrival" && current.operation === "departure") return previous.wake === "heavy" ? 95 : 80;
  return current.wake === "heavy" ? 110 : 95;
}

function managedDeparturePlan(ac: Aircraft, runwayTime: number): VectorOption {
  return {
    name: "runway gap departure release",
    assignedPhase: ac.phase === "scheduled" ? "departure" : ac.phase === "departure" ? "departure" : "climb",
    routeLeg: ac.phase === "scheduled" || ac.phase === "departure" ? 0 : 2,
    target: { x: 63.3, y: 69.0 },
    speed: ac.phase === "scheduled" || ac.phase === "departure" ? 0 : 250,
    altitude: ac.phase === "scheduled" || ac.phase === "departure" ? 0 : 7000,
    delaySeconds: Math.max(45, runwayTime - ac.releaseAt),
    trackMiles: 2,
  };
}

function managedArrivalPlan(ac: Aircraft, delay: number, sequence: number): VectorOption {
  const baseAltitude = Math.max(5000, Math.round((ac.altitude - 1800) / 500) * 500);
  const normalSpeed = ac.wake === "heavy" ? 240 : 230;

  if (ac.phase === "final" || ac.phase === "base" || delay < 90) {
    return {
      name: "immediate approach sequence",
      assignedPhase: ac.phase === "final" ? "final" : ac.phase === "base" ? "base" : "vectoring",
      routeLeg: ac.phase === "final" ? 6 : ac.phase === "base" ? 5 : 2,
      target: MERGE_POINT,
      speed: Math.max(180, normalSpeed - 35),
      altitude: Math.max(3000, baseAltitude - 2500),
      delaySeconds: 40,
      trackMiles: distance(ac, MERGE_POINT),
    };
  }

  if (delay < 420) {
    return {
      name: delay > 240 ? "extended downwind for runway timeline" : "inside downwind for runway timeline",
      assignedPhase: "downwind",
      routeLeg: 3,
      target: delay > 240 ? EXTENDED_DOWNWIND_POINT : DOWNWIND_POINT,
      speed: Math.max(190, normalSpeed - 40),
      altitude: Math.max(7000, baseAltitude),
      delaySeconds: delay,
      trackMiles: distance(ac, delay > 240 ? EXTENDED_DOWNWIND_POINT : DOWNWIND_POINT) + 12,
    };
  }

  if (delay >= 720 || sequence > 42) {
    return {
      name: "published hold for saturation recovery",
      assignedPhase: "holding",
      routeLeg: 1,
      target: HOLD_POINT,
      speed: 210,
      altitude: Math.max(8000, Math.round(ac.altitude / 1000) * 1000),
      delaySeconds: delay,
      trackMiles: distance(ac, HOLD_POINT) + 18,
    };
  }

  return {
    name: "speed controlled long arrival",
    assignedPhase: "arrival",
    routeLeg: 0,
    target: MERGE_POINT,
    speed: Math.max(200, normalSpeed - 25),
    altitude: Math.max(9000, baseAltitude),
    delaySeconds: 160,
    trackMiles: distance(ac, MERGE_POINT) + 5,
  };
}

function resolveProjectedConflicts(aircraft: Aircraft[], assignments: AtcPlanAssignment[], trace: AtcTraceItem[]) {
  const aircraftById = new Map(aircraft.map((ac) => [ac.id, ac]));
  const bySlotTime = assignments.map((assignment) => ({
    assignment,
    ac: aircraftById.get(assignment.aircraftId),
    slotSeconds: slotSeconds(assignment.slot),
  }));

  let adjusted = 0;
  const resolved = assignments.map((assignment) => ({ ...assignment }));
  const resolvedById = new Map(resolved.map((assignment) => [assignment.aircraftId, assignment]));

  for (let index = 0; index < bySlotTime.length; index++) {
    const current = bySlotTime[index];
    if (!current.ac) continue;

    for (const other of bySlotTime.slice(index + 1)) {
      if (!other.ac || Math.abs(current.slotSeconds - other.slotSeconds) > 240) continue;
      if (current.ac.operation === "departure" && other.ac.operation === "departure") continue;

      const closeNow = Math.hypot(current.ac.x - other.ac.x, current.ac.y - other.ac.y) < 6.2;
      const sameLevel = Math.abs(current.assignment.altitude - other.assignment.altitude) < 1000;
      if (!closeNow || !sameLevel) continue;

      const target = resolvedById.get(other.assignment.aircraftId);
      if (!target || target.assignedPhase === "final" || target.assignedPhase === "departure") continue;

      target.altitude += 1000;
      target.reason = `${target.reason}; Conflict Resolver added 1000ft vertical split from ${current.ac.callsign}`;
      adjusted += 1;
    }
  }

  addTrace(
    trace,
    "Conflict Resolver",
    adjusted ? "conflict.adjust" : "conflict.clear",
    "terminal airspace",
    adjusted ? `${adjusted} tactical altitude splits applied` : "No projected tactical splits required",
    "Probed near-term slot pairs for horizontal proximity and altitude overlap after the runway schedule was built.",
    adjusted ? "warning" : "decision",
  );

  return resolved;
}

function slotSeconds(slot: string) {
  const parts = slot.split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function estimateEtaSeconds(ac: Aircraft) {
  if (ac.operation === "departure") return ac.phase === "scheduled" ? ac.releaseAt + 30 : ac.releaseAt;
  if (ac.phase === "scheduled") return ac.releaseAt + 900;

  const distance = Math.hypot(ac.x - RUNWAY_THRESHOLD.x, ac.y - RUNWAY_THRESHOLD.y);
  const speedFactor = Math.max(140, ac.speed) / 240;
  const altitudePenalty = Math.max(0, ac.altitude - 3000) / 18;
  const wakePenalty = ac.wake === "heavy" ? 35 : 0;
  return (distance * 42) / speedFactor + altitudePenalty + wakePenalty;
}

function fuelPriorityScore(ac: Aircraft) {
  const fuelRatio = ac.fuel / ac.initialFuel;
  if (fuelRatio < 0.28) return 3;
  if (fuelRatio < 0.4) return 2;
  return 0;
}

function runwaySpacingSeconds(previous: Aircraft | undefined, current: Aircraft, mode: ControlMode) {
  if (!previous) return 0;
  if (previous.operation === "departure" || current.operation === "departure") return mode === "ai" ? 60 : 75;
  if (mode === "ai") {
    if (previous.wake === "heavy" && current.wake === "medium") return 150;
    if (previous.wake === "heavy" || current.wake === "heavy") return 135;
    return 105;
  }

  if (previous.wake === "heavy" && current.wake === "medium") return 180;
  if (previous.wake === "heavy" || current.wake === "heavy") return 210;
  return 120;
}

export function calculateVectorOptions(ac: Aircraft, mode: ControlMode): VectorOption[] {
  if (ac.operation === "departure") return departureVectorOptions(ac, mode);

  const baseDescentAltitude = Math.max(3000, Math.round((ac.altitude - 2200) / 500) * 500);
  const normalSpeed = ac.wake === "heavy" ? 240 : 230;

  if (mode !== "ai") {
    return [
      {
        name: "traditional vector",
        assignedPhase: "vectoring",
        routeLeg: 2,
        target: MERGE_POINT,
        speed: 250,
        altitude: Math.max(5000, baseDescentAltitude),
        delaySeconds: 80,
        trackMiles: distance(ac, MERGE_POINT),
      },
      {
        name: "published hold",
        assignedPhase: "holding",
        routeLeg: 1,
        target: HOLD_POINT,
        speed: 210,
        altitude: Math.max(7000, Math.round((ac.altitude - 1500) / 1000) * 1000),
        delaySeconds: 320,
        trackMiles: distance(ac, HOLD_POINT) + 12,
      },
    ];
  }

  return [
    {
      name: "direct merge",
      assignedPhase: "vectoring",
      routeLeg: 2,
      target: MERGE_POINT,
      speed: normalSpeed,
      altitude: baseDescentAltitude,
      delaySeconds: 35,
      trackMiles: distance(ac, MERGE_POINT),
    },
    {
      name: "speed controlled merge",
      assignedPhase: "arrival",
      routeLeg: 1,
      target: MERGE_POINT,
      speed: Math.max(200, normalSpeed - 25),
      altitude: Math.max(4000, baseDescentAltitude),
      delaySeconds: 120,
      trackMiles: distance(ac, MERGE_POINT) + 2.5,
    },
    {
      name: "inside downwind extension",
      assignedPhase: "downwind",
      routeLeg: 4,
      target: DOWNWIND_POINT,
      speed: Math.max(190, normalSpeed - 35),
      altitude: Math.max(6000, baseDescentAltitude),
      delaySeconds: 230,
      trackMiles: distance(ac, DOWNWIND_POINT) + 6,
    },
    {
      name: "extended downwind",
      assignedPhase: "downwind",
      routeLeg: 4,
      target: EXTENDED_DOWNWIND_POINT,
      speed: 190,
      altitude: Math.max(7000, baseDescentAltitude),
      delaySeconds: 360,
      trackMiles: distance(ac, EXTENDED_DOWNWIND_POINT) + 11,
    },
    {
      name: "minimum hold",
      assignedPhase: "holding",
      routeLeg: 1,
      target: HOLD_POINT,
      speed: 210,
      altitude: Math.max(8000, Math.round((ac.altitude - 1500) / 1000) * 1000),
      delaySeconds: 540,
      trackMiles: distance(ac, HOLD_POINT) + 18,
    },
  ];
}

function departureVectorOptions(ac: Aircraft, mode: ControlMode): VectorOption[] {
  return [
    {
      name: "immediate departure release",
      assignedPhase: ac.phase === "scheduled" ? "departure" : "climb",
      routeLeg: ac.phase === "scheduled" ? 0 : 2,
      target: { x: 64.7, y: 72.1 },
      speed: ac.phase === "scheduled" ? 0 : mode === "ai" ? 260 : 240,
      altitude: ac.phase === "scheduled" ? 0 : 7000,
      delaySeconds: mode === "ai" ? 25 : 45,
      trackMiles: 4,
    },
    {
      name: "short runway wait",
      assignedPhase: "departure",
      routeLeg: 0,
      target: { x: 63.3, y: 69.0 },
      speed: 0,
      altitude: 0,
      delaySeconds: mode === "ai" ? 70 : 110,
      trackMiles: 1,
    },
  ];
}

function chooseVectorPlan(ac: Aircraft, runwayTime: number, etaScore: number, mode: ControlMode) {
  const options = calculateVectorOptions(ac, mode);
  return options
    .map((option) => {
      const projectedEta = etaScore + option.delaySeconds + option.trackMiles * 6;
      const earlySeconds = Math.max(0, runwayTime - projectedEta);
      const lateSeconds = Math.max(0, projectedEta - runwayTime);
      const cost = earlySeconds * 2.1 + lateSeconds * 1.2 + option.trackMiles * 0.8 + (option.assignedPhase === "holding" ? 140 : 0);
      return { option, cost };
    })
    .sort((a, b) => a.cost - b.cost)[0].option;
}

function instructionFor(ac: Aircraft, sequence: number, delay: number, mode: ControlMode, vectorPlan: VectorOption) {
  if (ac.operation === "departure") {
    const instruction =
      vectorPlan.assignedPhase === "departure"
        ? `${ac.callsign}, hold short runway three four left, departure sequence ${sequence}, expect release ${makeSlot(sequence - 1, 45)}`
        : `${ac.callsign}, fly runway heading, climb ${vectorPlan.altitude}ft, contact departures airborne`;
    return {
      instruction,
      reason: `Supervisor Agent sequenced departure into the shared channel; selected ${vectorPlan.name} with ${Math.round(delay)}s slot pressure`,
    };
  }

  if (ac.phase === "scheduled") {
    return {
      instruction: `${ac.callsign}, expect runway three four left, sequence ${sequence}, cross the arrival gate at ${vectorPlan.altitude}ft and ${vectorPlan.speed}kt`,
      reason: `Supervisor Agent planned before sector entry using release time ${ac.releaseAt}s and ${vectorPlan.name}`,
    };
  }

  if (mode === "ai") {
    const heading = String(headingTo(ac, vectorPlan.target)).padStart(3, "0");
    const instruction = `${ac.callsign}, turn heading ${heading}, descend ${vectorPlan.altitude}ft, reduce ${vectorPlan.speed}kt, runway three four left, sequence ${sequence}`;

    return {
      instruction,
      reason: `Supervisor Agent function call selected ${vectorPlan.name}; ETA, wake spacing, altitude, speed, and slot delay ${Math.round(delay)}s minimized total vector cost`,
    };
  }

  const heading = String(headingTo(ac, vectorPlan.target)).padStart(3, "0");
  return {
    instruction:
      delay > 180
        ? `${ac.callsign}, enter published hold, maintain ${vectorPlan.altitude}ft`
        : `${ac.callsign}, turn heading ${heading}, descend ${vectorPlan.altitude}ft, vectors ILS three four left, sequence ${sequence}`,
    reason: `Traditional coordinator used raw ETA and conservative wake spacing; selected ${vectorPlan.name}`,
  };
}

function headingTo(ac: Aircraft, target: Point) {
  const heading = Math.atan2(target.x - ac.x, -(target.y - ac.y)) * (180 / Math.PI);
  return Math.round(heading < 0 ? heading + 360 : heading);
}

function distance(ac: Aircraft, target: Point) {
  return Math.hypot(ac.x - target.x, ac.y - target.y);
}

function addTrace(
  trace: AtcTraceItem[],
  agent: string,
  action: string,
  target: string,
  summary: string,
  detail: string,
  level: AtcTraceItem["level"],
) {
  trace.push({
    id: `${trace.length + 1}-${action}-${target}`.replaceAll(/\s+/g, "-").toLowerCase(),
    time: new Date().toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Australia/Sydney",
    }),
    agent,
    action,
    target,
    summary,
    detail,
    level,
  });
}
