import sampleAircraft from "@/data/sample-aircraft.json";
import peakAircraft from "@/data/sydney-peak-hour-aircraft.json";
import { holds, runway, streams } from "@/data/sydney-airport";
import type { Aircraft, ControlMode, Metrics, Operation, Phase, Point, TrafficLevel, WakeCategory } from "@/types/atc";

type SampleAircraft = {
  callsign: string;
  airline: string;
  type: string;
  operation?: Operation;
  origin: string;
  destination?: string;
  wake: WakeCategory;
  flow: (typeof streams)[number]["name"];
  phase: Aircraft["releasePhase"];
  releaseAt?: number;
  routeLeg?: number;
  sequence: number;
  x: number;
  y: number;
  altitude: number;
  speed: number;
  heading: number;
};

const baseAircraft = sampleAircraft as SampleAircraft[];
const peakBaseAircraft = peakAircraft as SampleAircraft[];

export const TRAFFIC_COUNTS: Record<TrafficLevel, number> = {
  light: 8,
  medium: 20,
  heavy: 40,
  peak: 60,
};

const PEAK_INITIAL_ACTIVE_ARRIVALS = 12;
const PEAK_ARRIVAL_RELEASE_START_SECONDS = 240;
const PEAK_ARRIVAL_RELEASE_INTERVAL_SECONDS = 105;
const PEAK_DEPARTURE_RELEASE_START_SECONDS = 120;
const PEAK_DEPARTURE_RELEASE_INTERVAL_SECONDS = 150;
const SIMULATION_START_ISO = "2026-04-29T14:00:00+10:00";
const SIMULATION_TIME_ZONE = "Australia/Sydney";
const SIMULATION_START_SECONDS = 14 * 60 * 60;
const ARRIVAL_RUNWAY_CLEAR_SECONDS = 60;
const DEPARTURE_RADAR_CLEAR_SECONDS = 600;
const SPOKEN_VECTOR_SECONDS = 90;

export function makeSlot(index: number, spacingSeconds = 300) {
  return formatSimulationClock(index * spacingSeconds);
}

export function formatSimulationClock(elapsedSeconds: number) {
  const time = new Date(SIMULATION_START_ISO);
  time.setSeconds(time.getSeconds() + Math.max(0, Math.round(elapsedSeconds)));

  return time.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: SIMULATION_TIME_ZONE,
  });
}

export function simulationSecondsFromSlot(slot: string) {
  const parts = slot.split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const slotSeconds = parts[0] * 60 * 60 + parts[1] * 60 + parts[2];
  const elapsedSeconds = slotSeconds - SIMULATION_START_SECONDS;
  return elapsedSeconds < 0 ? elapsedSeconds + 24 * 60 * 60 : elapsedSeconds;
}

export function commandFor(ac: Aircraft, mode: ControlMode) {
  if (ac.operation === "departure") return departureCommandFor(ac, mode);

  if (ac.phase === "scheduled") {
    return {
      instruction: `Expected ${ac.slot}, monitor ${streams[ac.streamIndex].star} arrival gate`,
      reason: "Scheduled inbound; not yet in Sydney Approach sector",
    };
  }

  if (ac.phase === "final") {
    return {
      instruction: `Cleared ILS 34L, track 335, maintain ${Math.max(145, Math.round(ac.speed - 18))}kt`,
      reason: `Established final as sequence ${ac.sequence}`,
    };
  }

  if (ac.phase === "holding") {
    const hold = holds[(ac.sequence + ac.callsign.length) % holds.length];
    return {
      instruction: `Enter hold at ${hold.name}, maintain ${Math.max(7000, ac.altitude - 2000)}ft, expect onward clearance ${ac.slot}`,
      reason: "Arrival delayed to create mixed arrival and departure runway gaps",
    };
  }

  if (mode === "ai") {
    const targetSpeed = ac.wake === "heavy" ? 240 : 230;
    if (ac.phase === "base" || ac.phase === "downwind") {
      return {
        instruction: `Vector to intercept ILS 34L via SOSIJ, descend ${Math.max(3000, ac.altitude - 1800)}ft, reduce ${Math.max(180, targetSpeed - 35)}kt`,
        reason: `Sequenced inside turn for arrival ${ac.sequence}`,
      };
    }

    return {
      instruction: `Continue ${streams[ac.streamIndex].star} arrival, descend ${Math.max(3000, ac.altitude - 2500)}ft, reduce ${targetSpeed}kt`,
      reason: `Early speed control preserves sequence ${ac.sequence} without holding`,
    };
  }

  return {
    instruction: `Continue arrival track, descend ${Math.max(3000, ac.altitude - 2000)}ft, vectors ILS 34L`,
    reason: `Late vector for spacing as sequence ${ac.sequence}`,
  };
}

function departureCommandFor(ac: Aircraft, mode: ControlMode) {
  const stream = streams[ac.streamIndex];

  if (ac.phase === "scheduled") {
    return {
      instruction: `Hold short runway 34L, expect ${stream.star} departure release at ${ac.slot}`,
      reason: "Departure staged for the shared Sydney terminal frequency",
    };
  }

  if (ac.phase === "departure") {
    return {
      instruction: `${ac.callsign}, line up runway 34L, be ready immediate departure, assigned ${stream.star} transition`,
      reason: `Departure number ${ac.sequence} fitted between arrival gaps`,
    };
  }

  if (ac.phase === "takeoff") {
    return {
      instruction: `${ac.callsign}, cleared for takeoff runway 34L, climb 5000ft, fly heading ${String(stream.heading).padStart(3, "0")}`,
      reason: "Runway slot opened; departure released onto the terminal route",
    };
  }

  const climbAltitude = mode === "ai" ? Math.min(12000, ac.altitude + 2500) : Math.min(10000, ac.altitude + 1800);
  return {
    instruction: `${ac.callsign}, continue ${stream.star} departure, climb ${climbAltitude}ft, maintain ${Math.max(230, ac.speed)}kt`,
    reason: mode === "ai" ? "Climb profile keeps outbound aircraft clear of merge traffic" : "Standard outbound climb after runway release",
  };
}

export function fuelBurnRateKgPerMinute(ac: Aircraft, mode: ControlMode) {
  const baseRate = ac.wake === "heavy" ? 118 : 52;
  const phaseMultiplier =
    ac.phase === "takeoff" || ac.phase === "climb"
      ? 1.35
      : ac.phase === "outbound"
        ? 1.08
        : ac.phase === "holding"
      ? 1.22
      : ac.phase === "final" || ac.phase === "base"
        ? 0.82
        : mode === "ai"
          ? 0.9
          : 1;

  return Math.round(baseRate * phaseMultiplier);
}

export function generateAircraft(mode: ControlMode, traffic: TrafficLevel = "light", planned = false): Aircraft[] {
  const count = TRAFFIC_COUNTS[traffic];
  const scenarioAircraft = traffic === "peak" ? peakBaseAircraft : baseAircraft;
  let arrivalOrdinal = 0;
  let departureOrdinal = 0;

  return Array.from({ length: count }, (_, index) => {
    const template = scenarioAircraft[index % scenarioAircraft.length];
    const cycle = Math.floor(index / scenarioAircraft.length);
    const operation = template.operation ?? "arrival";
    const operationOrdinal = operation === "arrival" ? arrivalOrdinal++ : departureOrdinal++;
    const streamIndex = Math.max(
      0,
      streams.findIndex((stream) => stream.name === template.flow),
    );
    const stream = streams[streamIndex];
    const sequence = planned ? index + 1 : 0;
    const initialDelay = mode === "ai" ? Math.max(0, 45 + index * 12) : Math.max(0, 80 + index * 26);
    const releasePhase = planned
      ? mode === "ai" && template.phase === "holding"
        ? "vectoring"
        : template.phase
      : operation === "departure"
        ? "departure"
        : traffic === "peak"
          ? template.phase
          : "arrival";
    const releaseAt = scaledReleaseAt(template.releaseAt, operation, operationOrdinal, index, cycle, traffic);
    const phase: Phase = releaseAt > 0 ? "scheduled" : releasePhase;
    const routeLeg = planned ? (template.routeLeg ?? routeLegForPhase(releasePhase)) : routeLegForPhase(releasePhase);
    const speedAdjustment = mode === "ai" && phase !== "final" ? 12 : 0;
    const initialFuel = template.wake === "heavy" ? 9000 - index * 95 : 4300 - index * 45;
    const offset = spawnOffset(index, cycle);
    const ac: Aircraft = {
      id: `ac_${String(index + 1).padStart(3, "0")}`,
      callsign: callsignFor(template.callsign, cycle, index),
      airline: template.airline,
      type: template.type,
      operation,
      wake: template.wake,
      origin: template.origin,
      destination: template.destination ?? (operation === "arrival" ? "YSSY" : "YBBN"),
      x: clamp(template.x + offset.x, 6, 88),
      y: clamp(template.y + offset.y, 9, 89),
      altitude: template.altitude,
      speed: Math.max(150, template.speed - speedAdjustment),
      heading: template.heading || stream.heading,
      phase,
      releasePhase,
      releaseAt,
      routeLeg,
      streamIndex,
      delay: planned
        ? operation === "departure"
          ? Math.max(0, initialDelay * 0.55)
          : phase === "final"
            ? Math.max(0, initialDelay - 60)
            : initialDelay
        : 0,
      holding: planned && phase === "holding" ? Math.floor(initialDelay * 0.65) : 0,
      fuel: initialFuel,
      initialFuel,
      sequence,
      slot: planned ? makeSlot(sequence - 1) : "Unplanned",
      instruction: planned ? "" : "Awaiting AI ATC plan",
      reason: planned ? "" : "Raw track loaded without runway sequence",
      trail: [{ x: template.x + offset.x, y: template.y + offset.y }],
    };
    const positioned = planned && phase === "holding" ? { ...ac, ...holdingPatternFor(ac, 0) } : ac;
    const base = { ...positioned, trail: [{ x: positioned.x, y: positioned.y }] };
    return planned ? { ...base, ...commandFor(base, mode) } : base;
  });
}

function scaledReleaseAt(
  releaseAt: number | undefined,
  operation: Operation,
  operationOrdinal: number,
  index: number,
  cycle: number,
  traffic: TrafficLevel,
) {
  if (traffic === "peak") {
    if (operation === "arrival") {
      if (operationOrdinal < PEAK_INITIAL_ACTIVE_ARRIVALS) return 0;

      return (
        PEAK_ARRIVAL_RELEASE_START_SECONDS +
        (operationOrdinal - PEAK_INITIAL_ACTIVE_ARRIVALS) * PEAK_ARRIVAL_RELEASE_INTERVAL_SECONDS
      );
    }

    return Math.max(
      releaseAt ?? 0,
      PEAK_DEPARTURE_RELEASE_START_SECONDS + operationOrdinal * PEAK_DEPARTURE_RELEASE_INTERVAL_SECONDS,
    );
  }

  if (index < 7) return releaseAt ?? 0;

  const bankSpacing = traffic === "heavy" ? 105 : traffic === "medium" ? 150 : 210;
  const templateRelease = releaseAt ?? 0;
  return Math.max(templateRelease, 240 + (index - 7) * bankSpacing + cycle * 360);
}

function callsignFor(callsign: string, cycle: number, index: number) {
  if (cycle === 0) return callsign;

  const match = callsign.match(/^([A-Z]+)(\d+)$/);
  if (!match) return `${callsign}${cycle + 1}`;

  const prefix = match[1];
  const number = Number(match[2]);
  return `${prefix}${String(number + cycle * 73 + index).slice(-4)}`;
}

function spawnOffset(index: number, cycle: number): Point {
  if (cycle === 0) return { x: 0, y: 0 };

  const spread = 1 + cycle * 0.38;
  const angle = ((index * 137.5) % 360) * (Math.PI / 180);
  return {
    x: Math.cos(angle) * spread,
    y: Math.sin(angle) * spread,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function moveToward(value: number, target: number, step: number) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

function laneOffset(ac: Aircraft) {
  return ((ac.sequence * 7) % 9) - 4;
}

type RouteWaypoint = Point & { phase: Phase };

function routeLegForPhase(phase: Exclude<Phase, "scheduled" | "landed" | "departed">) {
  if (phase === "departure") return 0;
  if (phase === "takeoff") return 1;
  if (phase === "climb") return 2;
  if (phase === "outbound") return 3;
  if (phase === "final") return 6;
  if (phase === "base") return 5;
  if (phase === "downwind") return 4;
  if (phase === "vectoring") return 2;
  return 1;
}

function routeWaypointsFor(ac: Aircraft, mode: ControlMode): RouteWaypoint[] {
  if (ac.operation === "departure") return departureWaypointsFor(ac, mode);

  const lane = laneOffset(ac);
  const tight = mode === "ai" ? 0.55 : 0.85;
  const routes: RouteWaypoint[][] = [
    [
      { x: 58.0 + lane * 0.2, y: 17.5 + lane * 0.08, phase: "arrival" },
      { x: 57.0 + lane * 0.25, y: 51.0 + lane * 0.08, phase: "arrival" },
      { x: 58.4 + lane * tight, y: 61.7 + lane * 0.08, phase: "vectoring" },
      { x: 59.2 + lane * 0.55, y: 69.0 - Math.abs(lane) * 0.08, phase: "downwind" },
      { x: 70.0 + lane * 0.24, y: 79.0 - Math.abs(lane) * 0.08, phase: "base" },
      { x: runway.finalFix.x + lane * 0.12, y: runway.finalFix.y, phase: "final" },
      { ...runway.atret, phase: "final" },
      { ...runway.threshold34L, phase: "landed" },
    ],
    [
      { x: 12.0, y: 45.0 + lane * 0.08, phase: "arrival" },
      { x: 48.8 + lane * 0.25, y: 64.8 + lane * 0.08, phase: "arrival" },
      { x: 56.7 + lane * tight, y: 69.5 - lane * 0.08, phase: "vectoring" },
      { x: 61.5 + lane * 0.45, y: 72.4 - Math.abs(lane) * 0.08, phase: "downwind" },
      { x: 70.0 + lane * 0.22, y: 78.2 - Math.abs(lane) * 0.08, phase: "base" },
      { x: runway.finalFix.x + lane * 0.12, y: runway.finalFix.y, phase: "final" },
      { ...runway.atret, phase: "final" },
      { ...runway.threshold34L, phase: "landed" },
    ],
    [
      { x: 35.0, y: 86.0 + lane * 0.08, phase: "arrival" },
      { x: runway.merge.x + lane * 0.24, y: runway.merge.y - Math.abs(lane) * 0.08, phase: "arrival" },
      { x: 72.0 + lane * tight * 0.4, y: 83.0 - Math.abs(lane) * 0.08, phase: "vectoring" },
      { x: 72.1 + lane * 0.32, y: 80.2 - Math.abs(lane) * 0.08, phase: "downwind" },
      { x: 70.0 + lane * 0.2, y: 77.8 - Math.abs(lane) * 0.08, phase: "base" },
      { x: runway.finalFix.x + lane * 0.12, y: runway.finalFix.y, phase: "final" },
      { ...runway.atret, phase: "final" },
      { ...runway.threshold34L, phase: "landed" },
    ],
    [
      { x: 83.0 + lane * 0.08, y: 35.0, phase: "arrival" },
      { x: 82.2 + lane * 0.22, y: 63.4 + lane * 0.08, phase: "arrival" },
      { x: 75.6 + lane * tight, y: 70.2 + lane * 0.08, phase: "vectoring" },
      { x: 72.5 + lane * 0.38, y: 74.4 - Math.abs(lane) * 0.08, phase: "downwind" },
      { x: 70.2 + lane * 0.22, y: 78.0 - Math.abs(lane) * 0.08, phase: "base" },
      { x: runway.finalFix.x + lane * 0.12, y: runway.finalFix.y, phase: "final" },
      { ...runway.atret, phase: "final" },
      { ...runway.threshold34L, phase: "landed" },
    ],
  ];

  return routes[ac.streamIndex];
}

function departureWaypointsFor(ac: Aircraft, mode: ControlMode): RouteWaypoint[] {
  const lane = laneOffset(ac) * 0.22;
  const stretch = mode === "ai" ? 1 : 0.82;
  const routes: RouteWaypoint[][] = [
    [
      { x: runway.threshold34L.x, y: runway.threshold34L.y, phase: "departure" },
      { x: runway.atret.x + lane, y: runway.atret.y - 0.5, phase: "takeoff" },
      { x: 62.4 + lane, y: 56.0, phase: "climb" },
      { x: 58.0 + lane, y: 29.0, phase: "outbound" },
      { x: 58.0 + lane, y: 10.0 * stretch, phase: "departed" },
    ],
    [
      { x: runway.threshold34L.x, y: runway.threshold34L.y, phase: "departure" },
      { x: runway.atret.x + lane, y: runway.atret.y - 0.5, phase: "takeoff" },
      { x: 55.5 + lane, y: 62.5, phase: "climb" },
      { x: 34.0 + lane, y: 52.5, phase: "outbound" },
      { x: 9.0, y: 45.0 + lane, phase: "departed" },
    ],
    [
      { x: runway.threshold34L.x, y: runway.threshold34L.y, phase: "departure" },
      { x: runway.atret.x + lane, y: runway.atret.y - 0.5, phase: "takeoff" },
      { x: 66.5 + lane, y: 77.0, phase: "climb" },
      { x: 53.0 + lane, y: 88.0, phase: "outbound" },
      { x: 36.0 + lane, y: 91.0, phase: "departed" },
    ],
    [
      { x: runway.threshold34L.x, y: runway.threshold34L.y, phase: "departure" },
      { x: runway.atret.x + lane, y: runway.atret.y - 0.5, phase: "takeoff" },
      { x: 74.0 + lane, y: 64.0, phase: "climb" },
      { x: 84.0, y: 43.0 + lane, phase: "outbound" },
      { x: 90.0, y: 33.0 + lane, phase: "departed" },
    ],
  ];

  return routes[ac.streamIndex];
}

function holdingPatternFor(ac: Aircraft, elapsedSeconds: number) {
  const hold = holds[(ac.sequence + ac.callsign.length) % holds.length];
  const longLeg = 6.8;
  const crossLeg = 2.2;
  const periodSeconds = 92;
  const progress = (((ac.holding + elapsedSeconds + ac.sequence * 19) % periodSeconds) / periodSeconds) * 4;
  const segment = Math.floor(progress);
  const t = progress - segment;
  const local =
    segment === 0
      ? { x: -crossLeg + crossLeg * 2 * t, y: -longLeg }
      : segment === 1
        ? { x: crossLeg, y: -longLeg + longLeg * 2 * t }
        : segment === 2
          ? { x: crossLeg - crossLeg * 2 * t, y: longLeg }
          : { x: -crossLeg, y: longLeg - longLeg * 2 * t };
  const nextProgress = (progress + 0.05) % 4;
  const nextSegment = Math.floor(nextProgress);
  const nextT = nextProgress - nextSegment;
  const nextLocal =
    nextSegment === 0
      ? { x: -crossLeg + crossLeg * 2 * nextT, y: -longLeg }
      : nextSegment === 1
        ? { x: crossLeg, y: -longLeg + longLeg * 2 * nextT }
        : nextSegment === 2
          ? { x: crossLeg - crossLeg * 2 * nextT, y: longLeg }
          : { x: -crossLeg, y: longLeg - longLeg * 2 * nextT };
  const angle = ((hold.inboundHeading - 90) * Math.PI) / 180;
  const rotate = (point: { x: number; y: number }) => ({
    x: hold.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: hold.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  });
  const point = rotate(local);
  const nextPoint = rotate(nextLocal);
  const heading = Math.atan2(nextPoint.x - point.x, -(nextPoint.y - point.y)) * (180 / Math.PI);

  return {
    ...point,
    heading: heading < 0 ? heading + 360 : heading,
  };
}

export function moveAircraft(ac: Aircraft, mode: ControlMode, elapsedSeconds = 5): Aircraft {
  return moveAircraftAt(ac, mode, elapsedSeconds);
}

export function moveAircraftAt(ac: Aircraft, mode: ControlMode, elapsedSeconds = 5, activeSeconds = 0): Aircraft {
  if (ac.phase === "landed" || ac.phase === "departed") return ac;

  if (ac.phase === "scheduled") {
    if (activeSeconds < ac.releaseAt) return ac;

    const activated = {
      ...ac,
      phase: ac.releasePhase,
      routeLeg: Math.max(ac.routeLeg, routeLegForPhase(ac.releasePhase)),
      trail: [{ x: ac.x, y: ac.y }],
    };
    return { ...activated, ...commandFor(activated, mode) };
  }

  if (ac.operation === "arrival") return projectArrivalAtSlot(ac, mode, elapsedSeconds, activeSeconds);
  return projectDepartureAtSlot(ac, mode, elapsedSeconds, activeSeconds);
}

function projectArrivalAtSlot(ac: Aircraft, mode: ControlMode, elapsedSeconds: number, activeSeconds: number): Aircraft {
  const route = routeWaypointsFor(ac, mode);
  const slotSeconds = simulationSecondsFromSlot(ac.slot);
  if (slotSeconds === null) return projectAircraftIncrementally(ac, mode, elapsedSeconds);

  const landed = activeSeconds >= slotSeconds + ARRIVAL_RUNWAY_CLEAR_SECONDS;
  const secondsToSlot = slotSeconds - activeSeconds;
  if (ac.releasePhase === "holding" && activeSeconds < slotSeconds - 900) {
    const holdPoint = holdingPatternFor(ac, activeSeconds);
    const phase: Phase = "holding";
    const fuelBurn = (fuelBurnRateKgPerMinute({ ...ac, phase }, mode) * elapsedSeconds) / 60;
    const updated = {
      ...ac,
      ...holdPoint,
      phase,
      routeLeg: 1,
      delay: ac.delay,
      holding: ac.holding + elapsedSeconds,
      fuel: Math.max(300, ac.fuel - fuelBurn),
      altitude: 9000,
      speed: 210,
      trail: [...ac.trail.slice(-24), { x: holdPoint.x, y: holdPoint.y }],
    };
    return { ...updated, ...commandFor(updated, mode) };
  }

  if (shouldFlySpokenVector(ac, activeSeconds, secondsToSlot)) {
    return projectArrivalOnSpokenClearance(ac, mode, elapsedSeconds);
  }

  const routeStartSeconds = ac.releasePhase === "holding" ? Math.max(ac.releaseAt, slotSeconds - 900) : ac.releaseAt;
  const activeRouteTime = Math.max(90, slotSeconds - routeStartSeconds);
  const progress = activeSeconds >= slotSeconds ? 1 : clamp((activeSeconds - routeStartSeconds) / activeRouteTime, 0, 1);
  const projected = interpolateRoute(route, timelineStartLegForArrival(ac.releasePhase), progress);
  const phase = landed ? "landed" : arrivalPhaseForSchedule(projected.phase, secondsToSlot);
  const trail = landed ? ac.trail : [...ac.trail.slice(-24), { x: projected.x, y: projected.y }];
  const fuelBurn = landed ? 0 : (fuelBurnRateKgPerMinute({ ...ac, phase }, mode) * elapsedSeconds) / 60;
  const updated = {
    ...ac,
    x: projected.x,
    y: projected.y,
    phase,
    routeLeg: projected.routeLeg,
    delay: ac.delay,
    holding: phase === "holding" ? ac.holding + elapsedSeconds : ac.holding,
    fuel: Math.max(300, ac.fuel - fuelBurn),
    altitude: activeClearanceValue(ac.clearedAltitude, ac.lastAtcInstructionAt, activeSeconds) ?? altitudeForArrivalPhase(phase, secondsToSlot),
    speed: activeClearanceValue(ac.clearedSpeed, ac.lastAtcInstructionAt, activeSeconds) ?? speedForArrivalPhase(phase, ac.wake),
    heading: activeClearanceValue(ac.clearedHeading, ac.lastAtcInstructionAt, activeSeconds) ?? projected.heading,
    trail,
  };

  return phase === "landed" ? updated : { ...updated, ...commandFor(updated, mode) };
}

function projectDepartureAtSlot(ac: Aircraft, mode: ControlMode, elapsedSeconds: number, activeSeconds: number): Aircraft {
  const route = routeWaypointsFor(ac, mode);
  const slotSeconds = simulationSecondsFromSlot(ac.slot) ?? ac.releaseAt;
  const elapsedSinceSlot = activeSeconds - slotSeconds;
  const departed = elapsedSinceSlot >= DEPARTURE_RADAR_CLEAR_SECONDS;
  const progress = clamp(elapsedSinceSlot / DEPARTURE_RADAR_CLEAR_SECONDS, 0, 1);
  const projected = interpolateRoute(route, 0, progress);
  const phase = departed ? "departed" : departurePhaseForSchedule(elapsedSinceSlot);
  const trail = departed ? ac.trail : [...ac.trail.slice(-24), { x: projected.x, y: projected.y }];
  const fuelBurn = departed ? 0 : (fuelBurnRateKgPerMinute({ ...ac, phase }, mode) * elapsedSeconds) / 60;
  const updated = {
    ...ac,
    x: projected.x,
    y: projected.y,
    phase,
    routeLeg: projected.routeLeg,
    delay: ac.delay,
    fuel: Math.max(300, ac.fuel - fuelBurn),
    altitude: activeClearanceValue(ac.clearedAltitude, ac.lastAtcInstructionAt, activeSeconds) ?? altitudeForDeparturePhase(phase),
    speed: activeClearanceValue(ac.clearedSpeed, ac.lastAtcInstructionAt, activeSeconds) ?? speedForDeparturePhase(phase, mode),
    heading: activeClearanceValue(ac.clearedHeading, ac.lastAtcInstructionAt, activeSeconds) ?? projected.heading,
    trail,
  };

  return phase === "departed" ? updated : { ...updated, ...commandFor(updated, mode) };
}

function shouldFlySpokenVector(ac: Aircraft, activeSeconds: number, secondsToSlot: number) {
  if (ac.operation !== "arrival" || ac.clearedHeading === undefined || ac.lastAtcInstructionAt === undefined) return false;
  if (ac.phase === "final" || ac.phase === "base" || secondsToSlot <= 420) return false;
  return activeSeconds - ac.lastAtcInstructionAt <= SPOKEN_VECTOR_SECONDS;
}

function projectArrivalOnSpokenClearance(ac: Aircraft, mode: ControlMode, elapsedSeconds: number): Aircraft {
  const heading = ac.clearedHeading ?? ac.heading;
  const headingRad = (heading * Math.PI) / 180;
  const speed = moveToward(ac.speed, ac.clearedSpeed ?? ac.speed, Math.max(4, elapsedSeconds * 1.8));
  const altitude = moveToward(ac.altitude, ac.clearedAltitude ?? ac.altitude, Math.max(150, elapsedSeconds * 220));
  const step = (mode === "ai" ? 0.36 : 0.29) * Math.max(0.2, elapsedSeconds / 5);
  const x = clamp(ac.x + Math.sin(headingRad) * step, 4, 92);
  const y = clamp(ac.y - Math.cos(headingRad) * step, 4, 94);
  const phase = ac.phase === "scheduled" ? ac.releasePhase : ac.phase;
  const fuelBurn = (fuelBurnRateKgPerMinute({ ...ac, phase }, mode) * elapsedSeconds) / 60;
  const updated = {
    ...ac,
    x,
    y,
    phase,
    altitude,
    speed,
    heading,
    fuel: Math.max(300, ac.fuel - fuelBurn),
    trail: [...ac.trail.slice(-24), { x, y }],
  };
  const command = commandFor(updated, mode);
  return { ...updated, ...command, instruction: ac.lastAtcInstruction ?? command.instruction };
}

function activeClearanceValue(value: number | undefined, issuedAt: number | undefined, activeSeconds: number) {
  if (value === undefined || issuedAt === undefined) return undefined;
  return activeSeconds - issuedAt <= SPOKEN_VECTOR_SECONDS * 2 ? value : undefined;
}

function interpolateRoute(route: RouteWaypoint[], startLeg: number, progress: number) {
  const firstLeg = clamp(Math.min(startLeg, route.length - 2), 0, route.length - 2);
  const segments = route
    .slice(firstLeg)
    .map((point, index, points) => {
      const next = points[index + 1];
      return next ? { from: point, to: next, length: Math.hypot(next.x - point.x, next.y - point.y) } : null;
    })
    .filter((segment): segment is { from: RouteWaypoint; to: RouteWaypoint; length: number } => segment !== null);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = totalLength * clamp(progress, 0, 1);

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (remaining <= segment.length || index === segments.length - 1) {
      const legProgress = segment.length ? clamp(remaining / segment.length, 0, 1) : 1;
      const x = segment.from.x + (segment.to.x - segment.from.x) * legProgress;
      const y = segment.from.y + (segment.to.y - segment.from.y) * legProgress;
      return {
        x,
        y,
        heading: headingBetween(segment.from, segment.to),
        phase: segment.to.phase,
        routeLeg: firstLeg + index,
      };
    }
    remaining -= segment.length;
  }

  const last = route.at(-1) ?? route[0];
  return { x: last.x, y: last.y, heading: 335, phase: last.phase, routeLeg: route.length - 1 };
}

function projectAircraftIncrementally(ac: Aircraft, mode: ControlMode, elapsedSeconds: number): Aircraft {
  const route = routeWaypointsFor(ac, mode);
  const routeLeg = Math.min(ac.routeLeg, route.length - 1);
  const target = route[routeLeg];
  const distance = Math.hypot(target.x - ac.x, target.y - ac.y);
  const heading = headingBetween(ac, target);
  const step = (mode === "ai" ? 0.34 : 0.27) * Math.max(0.2, elapsedSeconds / 5);
  const headingRad = (heading * Math.PI) / 180;
  const x = ac.x + Math.sin(headingRad) * Math.min(step, distance);
  const y = ac.y - Math.cos(headingRad) * Math.min(step, distance);
  const routeDone = distance < 1.2 && routeLeg < route.length - 1;
  const phase = routeDone ? route[routeLeg + 1].phase : ac.phase;
  const updated = {
    ...ac,
    x,
    y,
    phase,
    routeLeg: routeDone ? routeLeg + 1 : routeLeg,
    heading,
    trail: [...ac.trail.slice(-24), { x, y }],
  };
  return { ...updated, ...commandFor(updated, mode) };
}

function timelineStartLegForArrival(phase: Aircraft["releasePhase"]) {
  if (phase === "final") return 5;
  if (phase === "base") return 4;
  if (phase === "downwind") return 3;
  if (phase === "vectoring") return 2;
  return 0;
}

function arrivalPhaseForSchedule(routePhase: Phase, secondsToSlot: number): Phase {
  if (secondsToSlot <= 300) return "final";
  if (secondsToSlot <= 480) return "base";
  if (secondsToSlot <= 720) return "downwind";
  if (routePhase === "arrival" || routePhase === "vectoring" || routePhase === "downwind" || routePhase === "base" || routePhase === "final") return routePhase;
  return "arrival";
}

function departurePhaseForSchedule(elapsedSinceSlot: number): Phase {
  if (elapsedSinceSlot < 0) return "departure";
  if (elapsedSinceSlot < 60) return "takeoff";
  if (elapsedSinceSlot < 240) return "climb";
  return "outbound";
}

function altitudeForArrivalPhase(phase: Phase, secondsToSlot: number) {
  if (phase === "landed") return 0;
  if (phase === "final") return Math.max(500, Math.round(500 + clamp(secondsToSlot / 300, 0, 1) * 2500));
  if (phase === "base") return 4500;
  if (phase === "downwind") return 7000;
  if (phase === "vectoring") return 9000;
  return 12000;
}

function speedForArrivalPhase(phase: Phase, wake: WakeCategory) {
  const heavyAdjustment = wake === "heavy" ? 10 : 0;
  if (phase === "landed") return 0;
  if (phase === "final") return 155 + heavyAdjustment;
  if (phase === "base") return 185 + heavyAdjustment;
  if (phase === "downwind") return 210 + heavyAdjustment;
  if (phase === "vectoring") return 230 + heavyAdjustment;
  return 250 + heavyAdjustment;
}

function altitudeForDeparturePhase(phase: Phase) {
  if (phase === "departure") return 0;
  if (phase === "takeoff") return 1800;
  if (phase === "climb") return 7000;
  if (phase === "outbound") return 12000;
  return 15000;
}

function speedForDeparturePhase(phase: Phase, mode: ControlMode) {
  if (phase === "departure") return 0;
  if (phase === "takeoff") return 165;
  if (phase === "climb") return mode === "ai" ? 250 : 235;
  return mode === "ai" ? 270 : 250;
}

function headingBetween(from: Point, to: Point) {
  const heading = Math.atan2(to.x - from.x, -(to.y - from.y)) * (180 / Math.PI);
  return Math.round(heading < 0 ? heading + 360 : heading);
}

export function calculateMetrics(aircraft: Aircraft[], mode: ControlMode): Metrics {
  if (aircraft.length === 0) {
    return {
      avgDelay: 0,
      totalHolding: 0,
      fuelBurn: 0,
      fuelBurnPerMinute: 0,
      landed: 0,
      conflicts: 0,
      runwayUtilisation: 0,
    };
  }

  const visible = aircraft.filter((ac) => ac.phase !== "scheduled");
  const active = visible.filter((ac) => ac.phase !== "landed" && ac.phase !== "departed");
  const avgDelay = visible.length ? visible.reduce((sum, ac) => sum + ac.delay, 0) / visible.length : 0;
  const totalHolding = aircraft.reduce((sum, ac) => sum + ac.holding, 0);
  const landed = visible.length - active.length;
  const conflicts = aircraft.reduce((count, ac, index) => {
    return (
      count +
      aircraft.slice(index + 1).filter((other) => {
        const close = Math.hypot(ac.x - other.x, ac.y - other.y) < 5.2;
        const sameLevel = Math.abs(ac.altitude - other.altitude) < 1000;
        return (
          close &&
          sameLevel &&
          ac.phase !== "scheduled" &&
          other.phase !== "scheduled" &&
          ac.phase !== "landed" &&
          other.phase !== "landed" &&
          ac.phase !== "departed" &&
          other.phase !== "departed"
        );
      }).length
    );
  }, 0);

  return {
    avgDelay,
    totalHolding,
    fuelBurn: Math.round(aircraft.reduce((sum, ac) => sum + ac.initialFuel - ac.fuel, 0)),
    fuelBurnPerMinute: active.reduce((sum, ac) => sum + fuelBurnRateKgPerMinute(ac, mode), 0),
    landed,
    conflicts,
    runwayUtilisation: Math.min(98, Math.round(62 + landed * 4 + (mode === "ai" ? 18 : 0))),
  };
}
