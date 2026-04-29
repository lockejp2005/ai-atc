import { formatSimulationClock, simulationSecondsFromSlot } from "@/lib/simulation";
import type { Aircraft, AtcPlanAssignment, AtcTraceItem, ControlMode, Phase, Point } from "@/types/atc";

export type SupervisorAssessment = {
  activeCount: number;
  arrivals: number;
  departures: number;
  finalCount: number;
  holdingCount: number;
  lowFuelCount: number;
  closestPair?: {
    callsigns: string;
    distance: number;
    verticalFeet: number;
  };
  nextRunwayDemand?: {
    callsign: string;
    secondsToSlot: number;
  };
};

export type LlmSupervisorResult = {
  assignments: AtcPlanAssignment[];
  trace: AtcTraceItem[];
};

type LlmSupervisorDecision = {
  aircraftId: string;
  assignedPhase: Phase;
  heading: number;
  altitude: number;
  speed: number;
  instruction: string;
  reason: string;
};

type LlmSupervisorResponse = {
  situation: string;
  decisions: LlmSupervisorDecision[];
};

const SUPERVISOR_MODEL = process.env.OPENAI_SUPERVISOR_MODEL || "gpt-5.5";
const SUPERVISOR_TIMEOUT_MS = Number(process.env.OPENAI_SUPERVISOR_TIMEOUT_MS ?? 2500);
const SUPERVISOR_REVIEW_LIMIT = Number(process.env.OPENAI_SUPERVISOR_REVIEW_LIMIT ?? 18);

export const SUPERVISOR_SYSTEM_PROMPT = [
  "You are the AI Supervisor Agent for a Sydney Approach terminal ATC simulation.",
  "Think like a calm, experienced human approach supervisor: scan the full traffic picture, preserve runway sequence, protect wake spacing, avoid unsafe late turns, prefer simple clearances, and intervene when aircraft are too close, too high, too fast, fuel-constrained, or nearing runway demand.",
  "You are not writing a chat answer. You must return JSON matching the supplied schema.",
  "Use the deterministic candidate plan as the baseline safety plan. Revise only when the live state justifies it.",
  "Every decision must be operationally flyable by the simulation: choose one of the allowed phases, one heading 0-359, an altitude in feet, a speed in knots, a concise ATC instruction, and a reason explaining your human-style judgment.",
  "Do not invent aircraft. Return one decision for each candidate clearance. Keep runway 34L as the active runway.",
].join(" ");

type SupervisorVectorPlan = {
  name: string;
  assignedPhase: Phase;
  target: Point;
  speed: number;
  altitude: number;
  trackMiles: number;
};

export function assessTrafficState(aircraft: Aircraft[], activeSeconds = 0): SupervisorAssessment {
  const active = aircraft.filter((ac) => ac.phase !== "landed" && ac.phase !== "departed");
  const closestPair = findClosestPair(active);
  const nextRunwayDemand = active
    .map((ac) => ({ ac, slotSeconds: simulationSecondsFromSlot(ac.slot) }))
    .filter((item): item is { ac: Aircraft; slotSeconds: number } => item.slotSeconds !== null)
    .sort((a, b) => a.slotSeconds - b.slotSeconds || a.ac.sequence - b.ac.sequence)[0];

  return {
    activeCount: active.length,
    arrivals: active.filter((ac) => ac.operation === "arrival").length,
    departures: active.filter((ac) => ac.operation === "departure").length,
    finalCount: active.filter((ac) => ac.phase === "final").length,
    holdingCount: active.filter((ac) => ac.phase === "holding").length,
    lowFuelCount: active.filter((ac) => ac.fuel / ac.initialFuel < 0.4).length,
    closestPair,
    nextRunwayDemand: nextRunwayDemand
      ? {
          callsign: nextRunwayDemand.ac.callsign,
          secondsToSlot: nextRunwayDemand.slotSeconds - activeSeconds,
        }
      : undefined,
  };
}

export function supervisorAssessmentTrace(assessment: SupervisorAssessment): AtcTraceItem {
  const trafficMix = `${assessment.arrivals} arrivals / ${assessment.departures} departures`;
  const pressure = assessment.nextRunwayDemand
    ? `${assessment.nextRunwayDemand.callsign} runway demand in ${Math.round(assessment.nextRunwayDemand.secondsToSlot)}s`
    : "No runway demand inside the current plan";
  const closest = assessment.closestPair
    ? `Closest pair ${assessment.closestPair.callsigns}: ${assessment.closestPair.distance.toFixed(1)} map units, ${assessment.closestPair.verticalFeet}ft vertical`
    : "No live pair to separate";

  return {
    id: `supervisor-assess-${assessment.activeCount}-${assessment.arrivals}-${assessment.departures}`,
    time: formatSimulationClock(0),
    agent: "Supervisor Agent",
    action: "state.assess",
    target: "terminal airspace",
    summary: `${assessment.activeCount} live tracks assessed`,
    detail: `${trafficMix}; ${assessment.finalCount} final, ${assessment.holdingCount} holding, ${assessment.lowFuelCount} fuel-priority. ${pressure}. ${closest}.`,
    level: assessment.closestPair && assessment.closestPair.distance < 6 && assessment.closestPair.verticalFeet < 1000 ? "warning" : "info",
  };
}

export async function runLlmSupervisor(
  aircraft: Aircraft[],
  mode: ControlMode,
  assignments: AtcPlanAssignment[],
  trace: AtcTraceItem[],
  activeSeconds = 0,
): Promise<LlmSupervisorResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || mode !== "ai" || assignments.length === 0) {
    return { assignments, trace };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(500, SUPERVISOR_TIMEOUT_MS));
    const reviewAssignments = selectSupervisorReviewAssignments(aircraft, assignments, activeSeconds);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: SUPERVISOR_MODEL,
        input: [
          { role: "system", content: SUPERVISOR_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify(buildSupervisorPayload(aircraft, reviewAssignments, activeSeconds)),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "atc_supervisor_decisions",
            strict: true,
            schema: supervisorResponseSchema(),
          },
        },
      }),
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return {
        assignments,
        trace: [
          llmTrace("supervisor.model_error", "LLM supervisor unavailable", `OpenAI returned ${response.status}; deterministic supervisor plan remains active.`, "warning"),
          ...trace,
        ],
      };
    }

    const body = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = extractResponseText(body);
    if (!text) throw new Error("Missing supervisor response text");

    const parsed = JSON.parse(text) as LlmSupervisorResponse;
    const revised = applySupervisorDecisions(assignments, parsed.decisions);

    return {
      assignments: revised,
      trace: [
        llmTrace("supervisor.model_decision", "LLM supervisor revised clearances", `${parsed.situation} Reviewed ${reviewAssignments.length}/${assignments.length} highest-pressure tracks.`, "decision"),
        ...trace,
      ],
    };
  } catch (error) {
    return {
      assignments,
      trace: [
        llmTrace(
          "supervisor.model_fallback",
          "LLM supervisor fallback",
          error instanceof Error ? `${error.message}; deterministic supervisor plan remains active after ${SUPERVISOR_TIMEOUT_MS}ms budget.` : "Deterministic supervisor plan remains active.",
          "warning",
        ),
        ...trace,
      ],
    };
  }
}

export function describeSupervisorDecision(
  ac: Aircraft,
  sequence: number,
  delay: number,
  mode: ControlMode,
  vectorPlan: SupervisorVectorPlan,
  assessment: SupervisorAssessment,
) {
  if (mode !== "ai") return "";

  const position = `${Math.round(ac.x)},${Math.round(ac.y)}`;
  const slotPressure = delay > 240 ? "high slot pressure" : delay > 90 ? "moderate slot pressure" : "low slot pressure";
  const traffic = `${assessment.arrivals}A/${assessment.departures}D`;
  const fuel = ac.fuel / ac.initialFuel < 0.4 ? "fuel-priority track" : "normal fuel";

  return `Supervisor Agent assessed ${ac.callsign} at ${position}, ${ac.phase}, ${ac.altitude}ft/${ac.speed}kt, ${fuel}; selected ${vectorPlan.name} for sequence ${sequence} under ${slotPressure} in ${traffic} traffic. Target ${Math.round(vectorPlan.target.x)},${Math.round(vectorPlan.target.y)}, ${vectorPlan.altitude}ft, ${vectorPlan.speed}kt, ${Math.round(vectorPlan.trackMiles)} track-mi.`;
}

function buildSupervisorPayload(aircraft: Aircraft[], assignments: AtcPlanAssignment[], activeSeconds: number) {
  const assessment = assessTrafficState(aircraft, activeSeconds);
  const assignmentById = new Map(assignments.map((assignment) => [assignment.aircraftId, assignment]));

  return {
    simTime: formatSimulationClock(activeSeconds),
    activeRunway: "34L",
    assessment,
    aircraft: aircraft
      .filter((ac) => assignmentById.has(ac.id))
      .map((ac) => ({
        id: ac.id,
        callsign: ac.callsign,
        operation: ac.operation,
        wake: ac.wake,
        phase: ac.phase,
        position: { x: round(ac.x), y: round(ac.y) },
        altitude: Math.round(ac.altitude),
        speed: Math.round(ac.speed),
        heading: Math.round(ac.heading),
        fuelRatio: round(ac.fuel / ac.initialFuel),
        slot: ac.slot,
        sequence: ac.sequence,
        currentInstruction: ac.instruction,
      })),
    candidateClearances: assignments.map((assignment) => ({
      aircraftId: assignment.aircraftId,
      sequence: assignment.sequence,
      slot: assignment.slot,
      assignedPhase: assignment.assignedPhase,
      heading: Math.round(assignment.heading),
      altitude: Math.round(assignment.altitude),
      speed: Math.round(assignment.speed),
      instruction: assignment.instruction,
      reason: assignment.reason,
      delay: Math.round(assignment.delay),
    })),
    allowedPhases: ["scheduled", "arrival", "holding", "vectoring", "downwind", "base", "final", "departure", "takeoff", "climb", "outbound"],
  };
}

function selectSupervisorReviewAssignments(aircraft: Aircraft[], assignments: AtcPlanAssignment[], activeSeconds: number) {
  if (assignments.length <= SUPERVISOR_REVIEW_LIMIT) return assignments;

  const aircraftById = new Map(aircraft.map((ac) => [ac.id, ac]));

  return assignments
    .slice()
    .sort((a, b) => pressureScore(b, aircraftById.get(b.aircraftId), activeSeconds) - pressureScore(a, aircraftById.get(a.aircraftId), activeSeconds))
    .slice(0, SUPERVISOR_REVIEW_LIMIT);
}

function pressureScore(assignment: AtcPlanAssignment, ac: Aircraft | undefined, activeSeconds: number) {
  if (!ac) return 0;

  const slotSeconds = simulationSecondsFromSlot(assignment.slot);
  const secondsToSlot = slotSeconds === null ? 9999 : slotSeconds - activeSeconds;
  const runwayPressure = Math.max(0, 900 - Math.abs(secondsToSlot)) / 10;
  const terminalPressure = ac.phase === "final" ? 120 : ac.phase === "base" ? 95 : ac.phase === "downwind" ? 70 : ac.phase === "holding" ? 60 : 0;
  const fuelPressure = ac.fuel / ac.initialFuel < 0.4 ? 80 : 0;
  const delayPressure = Math.min(80, assignment.delay / 4);
  const departurePressure = ac.operation === "departure" && secondsToSlot < 180 ? 45 : 0;

  return runwayPressure + terminalPressure + fuelPressure + delayPressure + departurePressure;
}

function supervisorResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["situation", "decisions"],
    properties: {
      situation: { type: "string" },
      decisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["aircraftId", "assignedPhase", "heading", "altitude", "speed", "instruction", "reason"],
          properties: {
            aircraftId: { type: "string" },
            assignedPhase: {
              type: "string",
              enum: ["scheduled", "arrival", "holding", "vectoring", "downwind", "base", "final", "departure", "takeoff", "climb", "outbound"],
            },
            heading: { type: "integer" },
            altitude: { type: "integer" },
            speed: { type: "integer" },
            instruction: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    },
  };
}

function applySupervisorDecisions(assignments: AtcPlanAssignment[], decisions: LlmSupervisorDecision[]) {
  const decisionsById = new Map(decisions.map((decision) => [decision.aircraftId, decision]));

  return assignments.map((assignment) => {
    const decision = decisionsById.get(assignment.aircraftId);
    if (!decision) return assignment;

    return {
      ...assignment,
      assignedPhase: decision.assignedPhase,
      heading: clampInt(decision.heading, 0, 359),
      altitude: clampInt(decision.altitude, 0, 15000),
      speed: clampInt(decision.speed, 0, 290),
      instruction: decision.instruction.trim() || assignment.instruction,
      reason: `LLM Supervisor: ${decision.reason.trim() || assignment.reason}`,
    };
  });
}

function extractResponseText(body: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (typeof body.output_text === "string") return body.output_text;
  return body.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
}

function llmTrace(action: string, summary: string, detail: string, level: AtcTraceItem["level"]): AtcTraceItem {
  return {
    id: `${action}-${Date.now()}`,
    time: formatSimulationClock(0),
    agent: "LLM Supervisor Agent",
    action,
    target: "terminal airspace",
    summary,
    detail,
    level,
  };
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function findClosestPair(aircraft: Aircraft[]): SupervisorAssessment["closestPair"] {
  let closest: SupervisorAssessment["closestPair"];

  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const first = aircraft[i];
      const second = aircraft[j];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const verticalFeet = Math.abs(first.altitude - second.altitude);
      if (!closest || distance < closest.distance) {
        closest = {
          callsigns: `${first.callsign}/${second.callsign}`,
          distance,
          verticalFeet,
        };
      }
    }
  }

  return closest;
}
