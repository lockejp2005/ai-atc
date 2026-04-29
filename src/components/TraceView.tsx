import type { AtcTraceItem, ControlMode } from "@/types/atc";
import { Activity, BrainCircuit } from "lucide-react";

export function TraceView({ trace, mode }: { trace: AtcTraceItem[]; mode: ControlMode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#edf5fb] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-blue-900/10 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-blue-700">
            <Activity size={15} />
            Supervisor trace
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Trace</h2>
        </div>
        <div className="flex items-center gap-2 border border-blue-900/10 bg-blue-50/70 px-3 py-2 font-mono text-xs uppercase text-blue-800">
          <BrainCircuit size={14} />
          {mode === "ai" ? "AI decisions visible" : "Traditional decisions visible"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto border border-blue-900/10 bg-white/80 p-3 shadow-sm backdrop-blur">
        {trace.length === 0 ? (
          <div className="grid h-full min-h-[420px] place-items-center border border-dashed border-blue-900/15 bg-blue-50/50 text-center">
            <div>
              <div className="font-mono text-xs uppercase text-slate-500">trace idle</div>
              <div className="mt-2 text-sm text-slate-600">Start a scenario to see planner, scheduler, resolver, and radio agent activity.</div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {trace.map((item, index) => (
            <article
              key={item.id}
              className={`grid gap-3 border px-4 py-3 md:grid-cols-[92px_180px_160px_1fr] ${
                index === 0 ? "border-blue-600/30 bg-blue-50" : borderClass(item.level)
              }`}
            >
              <span className="font-mono text-xs text-slate-500">{item.time}</span>
              <span className="font-mono text-xs font-semibold text-slate-700">{item.agent}</span>
              <span className="font-mono text-xs uppercase text-blue-700">{item.action}</span>
              <span>
                <span className="block text-sm font-medium text-slate-900">{item.summary}</span>
                <span className="mt-1 block text-sm text-slate-600">{item.detail}</span>
                <span className="mt-2 inline-block border border-blue-900/10 bg-blue-50 px-2 py-1 font-mono text-[11px] uppercase text-blue-800">{item.target}</span>
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function borderClass(level: AtcTraceItem["level"]) {
  if (level === "warning") return "border-amber-500/30 bg-amber-50/70";
  if (level === "decision") return "border-blue-900/[.08] bg-white/80";
  return "border-blue-900/[.08] bg-white/70";
}
