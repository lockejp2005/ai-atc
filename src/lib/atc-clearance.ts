import type { Aircraft, FeedItem, Phase, RadioInstructionRequest } from "@/types/atc";

type ParsedAtcClearance = {
  heading?: number;
  altitude?: number;
  speed?: number;
  phase?: Exclude<Phase, "scheduled" | "landed" | "departed">;
  routeLeg?: number;
};

export type AppliedAtcClearance = ParsedAtcClearance & {
  aircraftId: string;
  callsign: string;
  text: string;
};

export function applySpokenAtcInstruction(
  aircraft: Aircraft[],
  request: RadioInstructionRequest,
  transmission: FeedItem,
  activeSeconds: number,
): { aircraft: Aircraft[]; clearance: AppliedAtcClearance | null } {
  if (transmission.kind !== "instruction") return { aircraft, clearance: null };

  const clearance = parseSpokenAtcInstruction(transmission.text, request);
  if (!clearance) return { aircraft, clearance: null };

  let changed = false;
  const updated = aircraft.map((ac) => {
    if (ac.id !== request.aircraftId) return ac;
    changed = true;

    const nextPhase = clearance.phase ?? ac.phase;
    const releasePhase = nextReleasePhase(nextPhase, ac.releasePhase);

    return {
      ...ac,
      phase: ac.phase === "scheduled" ? ac.phase : nextPhase,
      releasePhase,
      routeLeg: clearance.routeLeg ?? ac.routeLeg,
      heading: clearance.heading ?? ac.heading,
      altitude: clearance.altitude ?? ac.altitude,
      speed: clearance.speed ?? ac.speed,
      clearedHeading: clearance.heading ?? ac.clearedHeading,
      clearedAltitude: clearance.altitude ?? ac.clearedAltitude,
      clearedSpeed: clearance.speed ?? ac.clearedSpeed,
      instruction: transmission.text,
      lastAtcInstruction: transmission.text,
      lastAtcInstructionAt: activeSeconds,
    };
  });

  return {
    aircraft: changed ? updated : aircraft,
    clearance: changed ? { ...clearance, aircraftId: request.aircraftId, callsign: request.callsign, text: transmission.text } : null,
  };
}

function parseSpokenAtcInstruction(text: string, request: RadioInstructionRequest): ParsedAtcClearance | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("identified")) return null;

  const clearance: ParsedAtcClearance = {};
  const heading = parseHeading(normalized);
  const altitude = parseAltitude(normalized);
  const speed = parseSpeed(normalized);
  const phase = parsePhase(normalized, request);

  if (heading !== undefined) clearance.heading = heading;
  if (altitude !== undefined) clearance.altitude = altitude;
  if (speed !== undefined) clearance.speed = speed;
  if (phase) {
    clearance.phase = phase;
    clearance.routeLeg = routeLegForPhase(phase);
  }

  return Object.keys(clearance).length ? clearance : null;
}

function parseHeading(text: string) {
  if (text.includes("runway heading")) return 335;

  const match = text.match(/(?:turn|fly|heading)\s+(?:heading\s+)?(\d{2,3})/);
  if (!match) return undefined;

  const heading = Number(match[1]);
  if (!Number.isFinite(heading)) return undefined;
  return ((heading % 360) + 360) % 360;
}

function parseAltitude(text: string) {
  const match = text.match(/(?:descend|climb|maintain|cross[^,]*?at)\s+(\d{3,5})\s*(?:ft|feet)?/);
  if (!match) return undefined;

  const altitude = Number(match[1]);
  return Number.isFinite(altitude) ? altitude : undefined;
}

function parseSpeed(text: string) {
  const match = text.match(/(?:reduce|maintain)\s+(\d{2,3})\s*(?:kt|knots)/);
  if (!match) return undefined;

  const speed = Number(match[1]);
  return Number.isFinite(speed) ? speed : undefined;
}

function parsePhase(text: string, request: RadioInstructionRequest): ParsedAtcClearance["phase"] {
  if (text.includes("cleared for takeoff")) return "takeoff";
  if (text.includes("line up") || text.includes("hold short")) return "departure";
  if (text.includes("contact departures") || text.includes("climb")) return "climb";
  if (text.includes("cleared to land") || text.includes("cleared ils") || text.includes("four mile final")) return "final";
  if (text.includes("turn base")) return "base";
  if (text.includes("downwind")) return "downwind";
  if (text.includes("hold")) return "holding";
  if (request.heading.startsWith("TURN") || text.includes("turn heading")) return "vectoring";
  return undefined;
}

function nextReleasePhase(phase: Phase, fallback: Aircraft["releasePhase"]): Aircraft["releasePhase"] {
  if (phase === "scheduled" || phase === "landed" || phase === "departed") return fallback;
  return phase;
}

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
