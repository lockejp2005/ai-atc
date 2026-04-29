"use client";

import { AircraftInspector } from "@/components/AircraftInspector";
import { AppHeader } from "@/components/AppHeader";
import { ChannelTraceView } from "@/components/ChannelTraceView";
import { ControlPanel } from "@/components/ControlPanel";
import { MetricsPanel } from "@/components/MetricsPanel";
import { RadarMap } from "@/components/RadarMap";
import { SequencePanel } from "@/components/SequencePanel";
import { applySpokenAtcInstruction } from "@/lib/atc-clearance";
import { formatDuration } from "@/lib/format";
import { calculateMetrics, formatSimulationClock, generateAircraft, moveAircraftAt, simulationSecondsFromSlot } from "@/lib/simulation";
import type { Aircraft, AppView, AtcPlanAssignment, AtcTraceItem, ControlMode, DemoSpeed, FeedItem, Phase, RadioInstructionRequest, TrafficLevel } from "@/types/atc";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const REAL_TICK_MS = 1000;
const RADIO_INTER_MESSAGE_GAP_MS = 650;
const INTERNAL_DIRECTIVE_GAP_MS = 750;
const ROUTINE_CLEARANCE_INTERVAL_SECONDS = 90;
const RADIO_STALE_SECONDS = 90;
const MAX_RADIO_QUEUE_ITEMS = 10;
let feedItemSequence = 0;
type RadioQueueItem = FeedItem | RadioInstructionRequest;
type SimulationTimeRef = { current: number };
type DemoSpeedRef = { current: DemoSpeed };

export default function Home() {
  const [traffic, setTraffic] = useState<TrafficLevel>("light");
  const [mode, setMode] = useState<ControlMode>("ai");
  const [view, setView] = useState<AppView>("radar");
  const [demoSpeed, setDemoSpeed] = useState<DemoSpeed>(5);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [trace, setTrace] = useState<AtcTraceItem[]>([]);
  const [planned, setPlanned] = useState(false);
  const [talkingAircraftId, setTalkingAircraftId] = useState("");
  const radioQueueRef = useRef<RadioQueueItem[]>([]);
  const runwayClearanceIdsRef = useRef<Set<string>>(new Set());
  const radioActiveRef = useRef(false);
  const radioStoppedRef = useRef(false);
  const simulationTimeRef = useRef(0);
  const demoSpeedRef = useRef<DemoSpeed>(demoSpeed);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    demoSpeedRef.current = demoSpeed;
  }, [demoSpeed]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setTick((value) => {
        const activeTick = value + demoSpeed;
        simulationTimeRef.current = activeTick;
        setAircraft((current) => {
          const updated = current.map((ac) => moveAircraftAt(ac, mode, demoSpeed, activeTick));
          const events = createFeedEvents(current, updated, mode, value, activeTick, runwayClearanceIdsRef.current);
          if (events.length) {
            radioQueueRef.current = enqueueRadioEvents(radioQueueRef.current, events, activeTick);
          }
          return updated;
        });
        return activeTick;
      });
    }, REAL_TICK_MS);

    return () => window.clearInterval(id);
  }, [demoSpeed, mode, running]);

  useEffect(() => {
    if (!running || radioActiveRef.current) return;
    radioStoppedRef.current = false;
    radioActiveRef.current = true;

    runRadioScheduler(radioQueueRef, radioStoppedRef, simulationTimeRef, demoSpeedRef, audioRef, setAircraft, setFeed, setTrace, setTalkingAircraftId).finally(() => {
      radioActiveRef.current = false;
      setTalkingAircraftId("");
    });

    return () => {
      radioStoppedRef.current = true;
      radioActiveRef.current = false;
      setTalkingAircraftId("");
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [running]);

  const radarAircraft = aircraft.filter((ac) => ac.phase !== "scheduled" && ac.phase !== "landed" && ac.phase !== "departed");
  const selected = aircraft.find((ac) => ac.id === selectedId);
  const metrics = useMemo(() => calculateMetrics(aircraft, mode), [aircraft, mode]);
  const simulationClock = useMemo(() => formatSimulationClock(tick), [tick]);
  const arrivalCue = useMemo(() => arrivalDueCue(aircraft, tick), [aircraft, tick]);

  const resetScenario = () => {
    setAircraft([]);
    setSelectedId("");
    setFeed([]);
    setTrace([]);
    setPlanned(false);
    setTalkingAircraftId("");
    radioQueueRef.current = [];
    runwayClearanceIdsRef.current = new Set();
    radioStoppedRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    simulationTimeRef.current = 0;
    setTick(0);
    setRunning(false);
  };

  const setSimulationRunning = async (value: boolean) => {
    if (value && !running && aircraft.length === 0) {
      const generated = generateAircraft(mode, traffic);
      const planned = await planAircraft(generated, mode);
      const syncedAircraft = synchronizeAircraftToClock(planned.aircraft, mode, 0);
      setAircraft(syncedAircraft);
      setTrace([...planned.trace].reverse());
      setPlanned(true);
      radioQueueRef.current = createInitialQueue(syncedAircraft, mode, 0);
      runwayClearanceIdsRef.current = new Set();
      simulationTimeRef.current = 0;
      setTick(0);
    } else if (value && !running && feed.length === 0) {
      const plannedResult = planned ? { aircraft, trace: [] } : await planAircraft(aircraft, mode);
      const syncedAircraft = synchronizeAircraftToClock(plannedResult.aircraft, mode, tick);
      setAircraft(syncedAircraft);
      if (plannedResult.trace.length) setTrace((items) => [[...plannedResult.trace].reverse(), items].flat().slice(0, 160));
      setPlanned(true);
      radioQueueRef.current = pruneRadioQueue([...radioQueueRef.current, ...createInitialQueue(syncedAircraft, mode, tick)], tick);
    }
    if (!value) {
      radioStoppedRef.current = true;
      setTalkingAircraftId("");
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
    }
    setRunning(value);
  };

  const compare = () => {
    const generated = generateAircraft("ai", traffic);
    setMode("ai");
    planAircraft(generated, "ai").then((planned) => {
      const syncedAircraft = synchronizeAircraftToClock(planned.aircraft, "ai", 0);
      setAircraft(syncedAircraft);
      setSelectedId("");
      setFeed([]);
      setTrace([...planned.trace].reverse());
      setPlanned(true);
      setTalkingAircraftId("");
      radioQueueRef.current = createInitialQueue(syncedAircraft, "ai", 0);
      runwayClearanceIdsRef.current = new Set();
      radioStoppedRef.current = false;
      simulationTimeRef.current = 0;
      setTick(0);
      setRunning(true);
    });
  };

  return (
    <main className="min-h-screen bg-[#eef5fb] text-slate-900">
      <div className="flex min-h-screen flex-col">
        <AppHeader
          view={view}
          onView={setView}
          controls={
            <ControlPanel
              mode={mode}
              running={running}
              demoSpeed={demoSpeed}
              traffic={traffic}
              onTraffic={(value) => {
                setTraffic(value);
                resetScenario();
              }}
              onDemoSpeed={setDemoSpeed}
              onMode={(value) => {
                setMode(value);
                resetScenario();
              }}
              onGenerate={resetScenario}
              onRunning={setSimulationRunning}
              onReset={resetScenario}
              onCompare={compare}
            />
          }
        />

        {view === "channel" ? (
          <ChannelTraceView feed={feed} trace={trace} mode={mode} />
        ) : (
        <section className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-h-[560px] xl:min-h-0">
            <div className="relative h-full min-h-[560px] overflow-hidden border border-blue-900/10 bg-[#edf5fb] shadow-sm xl:min-h-0">
              <div className="pointer-events-none absolute left-4 top-4 z-[500] flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 border border-blue-600/15 bg-white/85 px-3 py-2 font-mono text-xs text-blue-950 shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,.45)]" />
                LIVE TERMINAL RADAR
                <span className="text-blue-900">{simulationClock} SYD</span>
                <span className="text-slate-500">T+{formatDuration(tick)}</span>
                <span className="text-blue-700">
                  {arrivalCue ? `${arrivalCue.label} ${arrivalCue.aircraft.callsign} ${arrivalCue.aircraft.slot}` : "NEXT --"}
                </span>
                <span className="text-blue-700">{demoSpeed}x demo</span>
              </div>
              <div className="pointer-events-none absolute right-4 top-4 z-[500] grid grid-cols-3 gap-2 text-[11px]">
                <span className="border border-blue-600/15 bg-white/85 px-2 py-1 font-mono text-blue-800 shadow-sm">RWY 34L</span>
                <span className="border border-blue-600/15 bg-white/85 px-2 py-1 font-mono text-blue-800 shadow-sm">MERGE_34L</span>
                <span className="border border-blue-600/15 bg-white/85 px-2 py-1 font-mono text-slate-600 shadow-sm">HOLD FIXES</span>
              </div>
              {selected ? (
                <div className="absolute left-4 top-20 z-[520]">
                  <AircraftInspector aircraft={selected} mode={mode} onClose={() => setSelectedId("")} variant="drawer" />
                </div>
              ) : null}
              <RadarMap aircraft={radarAircraft} selectedId={selected?.id} talkingAircraftId={talkingAircraftId} onSelect={setSelectedId} />
            </div>
          </div>

          <aside className="grid min-h-0 gap-4 xl:grid-rows-[auto_1fr]">
            <MetricsPanel metrics={metrics} mode={mode} />
            <SequencePanel aircraft={aircraft} selectedId={selected?.id} onSelect={setSelectedId} />
          </aside>
        </section>
        )}
      </div>
    </main>
  );
}

async function planAircraft(aircraft: Aircraft[], mode: ControlMode) {
  const response = await fetch("/api/atc/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aircraft, mode }),
  });

  if (!response.ok) {
    return {
      aircraft,
      trace: [
        createTraceItem("Supervisor Agent", "plan.error", "YSSY", "Planning request failed", "The existing track state was kept because the plan API did not return assignments.", "warning"),
      ],
    };
  }

  const body = (await response.json()) as { assignments: AtcPlanAssignment[]; trace?: AtcTraceItem[] };
  return {
    aircraft: applyAtcPlan(aircraft, body.assignments),
    trace: body.trace ?? [],
  };
}

function applyAtcPlan(aircraft: Aircraft[], assignments: AtcPlanAssignment[]) {
  const byAircraftId = new Map(assignments.map((assignment) => [assignment.aircraftId, assignment]));

  return aircraft.map((ac) => {
    const assignment = byAircraftId.get(ac.id);
    if (!assignment) return ac;

    return {
      ...ac,
      sequence: assignment.sequence,
      slot: assignment.slot,
      instruction: assignment.instruction,
      reason: assignment.reason,
      delay: assignment.delay,
      phase: ac.phase === "scheduled" ? ac.phase : assignment.assignedPhase,
      releasePhase: releasePhaseForAssignment(assignment.assignedPhase, ac.releasePhase),
      routeLeg: assignment.routeLeg,
      heading: assignment.heading,
      altitude: assignment.altitude,
      speed: assignment.speed,
    };
  });
}

function releasePhaseForAssignment(phase: Phase, fallback: Aircraft["releasePhase"]): Aircraft["releasePhase"] {
  if (phase === "scheduled" || phase === "landed" || phase === "departed") return fallback;
  return phase;
}

function synchronizeAircraftToClock(aircraft: Aircraft[], mode: ControlMode, tick: number) {
  return aircraft.map((ac) => moveAircraftAt(ac, mode, 0, tick));
}

function arrivalDueCue(aircraft: Aircraft[], tick: number) {
  const next = aircraft
    .filter((ac) => ac.operation === "arrival" && ac.phase !== "landed" && ac.phase !== "departed")
    .map((ac) => ({ ac, slotSeconds: simulationSecondsFromSlot(ac.slot) }))
    .filter((item): item is { ac: Aircraft; slotSeconds: number } => item.slotSeconds !== null)
    .sort((a, b) => a.slotSeconds - b.slotSeconds || a.ac.sequence - b.ac.sequence)[0];

  if (!next) return null;

  return {
    aircraft: next.ac,
    label: next.slotSeconds <= tick + 20 ? "DUE" : "NEXT",
  };
}

function createFeedEvents(
  previous: Aircraft[],
  next: Aircraft[],
  mode: ControlMode,
  previousTick: number,
  activeTick: number,
  issuedRunwayClearances: Set<string>,
): RadioQueueItem[] {
  const runwayEvents = createRunwayClearanceEvents(next, mode, activeTick, issuedRunwayClearances);
  const runwayAircraftIds = new Set(runwayEvents.map((event) => event.aircraftId));
  const phaseEvents = next
    .flatMap((ac) => {
      const before = previous.find((item) => item.id === ac.id);
      if (!before || before.phase === ac.phase || ac.phase === "landed" || ac.phase === "departed") return [];
      if (runwayAircraftIds.has(ac.id)) return [];
      return [createAgentExchangeRequest(ac, phaseHeading(ac), `${ac.callsign} now ${ac.phase}; ${ac.instruction}`, mode, activeTick)];
    })
    .filter(Boolean) as RadioQueueItem[];

  const shouldIssueClearance =
    Math.floor(activeTick / ROUTINE_CLEARANCE_INTERVAL_SECONDS) !== Math.floor(previousTick / ROUTINE_CLEARANCE_INTERVAL_SECONDS);
  if (!shouldIssueClearance) return [...runwayEvents, ...phaseEvents];

  const selected = selectClearanceAircraft(next, activeTick);
  if (!selected || runwayAircraftIds.has(selected.id)) return [...runwayEvents, ...phaseEvents];

  const before = previous.find((item) => item.id === selected.id);
  return [createAgentExchangeRequest(selected, clearanceHeading(before, selected, mode), selected.instruction, mode, activeTick), ...runwayEvents, ...phaseEvents];
}

function createRunwayClearanceEvents(aircraft: Aircraft[], mode: ControlMode, activeTick: number, issuedRunwayClearances: Set<string>) {
  return aircraft.flatMap((ac) => {
    if (ac.phase === "landed" || ac.phase === "departed") return [];

    if (ac.operation === "departure" && ac.phase === "takeoff") {
      const clearanceKey = `${ac.id}:takeoff`;
      if (issuedRunwayClearances.has(clearanceKey)) return [];

      issuedRunwayClearances.add(clearanceKey);
      return [createAgentExchangeRequest(ac, "CLEARED TAKEOFF", ac.instruction, mode, activeTick)];
    }

    if (ac.operation === "arrival" && ac.phase === "final" && landingClearanceDue(ac, activeTick)) {
      const clearanceKey = `${ac.id}:land`;
      if (issuedRunwayClearances.has(clearanceKey)) return [];

      issuedRunwayClearances.add(clearanceKey);
      return [createAgentExchangeRequest(ac, "CLEARED TO LAND", `${ac.callsign}, runway three four left, cleared to land`, mode, activeTick)];
    }

    return [];
  });
}

function landingClearanceDue(ac: Aircraft, activeTick: number) {
  const slotSeconds = simulationSecondsFromSlot(ac.slot);
  if (slotSeconds === null) return false;
  return activeTick >= slotSeconds - 75 && activeTick <= slotSeconds + 20;
}

function selectClearanceAircraft(aircraft: Aircraft[], activeTick: number) {
  return aircraft
    .filter((ac) => ac.phase !== "scheduled" && ac.phase !== "landed" && ac.phase !== "departed")
    .map((ac) => ({ ac, slotSeconds: simulationSecondsFromSlot(ac.slot) }))
    .filter((item): item is { ac: Aircraft; slotSeconds: number } => item.slotSeconds !== null)
    .filter((item) => item.slotSeconds >= activeTick - 90 && item.slotSeconds <= activeTick + 900)
    .sort((a, b) => {
      const aOverdue = a.slotSeconds <= activeTick ? 0 : 1;
      const bOverdue = b.slotSeconds <= activeTick ? 0 : 1;
      return aOverdue - bOverdue || a.slotSeconds - b.slotSeconds || a.ac.sequence - b.ac.sequence;
    })[0]?.ac;
}

function createInitialQueue(aircraft: Aircraft[], mode: ControlMode, tick: number): RadioQueueItem[] {
  const visible = aircraft.filter((ac) => ac.phase !== "scheduled").slice(0, 4);
  const system: FeedItem = {
    id: `${tick}-system-${feedItemSequence++}`,
    time: "",
    callsign: "YSSY",
    from: mode === "ai" ? "AI ATC" : "SYD APP",
    to: "ALL",
    heading: "CHANNEL OPEN",
    text:
      mode === "ai"
        ? `AI-generated voice. AI ATC instance online; sequencing ${aircraft.length} mixed arrivals and departures on the Sydney terminal channel.`
        : `AI-generated voice. Sydney Approach online; sequencing ${aircraft.length} mixed arrivals and departures on the Sydney terminal channel.`,
    kind: "system",
  };

  return [
    system,
    ...visible.map((ac) =>
      createAgentExchangeRequest(
        ac,
        "CHECK-IN",
        ac.operation === "departure"
          ? `${ac.callsign}, identified, expect runway 34L departure release ${ac.slot}`
          : `${ac.callsign}, identified, expect ILS 34L, slot ${ac.slot}`,
        mode,
        tick,
      ),
    ),
  ];
}

function createAgentExchangeRequest(ac: Aircraft, heading: string, instruction: string, mode: ControlMode, issuedAt: number): RadioInstructionRequest {
  return {
    type: "agentExchange",
    aircraftId: ac.id,
    callsign: ac.callsign,
    heading,
    instruction,
    mode,
    issuedAt,
  };
}

async function runRadioScheduler(
  radioQueueRef: { current: RadioQueueItem[] },
  radioStoppedRef: { current: boolean },
  simulationTimeRef: SimulationTimeRef,
  demoSpeedRef: DemoSpeedRef,
  audioRef: { current: HTMLAudioElement | null },
  setAircraft: Dispatch<SetStateAction<Aircraft[]>>,
  setFeed: Dispatch<SetStateAction<FeedItem[]>>,
  setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>,
  setTalkingAircraftId: Dispatch<SetStateAction<string>>,
) {
  while (!radioStoppedRef.current) {
    const nextTransmission = radioQueueRef.current.shift();
    if (!nextTransmission) {
      await waitRadioGap(250, demoSpeedRef, 80);
      continue;
    }

    if (isRadioInstructionRequest(nextTransmission)) {
      if (radioRequestIsStale(nextTransmission, simulationTimeRef)) continue;

      await runAgentExchange(nextTransmission, radioStoppedRef, simulationTimeRef, demoSpeedRef, audioRef, setAircraft, setFeed, setTrace, setTalkingAircraftId);
      continue;
    }

    const stampedTransmission = { ...nextTransmission, time: currentRadioTime(simulationTimeRef.current) };
    setFeed((items) => [stampedTransmission, ...items].slice(0, 80));

    if (stampedTransmission.kind === "directive") {
      await waitRadioGap(INTERNAL_DIRECTIVE_GAP_MS, demoSpeedRef);
      continue;
    }

    await playTransmission(stampedTransmission, radioStoppedRef, demoSpeedRef, audioRef, setTalkingAircraftId);
    await waitRadioGap(RADIO_INTER_MESSAGE_GAP_MS, demoSpeedRef);
  }
}

async function runAgentExchange(
  request: RadioInstructionRequest,
  radioStoppedRef: { current: boolean },
  simulationTimeRef: SimulationTimeRef,
  demoSpeedRef: DemoSpeedRef,
  audioRef: { current: HTMLAudioElement | null },
  setAircraft: Dispatch<SetStateAction<Aircraft[]>>,
  setFeed: Dispatch<SetStateAction<FeedItem[]>>,
  setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>,
  setTalkingAircraftId: Dispatch<SetStateAction<string>>,
) {
  const requestIsCurrent = () => !radioStoppedRef.current && !radioRequestIsStale(request, simulationTimeRef);

  emitTrace(
    createTraceItem(
      "Radio Agent",
      "agent.call",
      request.callsign,
      `Directive requested for ${request.callsign}`,
      `Heading ${request.heading}; instruction context: ${request.instruction}`,
      "info",
      simulationTimeRef.current,
    ),
    setTrace,
  );
  const atcResponse = await fetchAtcDirective(request);
  if (!atcResponse || !requestIsCurrent()) return;

  emitTrace(
    createTraceItem(
      "Radio Agent",
      "agent.response",
      request.callsign,
      `Directive generated for ${request.callsign}`,
      atcResponse.transmission.text,
      "decision",
      simulationTimeRef.current,
    ),
    setTrace,
  );
  emitTransmission(atcResponse.directive, setFeed, simulationTimeRef);
  await waitRadioGap(INTERNAL_DIRECTIVE_GAP_MS, demoSpeedRef);
  if (!requestIsCurrent()) return;

  const transmission = emitTransmission(atcResponse.transmission, setFeed, simulationTimeRef);
  applyAtcInstructionToAircraft(request, transmission, simulationTimeRef.current, setAircraft, setTrace);
  await playTransmission(transmission, radioStoppedRef, demoSpeedRef, audioRef, setTalkingAircraftId, requestIsCurrent);
  await waitRadioGap(RADIO_INTER_MESSAGE_GAP_MS, demoSpeedRef);
  if (!requestIsCurrent()) return;

  emitTrace(
    createTraceItem(
      "Pilot Readback Agent",
      "agent.call",
      request.callsign,
      `Readback requested for ${request.callsign}`,
      "The pilot response agent was called after the controller transmission completed.",
      "info",
      simulationTimeRef.current,
    ),
    setTrace,
  );
  const readback = await fetchPilotReadback(request);
  if (!readback || !requestIsCurrent()) return;

  emitTrace(
    createTraceItem("Pilot Readback Agent", "agent.response", request.callsign, `Readback accepted for ${request.callsign}`, readback.text, "decision", simulationTimeRef.current),
    setTrace,
  );
  const emittedReadback = emitTransmission(readback, setFeed, simulationTimeRef);
  await playTransmission(emittedReadback, radioStoppedRef, demoSpeedRef, audioRef, setTalkingAircraftId, requestIsCurrent);
  await waitRadioGap(RADIO_INTER_MESSAGE_GAP_MS, demoSpeedRef);
}

function emitTransmission(item: FeedItem, setFeed: Dispatch<SetStateAction<FeedItem[]>>, simulationTimeRef: SimulationTimeRef) {
  const stampedTransmission = { ...item, id: item.id || `radio-${feedItemSequence++}`, time: currentRadioTime(simulationTimeRef.current) };
  setFeed((items) => [stampedTransmission, ...items].slice(0, 80));
  return stampedTransmission;
}

function applyAtcInstructionToAircraft(
  request: RadioInstructionRequest,
  transmission: FeedItem,
  activeSeconds: number,
  setAircraft: Dispatch<SetStateAction<Aircraft[]>>,
  setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>,
) {
  setAircraft((current) => {
    const result = applySpokenAtcInstruction(current, request, transmission, activeSeconds);
    if (result.clearance) {
      const applied = result.clearance;
      const targets = [
        applied.heading !== undefined ? `heading ${String(Math.round(applied.heading)).padStart(3, "0")}` : "",
        applied.altitude !== undefined ? `${applied.altitude}ft` : "",
        applied.speed !== undefined ? `${applied.speed}kt` : "",
        applied.phase ? applied.phase : "",
      ].filter(Boolean);

      emitTrace(
        createTraceItem(
          "Flight Director",
          "clearance.applied",
          applied.callsign,
          `${applied.callsign} accepted spoken ATC clearance`,
          `Parsed "${applied.text}" into ${targets.join(", ")} and updated the aircraft control state.`,
          "decision",
          activeSeconds,
        ),
        setTrace,
      );
    }

    return result.aircraft;
  });
}

function emitTrace(item: AtcTraceItem, setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>) {
  setTrace((items) => [item, ...items].slice(0, 160));
}

async function fetchAtcDirective(request: RadioInstructionRequest) {
  const response = await fetch("/api/atc/directive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) return null;
  return (await response.json()) as { directive: FeedItem; transmission: FeedItem };
}

async function fetchPilotReadback(request: RadioInstructionRequest) {
  const response = await fetch("/api/pilot/readback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { readback: FeedItem };
  return body.readback;
}

async function playTransmission(
  item: FeedItem,
  radioStoppedRef: { current: boolean },
  demoSpeedRef: DemoSpeedRef,
  audioRef: { current: HTMLAudioElement | null },
  setTalkingAircraftId: Dispatch<SetStateAction<string>>,
  shouldContinue: () => boolean = () => !radioStoppedRef.current,
) {
  const spokenText = radioPhraseology(item);
  if (!shouldContinue()) return;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), maxTtsFetchMs(demoSpeedRef.current));
    const intervalId = window.setInterval(() => {
      if (!shouldContinue()) controller.abort();
    }, 100);
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText, kind: item.kind, voiceProfile: item.voiceProfile, demoSpeed: demoSpeedRef.current }),
      signal: controller.signal,
    }).finally(() => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    });

    if (!shouldContinue()) return;
    if (!response.ok) throw new Error("OpenAI TTS request failed");

    const blob = await response.blob();
    if (!shouldContinue()) return;

    const url = URL.createObjectURL(blob);
    setTalkingAircraftId(item.kind === "readback" ? item.callsign : "");
    await playAudioUrl(url, audioRef, radioPlaybackRate(demoSpeedRef.current), maxRadioPlaybackMs(demoSpeedRef.current), shouldContinue);
    URL.revokeObjectURL(url);
  } catch {
    if (!shouldContinue()) return;

    setTalkingAircraftId(item.kind === "readback" ? item.callsign : "");
    await speakTransmissionFallback(item, demoSpeedRef, shouldContinue);
  } finally {
    setTalkingAircraftId("");
  }
}

function radioPhraseology(item: FeedItem) {
  if (item.kind === "system") return item.text;
  if (item.kind === "readback") return item.text;
  if (item.kind === "instruction") return item.text;
  return item.text;
}

function playAudioUrl(
  url: string,
  audioRef: { current: HTMLAudioElement | null },
  playbackRate: number,
  maxPlaybackMs: number,
  shouldContinue: () => boolean,
) {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url);
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      resolve();
    };

    audioRef.current?.pause();
    audioRef.current = audio;
    audio.playbackRate = playbackRate;
    audio.onended = finish;
    audio.onerror = finish;
    const timeoutId = window.setTimeout(finish, maxPlaybackMs);
    const intervalId = window.setInterval(() => {
      if (!shouldContinue()) finish();
    }, 100);
    audio.play().catch(finish);
  });
}

function speakTransmissionFallback(item: FeedItem, demoSpeedRef: DemoSpeedRef, shouldContinue: () => boolean) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    if (!shouldContinue()) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(radioPhraseology(item));
    const speechRate = item.kind === "readback" ? 1.22 : item.kind === "instruction" ? 1.16 : 1.08;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      resolve();
    };

    utterance.rate = Math.min(4, speechRate * radioPlaybackRate(demoSpeedRef.current));
    utterance.pitch = item.kind === "readback" ? 1.05 : 0.9;
    utterance.volume = 0.85;
    utterance.onend = finish;
    utterance.onerror = finish;
    const timeoutId = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      finish();
    }, maxRadioPlaybackMs(demoSpeedRef.current));
    const intervalId = window.setInterval(() => {
      if (!shouldContinue()) {
        window.speechSynthesis.cancel();
        finish();
      }
    }, 100);
    window.speechSynthesis.speak(utterance);
  });
}

function currentRadioTime(elapsedSeconds = 0) {
  return formatSimulationClock(elapsedSeconds);
}

function createTraceItem(
  agent: string,
  action: string,
  target: string,
  summary: string,
  detail: string,
  level: AtcTraceItem["level"],
  elapsedSeconds = 0,
): AtcTraceItem {
  return {
    id: `trace-${Date.now()}-${feedItemSequence++}-${action}`,
    time: currentRadioTime(elapsedSeconds),
    agent,
    action,
    target,
    summary,
    detail,
    level,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitRadioGap(ms: number, demoSpeedRef: DemoSpeedRef, minimumMs = 35) {
  return wait(Math.max(minimumMs, Math.round(ms / Math.max(1, demoSpeedRef.current))));
}

function radioPlaybackRate(speed: DemoSpeed) {
  if (speed <= 1) return 1;
  return Math.min(4, 1 + Math.log2(speed) * 0.7);
}

function maxRadioPlaybackMs(speed: DemoSpeed) {
  if (speed >= 30) return 800;
  if (speed >= 15) return 1200;
  if (speed >= 5) return 3200;
  return 12000;
}

function maxTtsFetchMs(speed: DemoSpeed) {
  if (speed >= 30) return 900;
  if (speed >= 15) return 1200;
  if (speed >= 5) return 2600;
  return 10000;
}

function pruneRadioQueue(queue: RadioQueueItem[], activeTick: number) {
  const fresh = queue.filter((item) => !isRadioInstructionRequest(item) || activeTick - (item.issuedAt ?? activeTick) <= RADIO_STALE_SECONDS);
  if (fresh.length <= MAX_RADIO_QUEUE_ITEMS) return fresh;

  const urgent = fresh.filter(isRunwayClearanceRequest).slice(0, MAX_RADIO_QUEUE_ITEMS);
  const regularSlots = MAX_RADIO_QUEUE_ITEMS - urgent.length;
  const regular = regularSlots > 0 ? fresh.filter((item) => !isRunwayClearanceRequest(item)).slice(-regularSlots) : [];
  return [...urgent, ...regular];
}

function enqueueRadioEvents(queue: RadioQueueItem[], events: RadioQueueItem[], activeTick: number) {
  const urgent = events.filter(isRunwayClearanceRequest);
  const normal = events.filter((item) => !isRunwayClearanceRequest(item));
  return pruneRadioQueue([...urgent, ...queue, ...normal], activeTick);
}

function radioRequestIsStale(request: RadioInstructionRequest, simulationTimeRef: SimulationTimeRef) {
  return simulationTimeRef.current - (request.issuedAt ?? simulationTimeRef.current) > RADIO_STALE_SECONDS;
}

function isRadioInstructionRequest(item: RadioQueueItem): item is RadioInstructionRequest {
  return "type" in item && item.type === "agentExchange";
}

function isRunwayClearanceRequest(item: RadioQueueItem): item is RadioInstructionRequest {
  return isRadioInstructionRequest(item) && (item.heading === "CLEARED TAKEOFF" || item.heading === "CLEARED TO LAND");
}

function phaseHeading(ac: Aircraft) {
  if (ac.phase === "final") return "APPROACH";
  if (ac.phase === "holding") return "HOLD";
  if (ac.phase === "departure" || ac.phase === "takeoff") return "DEPARTURE";
  if (ac.phase === "climb" || ac.phase === "outbound") return "CLIMB";
  return ac.phase.toUpperCase();
}

function clearanceHeading(before: Aircraft | undefined, ac: Aircraft, mode: ControlMode) {
  const headingChange = before ? Math.abs(normalizeHeading(ac.heading - before.heading)) : 0;
  if (headingChange >= 8) return `TURN ${String(Math.round(ac.heading)).padStart(3, "0")}`;
  if (before && before.altitude - ac.altitude >= 120) return "DESCEND";
  if (ac.phase === "departure" || ac.phase === "takeoff") return "DEPARTURE";
  if (ac.phase === "climb" || ac.phase === "outbound") return "CLIMB";
  if (ac.phase === "final") return "APPROACH";
  if (ac.phase === "holding") return "HOLD";
  return mode === "ai" ? "PLAN ISSUED" : "VECTOR ISSUED";
}

function normalizeHeading(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? 360 - normalized : normalized;
}
