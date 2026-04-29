export type TrafficLevel = "light" | "medium" | "heavy" | "peak";
export type ControlMode = "traditional" | "ai";
export type DemoSpeed = 1 | 5 | 15 | 30;
export type Operation = "arrival" | "departure";
export type Phase =
  | "scheduled"
  | "arrival"
  | "holding"
  | "vectoring"
  | "downwind"
  | "base"
  | "final"
  | "landed"
  | "departure"
  | "takeoff"
  | "climb"
  | "outbound"
  | "departed";
export type WakeCategory = "medium" | "heavy";
export type AppView = "radar" | "channel";

export type Point = {
  x: number;
  y: number;
};

export type Aircraft = {
  id: string;
  callsign: string;
  airline: string;
  type: string;
  operation: Operation;
  wake: WakeCategory;
  origin: string;
  destination: string;
  x: number;
  y: number;
  altitude: number;
  speed: number;
  heading: number;
  phase: Phase;
  releasePhase: Exclude<Phase, "scheduled" | "landed" | "departed">;
  releaseAt: number;
  routeLeg: number;
  streamIndex: number;
  delay: number;
  holding: number;
  fuel: number;
  initialFuel: number;
  sequence: number;
  slot: string;
  instruction: string;
  reason: string;
  clearedHeading?: number;
  clearedAltitude?: number;
  clearedSpeed?: number;
  lastAtcInstruction?: string;
  lastAtcInstructionAt?: number;
  trail: Point[];
};

export type FeedItem = {
  id: string;
  time: string;
  callsign: string;
  from: string;
  to: string;
  heading: string;
  text: string;
  kind: "directive" | "instruction" | "readback" | "system";
  voiceProfile?: string;
};

export type RadioInstructionRequest = {
  type: "agentExchange";
  aircraftId: string;
  callsign: string;
  heading: string;
  instruction: string;
  mode: ControlMode;
  issuedAt?: number;
};

export type AtcPlanAssignment = {
  aircraftId: string;
  sequence: number;
  slot: string;
  instruction: string;
  reason: string;
  delay: number;
  assignedPhase: Phase;
  routeLeg: number;
  heading: number;
  altitude: number;
  speed: number;
};

export type AtcTraceLevel = "info" | "decision" | "warning";

export type AtcTraceItem = {
  id: string;
  time: string;
  agent: string;
  action: string;
  target: string;
  summary: string;
  detail: string;
  level: AtcTraceLevel;
};

export type Metrics = {
  avgDelay: number;
  totalHolding: number;
  fuelBurn: number;
  fuelBurnPerMinute: number;
  landed: number;
  conflicts: number;
  runwayUtilisation: number;
};
