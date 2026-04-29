import type { ControlMode, FeedItem } from "@/types/atc";
import { RadioTower, SatelliteDish } from "lucide-react";

export function ChannelView({ feed, mode }: { feed: FeedItem[]; mode: ControlMode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#edf5fb] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-blue-900/10 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-blue-700">
            <RadioTower size={15} />
            Sydney Approach frequency
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Channel</h2>
        </div>
        <div className="flex items-center gap-2 border border-blue-900/10 bg-blue-50/70 px-3 py-2 font-mono text-xs uppercase text-blue-800">
          <SatelliteDish size={14} />
          {mode === "ai" ? "AI ATC instance transmitting" : "Traditional controller transmitting"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto border border-blue-900/10 bg-white/80 p-3 shadow-sm backdrop-blur">
        {feed.length === 0 ? (
          <div className="grid h-full min-h-[420px] place-items-center border border-dashed border-blue-900/15 bg-blue-50/50 text-center">
            <div>
              <div className="font-mono text-xs uppercase text-slate-500">frequency idle</div>
              <div className="mt-2 text-sm text-slate-600">Start the simulation or generate traffic to hear aircraft check-ins and readbacks.</div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {feed.map((item, index) => (
            <article
              key={item.id}
              className={`feed-arrival grid gap-3 border px-4 py-3 md:grid-cols-[92px_180px_150px_1fr] ${
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
      </div>
    </section>
  );
}
