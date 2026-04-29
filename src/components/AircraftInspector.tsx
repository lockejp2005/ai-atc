import { formatDuration } from "@/lib/format";
import { fuelBurnRateKgPerMinute } from "@/lib/simulation";
import type { Aircraft, ControlMode, Phase } from "@/types/atc";
import { Plane, X } from "lucide-react";

function statusColor(phase: Phase) {
  if (phase === "scheduled") return "bg-slate-300";
  if (phase === "landed") return "bg-blue-700";
  if (phase === "departed") return "bg-slate-700";
  if (phase === "final") return "bg-blue-500";
  if (phase === "departure" || phase === "takeoff" || phase === "climb" || phase === "outbound") return "bg-emerald-500";
  if (phase === "holding") return "bg-slate-400";
  if (phase === "base" || phase === "downwind") return "bg-blue-300";
  return "bg-slate-300";
}

export function AircraftInspector({
  aircraft,
  mode,
  onClose,
  variant = "panel",
}: {
  aircraft?: Aircraft;
  mode: ControlMode;
  onClose?: () => void;
  variant?: "panel" | "drawer";
}) {
  if (!aircraft) return null;

  return (
    <section
      className={`border border-blue-900/10 bg-white/90 p-4 shadow-sm backdrop-blur ${
        variant === "drawer" ? "max-h-[calc(100%-2rem)] w-[330px] overflow-auto" : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase text-slate-500">Aircraft inspector</div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
            <Plane size={21} className="text-blue-700" />
            {aircraft.callsign}
          </h2>
          <p className="text-sm text-slate-600">
            {aircraft.airline} {aircraft.type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 ${statusColor(aircraft.phase)}`} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center border border-blue-900/10 bg-white/80 text-slate-500 transition hover:border-blue-600/25 hover:text-blue-800"
              aria-label="Close aircraft inspector"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Info label="Origin" value={aircraft.origin} />
        <Info label="Destination" value={aircraft.destination} />
        <Info label="Operation" value={aircraft.operation.toUpperCase()} />
        <Info label="Wake" value={aircraft.wake.toUpperCase()} />
        <Info label="Phase" value={aircraft.phase} />
        <Info label="Altitude" value={`${aircraft.altitude.toLocaleString()}ft`} />
        <Info label="Speed" value={`${aircraft.speed}kt`} />
        <Info label="Heading" value={`${Math.round(aircraft.heading)} deg`} />
        <Info label="Fuel" value={`${Math.round(aircraft.fuel).toLocaleString()}kg`} />
        <Info label="Fuel flow" value={`${fuelBurnRateKgPerMinute(aircraft, mode)}kg/min`} />
        <Info label="Assigned slot" value={aircraft.slot} />
        <Info label="Delay" value={`+${formatDuration(aircraft.delay)}`} />
      </dl>
      <div className="mt-4 border-t border-blue-900/10 pt-4">
        <div className="text-xs uppercase text-slate-500">Current instruction</div>
        <p className="mt-2 text-sm text-slate-900">{aircraft.instruction}</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {mode === "ai" ? "AI reason: " : "Controller reason: "}
          {aircraft.reason}
        </p>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-slate-900">{value}</dd>
    </div>
  );
}
