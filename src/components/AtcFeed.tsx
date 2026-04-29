import type { ControlMode, FeedItem } from "@/types/atc";
import { RadioTower } from "lucide-react";

export function AtcFeed({ feed, mode }: { feed: FeedItem[]; mode: ControlMode }) {
  return (
    <section className="flex min-h-0 flex-col border border-blue-900/10 bg-white/80 p-3 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <RadioTower size={16} className="text-blue-700" />
          Live Comms
        </h2>
        <span className="font-mono text-xs uppercase text-blue-700">{mode === "ai" ? "AI planner live" : "controller live"}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {feed.length === 0 ? (
          <div className="grid h-full min-h-[180px] place-items-center border border-dashed border-blue-900/15 bg-blue-50/50 text-center">
            <div>
              <div className="font-mono text-xs uppercase text-slate-500">monitoring frequency</div>
              <div className="mt-2 text-sm text-slate-600">New clearances appear here as they are issued.</div>
            </div>
          </div>
        ) : null}
        {feed.map((item, index) => (
          <div
            key={item.id}
            className={`feed-arrival grid grid-cols-[72px_132px_minmax(98px,138px)_1fr] gap-3 border px-3 py-2 font-mono text-xs ${
              index === 0 ? "border-blue-600/30 bg-blue-50" : "border-blue-900/[.08] bg-white/70"
            }`}
          >
            <span className="text-slate-500">{item.time}</span>
            <span className={item.kind === "readback" ? "text-slate-600" : "text-blue-800"}>
              {item.from} {"->"} {item.to}
            </span>
            <span className="font-semibold uppercase text-blue-700">{item.heading}</span>
            <span className="text-slate-700">{item.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
