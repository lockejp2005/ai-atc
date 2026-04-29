import { formatDuration } from "@/lib/format";
import type { Aircraft } from "@/types/atc";

export function SequencePanel({
  aircraft,
  selectedId,
  onSelect,
}: {
  aircraft: Aircraft[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col border border-blue-900/10 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Runway Sequence</h2>
        <span className="font-mono text-xs text-slate-500">{aircraft.length} tracks</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {aircraft
          .slice()
          .sort((a, b) => sortSequence(a.sequence) - sortSequence(b.sequence))
          .map((ac) => (
            <button
              key={ac.id}
              onClick={() => onSelect(ac.id)}
              className={`grid w-full grid-cols-[30px_1fr_70px] items-center gap-2 border px-3 py-2 text-left text-sm transition ${
                selectedId === ac.id ? "border-blue-600/35 bg-blue-50" : "border-blue-900/[.08] bg-white/70 hover:border-blue-600/25"
              }`}
            >
              <span className="font-mono text-slate-500">{ac.sequence || "--"}</span>
              <span>
                <span className="block font-mono text-slate-900">{ac.callsign}</span>
                <span className="text-xs text-slate-500">
                  {slotStatus(ac)} / +{formatDuration(ac.delay)}
                </span>
              </span>
              <span className="font-mono text-xs text-blue-800">{ac.slot}</span>
            </button>
          ))}
      </div>
    </section>
  );
}

function sortSequence(sequence: number) {
  return sequence || Number.MAX_SAFE_INTEGER;
}

function slotStatus(ac: Aircraft) {
  if (ac.operation === "arrival" && ac.phase === "landed") return "LANDED";
  if (ac.operation === "departure" && ac.phase === "departed") return "DONE";
  return ac.phase;
}
