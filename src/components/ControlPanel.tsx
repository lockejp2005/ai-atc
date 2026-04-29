import type { ControlMode, DemoSpeed, TrafficLevel } from "@/types/atc";
import { Gauge, Pause, Play, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";

type ControlPanelProps = {
  traffic: TrafficLevel;
  mode: ControlMode;
  running: boolean;
  demoSpeed: DemoSpeed;
  onTraffic: (value: TrafficLevel) => void;
  onMode: (value: ControlMode) => void;
  onDemoSpeed: (value: DemoSpeed) => void;
  onGenerate: () => void;
  onRunning: (value: boolean) => void;
  onReset: () => void;
  onCompare: () => void;
};

export function ControlPanel({
  traffic,
  mode,
  running,
  demoSpeed,
  onTraffic,
  onMode,
  onDemoSpeed,
  onGenerate,
  onRunning,
  onReset,
  onCompare,
}: ControlPanelProps) {
  return (
    <section
      aria-label="Scenario controls"
      className="flex min-w-0 flex-wrap items-center gap-2 border border-blue-900/10 bg-white/75 px-2 py-2 shadow-sm backdrop-blur xl:flex-nowrap"
    >
      <div className="hidden items-center gap-2 pr-1 text-xs font-semibold text-slate-600 2xl:flex">
        <SlidersHorizontal size={15} className="text-blue-700" />
        Scenario
      </div>
      <div className="grid min-w-[286px] grid-cols-4 gap-1 border border-blue-900/10 bg-blue-50/60 p-1">
        {[
          ["light", "8/hr"],
          ["medium", "20/hr"],
          ["heavy", "40/hr"],
          ["peak", "60/hr"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => onTraffic(value as TrafficLevel)}
            className={`h-8 px-2 text-xs uppercase transition ${
              traffic === value ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid min-w-[198px] grid-cols-2 gap-1 border border-blue-900/10 bg-blue-50/60 p-1">
        {(["traditional", "ai"] as const).map((value) => (
          <button
            key={value}
            onClick={() => onMode(value)}
            className={`h-8 px-2 text-xs uppercase transition ${
              mode === value
                ? "bg-blue-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            {value === "ai" ? "AI ATC" : "Traditional"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 border border-blue-900/10 bg-blue-50/60 p-1">
        <Gauge size={14} className="mx-1 shrink-0 text-blue-700" aria-hidden="true" />
        {([1, 5, 15, 30] as const).map((value) => (
          <button
            key={value}
            onClick={() => onDemoSpeed(value)}
            className={`h-8 min-w-9 px-2 font-mono text-xs transition ${
              demoSpeed === value
                ? "bg-blue-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            {value}x
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 border border-blue-900/10 bg-blue-50/60 p-1">
        <button
          onClick={onGenerate}
          className="grid h-8 w-8 place-items-center text-slate-600 transition hover:bg-white hover:text-blue-700"
          aria-label="Generate scenario"
          title="Generate scenario"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => onRunning(!running)}
          className="grid h-8 w-8 place-items-center text-slate-600 transition hover:bg-white hover:text-blue-700"
          aria-label={running ? "Pause demo" : "Start demo"}
          title={running ? "Pause demo" : "Start demo"}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={onReset}
          className="grid h-8 w-8 place-items-center text-slate-600 transition hover:bg-white hover:text-blue-700"
          aria-label="Reset scenario"
          title="Reset scenario"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onCompare}
          className="h-8 bg-blue-700 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600"
        >
          Compare
        </button>
      </div>
    </section>
  );
}
