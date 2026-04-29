import type { ReactNode } from "react";
import type { AppView } from "@/types/atc";
import { RadioTower, Radar } from "lucide-react";

type AppHeaderProps = {
  controls?: ReactNode;
  view: AppView;
  onView: (view: AppView) => void;
};

export function AppHeader({ controls, view, onView }: AppHeaderProps) {
  return (
    <header className="grid gap-3 border-b border-blue-900/10 bg-white/90 px-4 py-3 shadow-sm backdrop-blur xl:grid-cols-[minmax(330px,auto)_minmax(520px,1fr)_auto] xl:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center border border-blue-600/20 bg-blue-50 text-blue-700">
          <Radar size={22} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase text-blue-700">YSSY Approach / runway 34L</p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">AI ATC: Sydney Arrival Optimiser</h1>
        </div>
      </div>
      {controls}
      <div className="flex flex-wrap items-center gap-2 text-xs xl:justify-self-end">
        <nav className="grid grid-cols-2 gap-1 border border-blue-900/10 bg-blue-50/60 p-1" aria-label="Primary views">
          <button
            onClick={() => onView("radar")}
            className={`flex h-8 items-center gap-2 px-3 uppercase transition ${
              view === "radar" ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-blue-700"
            }`}
          >
            <Radar size={14} />
            Radar
          </button>
          <button
            onClick={() => onView("channel")}
            className={`flex h-8 items-center gap-2 px-3 uppercase transition ${
              view === "channel" ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-blue-700"
            }`}
          >
            <RadioTower size={14} />
            Channel / Trace
          </button>
        </nav>
        <div className="border border-blue-900/10 bg-blue-50/60 px-3 py-2 text-slate-600">
          Wind <span className="font-mono text-blue-800">330/14</span>
        </div>
        <div className="border border-blue-900/10 bg-blue-50/60 px-3 py-2 text-slate-600">
          Visibility <span className="font-mono text-blue-800">10km VMC</span>
        </div>
        <div className="border border-blue-900/10 bg-blue-50/60 px-3 py-2 text-slate-600">
          Active <span className="font-mono text-blue-800">34L ARR</span>
        </div>
      </div>
    </header>
  );
}
