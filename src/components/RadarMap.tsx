"use client";

import { approachRoutes, holds, runway, toLatLng } from "@/data/sydney-airport";
import type { Aircraft } from "@/types/atc";
import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

type RadarMapProps = {
  aircraft: Aircraft[];
  selectedId?: string;
  talkingAircraftId?: string;
  onSelect: (id: string) => void;
};

function rotatedPoint(cx: number, cy: number, x: number, y: number, headingDeg: number) {
  const angle = ((headingDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  };
}

function holdPolygon(hold: (typeof holds)[number]) {
  const longLeg = 6.8;
  const crossLeg = 2.2;
  return [
    rotatedPoint(hold.x, hold.y, -crossLeg, -longLeg, hold.inboundHeading),
    rotatedPoint(hold.x, hold.y, crossLeg, -longLeg, hold.inboundHeading),
    rotatedPoint(hold.x, hold.y, crossLeg, longLeg, hold.inboundHeading),
    rotatedPoint(hold.x, hold.y, -crossLeg, longLeg, hold.inboundHeading),
  ].map(toLatLng);
}

export function RadarMap({ aircraft, selectedId, talkingAircraftId, onSelect }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const aircraftLayerRef = useRef<LayerGroup | null>(null);
  const staticLayerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      const L = await import("leaflet");
      if (!mounted || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
      }).setView([-33.96, 151.16], 9);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
      }).addTo(map);

      const staticLayer = L.layerGroup().addTo(map);
      const aircraftLayer = L.layerGroup().addTo(map);
      staticLayerRef.current = staticLayer;
      aircraftLayerRef.current = aircraftLayer;
      mapRef.current = map;

      L.circle(toLatLng(runway.merge), {
        radius: 29000,
        color: "#2563eb",
        weight: 1,
        dashArray: "4 6",
        fillColor: "#2563eb",
        fillOpacity: 0.05,
      }).addTo(staticLayer);
      L.circle(toLatLng(runway.airport), {
        radius: 55560,
        color: "#2563eb",
        weight: 1,
        dashArray: "2 8",
        fillOpacity: 0,
      }).addTo(staticLayer);
      L.circle(toLatLng(runway.airport), {
        radius: 27780,
        color: "#2563eb",
        weight: 1,
        dashArray: "2 8",
        fillOpacity: 0,
      }).addTo(staticLayer);
      L.polyline([toLatLng(runway.merge), toLatLng(runway.finalFix), toLatLng(runway.threshold34L)], {
        color: "#1d4ed8",
        weight: 2.4,
        opacity: 0.75,
      }).addTo(staticLayer);
      approachRoutes.forEach((route) => {
        L.polyline(route.points.map(toLatLng), {
          color: "#2563eb",
          weight: 1.4,
          opacity: 0.24,
          dashArray: "8 8",
        }).addTo(staticLayer);
      });
      L.polyline([toLatLng(runway.threshold16R), toLatLng(runway.threshold34L)], {
        color: "#1e3a8a",
        weight: 5,
        opacity: 0.55,
      }).addTo(staticLayer);
      L.polyline([toLatLng(runway.threshold16R), toLatLng(runway.threshold34L)], {
        color: "#eff6ff",
        weight: 1,
        opacity: 0.95,
      }).addTo(staticLayer);

      L.marker(toLatLng(runway.airport), {
        icon: L.divIcon({
          className: "terminal-map-label",
          html: "<span>YSSY</span>",
          iconSize: [54, 22],
          iconAnchor: [7, 11],
        }),
      }).addTo(staticLayer);
      L.marker(toLatLng(runway.merge), {
        icon: L.divIcon({
          className: "terminal-fix-label",
          html: "<span>MERGE_34L</span>",
          iconSize: [86, 22],
          iconAnchor: [7, 11],
        }),
      }).addTo(staticLayer);

      holds.forEach((hold) => {
        L.polygon(holdPolygon(hold), {
          color: "#64748b",
          weight: 1,
          dashArray: "4 5",
          fillColor: "#2563eb",
          fillOpacity: 0.03,
        }).addTo(staticLayer);
        L.marker(toLatLng(hold), {
          icon: L.divIcon({
            className: "terminal-hold-label",
            html: `<span>${hold.name}</span>`,
            iconSize: [92, 22],
            iconAnchor: [8, 11],
          }),
        }).addTo(staticLayer);
      });
    }

    initMap();

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = aircraftLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();
    aircraft
      .filter((ac) => ac.phase !== "scheduled" && ac.phase !== "landed" && ac.phase !== "departed")
      .forEach((ac) => {
      const selected = ac.id === selectedId;
      const talking = ac.id === talkingAircraftId || ac.callsign === talkingAircraftId;
      const phaseClass =
        ac.phase === "holding" ? "is-holding" : ac.phase === "final" ? "is-final" : ac.operation === "departure" ? "is-departure" : "";
      const wakeClass = ac.wake === "heavy" ? "is-heavy" : "";
      const altitudeColor = aircraftBlueForAltitude(ac.altitude);
      const tagOffset = aircraftTagOffset(ac);

      L.polyline(ac.trail.map(toLatLng), {
        color: selected ? "#1d4ed8" : ac.phase === "holding" ? "#64748b" : "#2563eb",
        weight: selected ? 2.6 : 1.5,
        opacity: selected ? 0.85 : ac.phase === "holding" ? 0.34 : 0.48,
      }).addTo(layer);

      L.marker(toLatLng(ac), {
        icon: L.divIcon({
          className: `aircraft-div-icon ${selected ? "is-selected" : ""} ${talking ? "is-talking" : ""} ${phaseClass} ${wakeClass}`,
          html: `
            <button class="aircraft-track" style="--tag-x: ${tagOffset.x}px; --tag-y: ${tagOffset.y}px" aria-label="${ac.callsign}">
              <span class="aircraft-symbol" style="--aircraft-blue: ${altitudeColor}; transform: rotate(${ac.heading}deg)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21.6 16.2v-2.1L13.4 9V3.8c0-.8-.6-1.4-1.4-1.4s-1.4.6-1.4 1.4V9l-8.2 5.1v2.1l8.2-2.6v5.2l-2.4 1.8v1.6l3.8-1.1 3.8 1.1v-1.6l-2.4-1.8v-5.2l8.2 2.6Z" />
                </svg>
              </span>
              <span class="aircraft-tag">
                <strong>${ac.callsign}</strong>
                <small>${Math.round(ac.altitude / 100)} ${ac.speed}</small>
              </span>
            </button>
          `,
          iconSize: [124, 58],
          iconAnchor: [12, 16],
        }),
        zIndexOffset: selected ? 1000 : ac.phase === "final" ? 600 : 100,
      })
        .on("click", () => onSelect(ac.id))
        .addTo(layer);
    });
  }, [aircraft, onSelect, selectedId, talkingAircraftId]);

  return <div ref={containerRef} className="h-full min-h-[560px] w-full xl:min-h-0" />;
}

function aircraftBlueForAltitude(altitudeFt: number) {
  const normalized = Math.max(0, Math.min(1, altitudeFt / 16000));
  const low = { red: 120, green: 130, blue: 145 };
  const high = { red: 29, green: 78, blue: 216 };
  const red = Math.round(low.red + (high.red - low.red) * normalized);
  const green = Math.round(low.green + (high.green - low.green) * normalized);
  const blue = Math.round(low.blue + (high.blue - low.blue) * normalized);
  return `rgb(${red}, ${green}, ${blue})`;
}

function aircraftTagOffset(ac: Aircraft) {
  const ring = ((ac.sequence || 1) + ac.streamIndex * 3) % 8;
  const offsets = [
    { x: 0, y: 0 },
    { x: 14, y: -12 },
    { x: -10, y: 13 },
    { x: 22, y: 8 },
    { x: -18, y: -10 },
    { x: 8, y: 18 },
    { x: 28, y: -4 },
    { x: -24, y: 5 },
  ];

  if (ac.phase === "final" || ac.phase === "takeoff") return { x: 0, y: 0 };
  return offsets[ring];
}
