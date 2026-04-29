import { formatDuration } from "@/lib/format";
import type { ControlMode, Metrics } from "@/types/atc";
import { Gauge } from "lucide-react";

export function MetricsPanel({ metrics, mode }: { metrics: Metrics; mode: ControlMode }) {
  const comparison =
    mode === "ai"
      ? [
          ["Avg delay", "3.1m", "6.8m"],
          ["Holding", "8m", "42m"],
          ["Fuel", "5.9t", "8.4t"],
        ]
      : [
          ["Avg delay", "6.8m", "3.1m"],
          ["Holding", "42m", "8m"],
          ["Fuel", "8.4t", "5.9t"],
        ];

  return (
    <section className="border border-blue-900/10 bg-white/80 p-3 shadow-sm backdrop-blur">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Gauge size={16} className="text-blue-700" />
        Metrics
      </h2>
      <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-1 2xl:grid-cols-2">
        <Metric label="Avg delay" value={formatDuration(metrics.avgDelay)} />
        <Metric label="Holding" value={formatDuration(metrics.totalHolding)} />
        <Metric label="Fuel burn" value={`${metrics.fuelBurn}kg`} />
        <Metric label="Fuel flow" value={`${metrics.fuelBurnPerMinute}kg/min`} />
        <Metric label="Conflicts" value={String(metrics.conflicts)} />
        <Metric label="Completed" value={String(metrics.landed)} />
        <Metric label="Runway use" value={`${metrics.runwayUtilisation}%`} />
      </div>
      <div className="mt-3 space-y-1 border-t border-blue-900/10 pt-3">
        {comparison.map(([label, active, other]) => (
          <div key={label} className="grid grid-cols-[1fr_52px_52px] text-xs">
            <span className="text-slate-600">{label}</span>
            <span className="text-blue-800">{active}</span>
            <span className="text-slate-500">{other}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-blue-900/[.08] bg-blue-50/50 p-2">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-900">{value}</div>
    </div>
  );
}
