import type { ControlMode, FeedItem, RadioInstructionRequest } from "@/types/atc";

export type AtcAgentResponse = {
  directive: FeedItem;
  transmission: FeedItem;
};

export function buildAtcAgentResponse(request: RadioInstructionRequest): AtcAgentResponse {
  const supervisor = request.mode === "ai" ? "Supervisor Agent" : "Coordinator";
  const controller = controllerName(request.mode);
  const radioInstruction = normalizeControllerPhrase(request.instruction, request.callsign);

  return {
    directive: {
      id: agentMessageId(request, "directive"),
      time: "",
      callsign: request.callsign,
      from: supervisor,
      to: controller,
      heading: "DIRECTIVE",
      text: `Issue ${request.heading.toLowerCase()} for the current sim-time sequence and keep the readback short: ${request.instruction}`,
      kind: "directive",
    },
    transmission: {
      id: agentMessageId(request, "tx"),
      time: "",
      callsign: request.callsign,
      from: controller,
      to: request.callsign,
      heading: request.heading,
      text: radioInstruction,
      kind: "instruction",
    },
  };
}

export function buildPilotReadback(request: RadioInstructionRequest): FeedItem {
  const controller = controllerName(request.mode);
  const pilot = request.mode === "ai" ? `${request.callsign} AI Pilot` : request.callsign;

  return {
    id: agentMessageId(request, "rx"),
    time: "",
    callsign: request.callsign,
    from: pilot,
    to: controller,
    heading: "READBACK",
    text: `${readbackPhrase(request.instruction, request.callsign)}, ${request.callsign}.`,
    kind: "readback",
    voiceProfile: pilotVoiceProfile(request.callsign),
  };
}

export function validateRadioInstructionRequest(value: unknown): RadioInstructionRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<RadioInstructionRequest>;
  if (
    candidate.type !== "agentExchange" ||
    typeof candidate.aircraftId !== "string" ||
    typeof candidate.callsign !== "string" ||
    typeof candidate.heading !== "string" ||
    typeof candidate.instruction !== "string" ||
    (candidate.mode !== "ai" && candidate.mode !== "traditional")
  ) {
    return null;
  }

  return {
    type: "agentExchange",
    aircraftId: candidate.aircraftId,
    callsign: candidate.callsign,
    heading: candidate.heading,
    instruction: candidate.instruction,
    mode: candidate.mode,
    issuedAt: typeof candidate.issuedAt === "number" ? candidate.issuedAt : undefined,
  };
}

function controllerName(mode: ControlMode) {
  return mode === "ai" ? "Comms Agent" : "SYD APP";
}

function normalizeControllerPhrase(instruction: string, callsign: string) {
  if (instruction.startsWith(callsign)) return instruction;
  return `${callsign}, ${instruction.charAt(0).toLowerCase()}${instruction.slice(1)}`;
}

function readbackPhrase(instruction: string, callsign: string) {
  const withoutCallsign = instruction.replace(new RegExp(`^${callsign},\\s*`, "i"), "");
  return withoutCallsign
    .replace(/^expect/i, "Expect")
    .replace(/^continue/i, "Continuing")
    .replace(/^turn heading/i, "Heading")
    .replace(/^vector/i, "Vectoring")
    .replace(/^cleared/i, "Cleared")
    .replace(/^enter/i, "Entering")
    .replace(/runway 34L sequence/i, "sequence")
    .replace(/runway 34L/i, "runway three four left")
    .replace(/(\d+)ft/g, "$1 feet")
    .replace(/(\d+)kt/g, "$1 knots")
    .replace(/, /g, ", ");
}

function pilotVoiceProfile(callsign: string) {
  const profiles = [
    "Chicago-area Midwest, flatter vowels, steady medium pace",
    "Minnesota-influenced Midwest, slightly brighter vowels, polite clipped readback",
    "Ohio Valley Midwest, neutral General American, firm confident cadence",
    "Iowa/Nebraska Midwest, relaxed vowels, measured unhurried rhythm",
    "Wisconsin-influenced Midwest, lightly rounded vowels, calm cockpit delivery",
    "Missouri/Illinois Midwest, warmer tone, practical and concise phrasing",
  ];
  const index = callsign.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % profiles.length;
  return profiles[index];
}

function agentMessageId(request: RadioInstructionRequest, suffix: string) {
  return `${request.aircraftId}-${request.heading}-${suffix}-${crypto.randomUUID()}`;
}
