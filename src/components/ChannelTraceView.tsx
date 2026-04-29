import type { AtcTraceItem, ControlMode, FeedItem } from "@/types/atc";
import { Activity, BrainCircuit, RadioTower, SatelliteDish } from "lucide-react";
import type { ReactNode } from "react";

export function ChannelTraceView({ feed, trace, mode }: { feed: FeedItem[]; trace: AtcTraceItem[]; mode: ControlMode }) {
  return (
    <section className="grid min-h-0 flex-1 grid-rows-2 gap-4 bg-[#edf5fb] p-4 lg:grid-cols-2 lg:grid-rows-1">
      <Panel
        eyebrow={
          <>
            <RadioTower size={15} />
            Sydney Approach frequency
          </>
        }
        title="Channel"
        statusIcon={<SatelliteDish size={14} />}
        status={mode === "ai" ? "AI ATC instance transmitting" : "Traditional controller transmitting"}
      >
        {feed.length === 0 ? (
          <EmptyState label="frequency idle" text="Start the simulation or generate traffic to hear aircraft check-ins and readbacks." />
        ) : null}

        <div className="space-y-2">
          {feed.map((item, index) => (
            <article
              key={item.id}
              className={`feed-arrival grid gap-2 border px-3 py-3 xl:grid-cols-[76px_145px_120px_1fr] ${
                index === 0 ? "border-blue-600/30 bg-blue-50" : "border-blue-900/[.08] bg-white/70"
              }`}
            >
              <span className="font-mono text-xs text-slate-500">{item.time}</span>
              <span className="font-mono text-xs text-slate-700">
                {item.from} {"->"} {item.to}
              </span>
              <span className="font-mono text-xs font-semibold uppercase text-blue-700">{item.heading}</span>
              <span className="text-sm text-slate-800">{item.text}</span>
            </article>
          ))}
        </div>
      </Panel>

      <Panel
        eyebrow={
          <>
            <Activity size={15} />
            Supervisor trace
          </>
        }
        title="Trace"
        statusIcon={<BrainCircuit size={14} />}
        status={mode === "ai" ? "AI decisions visible" : "Traditional decisions visible"}
      >
        {trace.length === 0 ? (
          <EmptyState label="trace idle" text="Start a scenario to see planner, scheduler, resolver, and radio agent activity." />
        ) : null}

        <div className="space-y-2">
          {trace.map((item, index) => (
            <article
              key={item.id}
              className={`grid gap-2 border px-3 py-3 xl:grid-cols-[76px_145px_125px_1fr] ${
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
      </Panel>
    </section>
  );
}

function Panel({
  eyebrow,
  title,
  status,
  statusIcon,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  status: string;
  statusIcon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden border border-blue-900/10 bg-white/80 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-900/10 bg-white/85 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-blue-700">{eyebrow}</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        </div>
        <div className="flex items-center gap-2 border border-blue-900/10 bg-blue-50/70 px-3 py-2 font-mono text-xs uppercase text-blue-800">
          {statusIcon}
          {status}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}

function EmptyState({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid h-full min-h-[220px] place-items-center border border-dashed border-blue-900/15 bg-blue-50/50 text-center">
      <div>
        <div className="font-mono text-xs uppercase text-slate-500">{label}</div>
        <div className="mt-2 text-sm text-slate-600">{text}</div>
      </div>
    </div>
  );
}

function borderClass(level: AtcTraceItem["level"]) {
  if (level === "warning") return "border-amber-500/30 bg-amber-50/70";
  if (level === "decision") return "border-blue-900/[.08] bg-white/80";
  return "border-blue-900/[.08] bg-white/70";
}
