"use client";

import { AircraftInspector } from "@/components/AircraftInspector";
import { AppHeader } from "@/components/AppHeader";
import { ChannelView } from "@/components/ChannelView";
import { ControlPanel } from "@/components/ControlPanel";
import { MetricsPanel } from "@/components/MetricsPanel";
import { RadarMap } from "@/components/RadarMap";
import { SequencePanel } from "@/components/SequencePanel";
import { TraceView } from "@/components/TraceView";
import { formatDuration } from "@/lib/format";
import { calculateMetrics, generateAircraft, moveAircraftAt } from "@/lib/simulation";
import type { Aircraft, AppView, AtcPlanAssignment, AtcTraceItem, ControlMode, DemoSpeed, FeedItem, Phase, RadioInstructionRequest, TrafficLevel } from "@/types/atc";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const REAL_TICK_MS = 900;
const RADIO_INTER_MESSAGE_GAP_MS = 650;
const INTERNAL_DIRECTIVE_GAP_MS = 750;
const ROUTINE_CLEARANCE_INTERVAL_SECONDS = 90;
let feedItemSequence = 0;
type RadioQueueItem = FeedItem | RadioInstructionRequest;

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
  const radioActiveRef = useRef(false);
  const radioStoppedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setTick((value) => {
        const activeTick = value + demoSpeed;
        setAircraft((current) => {
          const updated = current.map((ac) => moveAircraftAt(ac, mode, demoSpeed, activeTick));
          const events = createFeedEvents(current, updated, mode, value, activeTick);
          if (events.length) radioQueueRef.current.push(...events);
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

    runRadioScheduler(radioQueueRef, radioStoppedRef, audioRef, setFeed, setTrace, setTalkingAircraftId).finally(() => {
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

  const resetScenario = () => {
    setAircraft([]);
    setSelectedId("");
    setFeed([]);
    setTrace([]);
    setPlanned(false);
    setTalkingAircraftId("");
    radioQueueRef.current = [];
    radioStoppedRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setTick(0);
    setRunning(false);
  };

  const setSimulationRunning = async (value: boolean) => {
    if (value && !running && aircraft.length === 0) {
      const generated = generateAircraft(mode, traffic);
      const planned = await planAircraft(generated, mode);
      setAircraft(planned.aircraft);
      setTrace([...planned.trace].reverse());
      setPlanned(true);
      radioQueueRef.current = createInitialQueue(planned.aircraft, mode, 0);
      setTick(0);
    } else if (value && !running && feed.length === 0) {
      const plannedResult = planned ? { aircraft, trace: [] } : await planAircraft(aircraft, mode);
      setAircraft(plannedResult.aircraft);
      if (plannedResult.trace.length) setTrace((items) => [[...plannedResult.trace].reverse(), items].flat().slice(0, 160));
      setPlanned(true);
      radioQueueRef.current.push(...createInitialQueue(plannedResult.aircraft, mode, tick));
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
      setAircraft(planned.aircraft);
      setSelectedId("");
      setFeed([]);
      setTrace([...planned.trace].reverse());
      setPlanned(true);
      setTalkingAircraftId("");
      radioQueueRef.current = createInitialQueue(planned.aircraft, "ai", 0);
      radioStoppedRef.current = false;
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
          <ChannelView feed={feed} mode={mode} />
        ) : view === "trace" ? (
          <TraceView trace={trace} mode={mode} />
        ) : (
        <section className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-h-[560px] xl:min-h-0">
            <div className="relative h-full min-h-[560px] overflow-hidden border border-blue-900/10 bg-[#edf5fb] shadow-sm xl:min-h-0">
              <div className="pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-3 border border-blue-600/15 bg-white/85 px-3 py-2 font-mono text-xs text-blue-950 shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,.45)]" />
                LIVE TERMINAL RADAR
                <span className="text-slate-500">T+{formatDuration(tick)}</span>
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

function createFeedEvents(previous: Aircraft[], next: Aircraft[], mode: ControlMode, previousTick: number, activeTick: number): RadioQueueItem[] {
  const phaseEvents = next
    .flatMap((ac) => {
      const before = previous.find((item) => item.id === ac.id);
      if (!before || before.phase === ac.phase || ac.phase === "landed" || ac.phase === "departed") return [];
      return [createAgentExchangeRequest(ac, phaseHeading(ac), `${ac.callsign} now ${ac.phase}; ${ac.instruction}`, mode)];
    })
    .filter(Boolean) as RadioQueueItem[];

  const shouldIssueClearance =
    Math.floor(activeTick / ROUTINE_CLEARANCE_INTERVAL_SECONDS) !== Math.floor(previousTick / ROUTINE_CLEARANCE_INTERVAL_SECONDS);
  if (!shouldIssueClearance) return phaseEvents;

  const active = next.filter((ac) => ac.phase !== "scheduled" && ac.phase !== "landed" && ac.phase !== "departed");
  const selected = active[Math.floor(activeTick / ROUTINE_CLEARANCE_INTERVAL_SECONDS) % Math.max(active.length, 1)];
  if (!selected) return phaseEvents;

  const before = previous.find((item) => item.id === selected.id);
  return [createAgentExchangeRequest(selected, clearanceHeading(before, selected, mode), selected.instruction, mode), ...phaseEvents];
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
      ),
    ),
  ];
}

function createAgentExchangeRequest(ac: Aircraft, heading: string, instruction: string, mode: ControlMode): RadioInstructionRequest {
  return {
    type: "agentExchange",
    aircraftId: ac.id,
    callsign: ac.callsign,
    heading,
    instruction,
    mode,
  };
}

async function runRadioScheduler(
  radioQueueRef: { current: RadioQueueItem[] },
  radioStoppedRef: { current: boolean },
  audioRef: { current: HTMLAudioElement | null },
  setFeed: Dispatch<SetStateAction<FeedItem[]>>,
  setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>,
  setTalkingAircraftId: Dispatch<SetStateAction<string>>,
) {
  while (!radioStoppedRef.current) {
    const nextTransmission = radioQueueRef.current.shift();
    if (!nextTransmission) {
      await wait(250);
      continue;
    }

    if (isRadioInstructionRequest(nextTransmission)) {
      await runAgentExchange(nextTransmission, radioStoppedRef, audioRef, setFeed, setTrace, setTalkingAircraftId);
      continue;
    }

    const stampedTransmission = { ...nextTransmission, time: currentRadioTime() };
    setFeed((items) => [stampedTransmission, ...items].slice(0, 80));

    if (stampedTransmission.kind === "directive") {
      await wait(INTERNAL_DIRECTIVE_GAP_MS);
      continue;
    }

    await playTransmission(stampedTransmission, audioRef, setTalkingAircraftId);
    await wait(RADIO_INTER_MESSAGE_GAP_MS);
  }
}

async function runAgentExchange(
  request: RadioInstructionRequest,
  radioStoppedRef: { current: boolean },
  audioRef: { current: HTMLAudioElement | null },
  setFeed: Dispatch<SetStateAction<FeedItem[]>>,
  setTrace: Dispatch<SetStateAction<AtcTraceItem[]>>,
  setTalkingAircraftId: Dispatch<SetStateAction<string>>,
) {
  emitTrace(
    createTraceItem(
      "Radio Agent",
      "agent.call",
      request.callsign,
      `Directive requested for ${request.callsign}`,
      `Heading ${request.heading}; instruction context: ${request.instruction}`,
      "info",
    ),
    setTrace,
  );
  const atcResponse = await fetchAtcDirective(request);
  if (!atcResponse || radioStoppedRef.current) return;

  emitTrace(
    createTraceItem(
      "Radio Agent",
      "agent.response",
      request.callsign,
      `Directive generated for ${request.callsign}`,
      atcResponse.transmission.text,
      "decision",
    ),
    setTrace,
  );
  emitTransmission(atcResponse.directive, setFeed);
  await wait(INTERNAL_DIRECTIVE_GAP_MS);
  if (radioStoppedRef.current) return;

  const transmission = emitTransmission(atcResponse.transmission, setFeed);
  await playTransmission(transmission, audioRef, setTalkingAircraftId);
  await wait(RADIO_INTER_MESSAGE_GAP_MS);
  if (radioStoppedRef.current) return;

  emitTrace(
    createTraceItem(
      "Pilot Readback Agent",
      "agent.call",
      request.callsign,
      `Readback requested for ${request.callsign}`,
      "The pilot response agent was called after the controller transmission completed.",
      "info",
    ),
    setTrace,
  );
  const readback = await fetchPilotReadback(request);
  if (!readback || radioStoppedRef.current) return;

  emitTrace(
    createTraceItem("Pilot Readback Agent", "agent.response", request.callsign, `Readback accepted for ${request.callsign}`, readback.text, "decision"),
    setTrace,
  );
  const emittedReadback = emitTransmission(readback, setFeed);
  await playTransmission(emittedReadback, audioRef, setTalkingAircraftId);
  await wait(RADIO_INTER_MESSAGE_GAP_MS);
}

function emitTransmission(item: FeedItem, setFeed: Dispatch<SetStateAction<FeedItem[]>>) {
  const stampedTransmission = { ...item, id: item.id || `radio-${feedItemSequence++}`, time: currentRadioTime() };
  setFeed((items) => [stampedTransmission, ...items].slice(0, 80));
  return stampedTransmission;
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

async function playTransmission(item: FeedItem, audioRef: { current: HTMLAudioElement | null }, setTalkingAircraftId: Dispatch<SetStateAction<string>>) {
  const spokenText = radioPhraseology(item);

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText, kind: item.kind, voiceProfile: item.voiceProfile }),
    });

    if (!response.ok) throw new Error("OpenAI TTS request failed");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    setTalkingAircraftId(item.kind === "readback" ? item.callsign : "");
    await playAudioUrl(url, audioRef);
    URL.revokeObjectURL(url);
  } catch {
    setTalkingAircraftId(item.kind === "readback" ? item.callsign : "");
    await speakTransmissionFallback(item);
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

function playAudioUrl(url: string, audioRef: { current: HTMLAudioElement | null }) {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

function speakTransmissionFallback(item: FeedItem) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(radioPhraseology(item));
    utterance.rate = item.kind === "readback" ? 1.22 : item.kind === "instruction" ? 1.16 : 1.08;
    utterance.pitch = item.kind === "readback" ? 1.05 : 0.9;
    utterance.volume = 0.85;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function currentRadioTime() {
  return new Date().toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Australia/Sydney",
  });
}

function createTraceItem(
  agent: string,
  action: string,
  target: string,
  summary: string,
  detail: string,
  level: AtcTraceItem["level"],
): AtcTraceItem {
  return {
    id: `trace-${Date.now()}-${feedItemSequence++}-${action}`,
    time: currentRadioTime(),
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

function isRadioInstructionRequest(item: RadioQueueItem): item is RadioInstructionRequest {
  return "type" in item && item.type === "agentExchange";
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
