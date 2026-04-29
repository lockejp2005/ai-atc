import type { Point } from "@/types/atc";

export const streams = [
  { name: "NORTH", x: 58, y: 13, heading: 188, star: "BOREE" },
  { name: "WEST", x: 12, y: 45, heading: 104, star: "RIVET" },
  { name: "SOUTH", x: 35, y: 86, heading: 26, star: "MARLN" },
  { name: "EAST", x: 83, y: 35, heading: 230, star: "ODALE" },
];

export const runway = {
  airport: { x: 63, y: 67 },
  threshold16R: { x: 62.0, y: 66.2 },
  threshold34L: { x: 63.3, y: 69.0 },
  atret: { x: 64.7, y: 72.1 },
  sosij: { x: 66.1, y: 75.1 },
  finalFix: { x: 66.1, y: 75.1 },
  merge: { x: 69.3, y: 81.9 },
};

export const approachRoutes = [
  {
    id: "NORTH_FLOW",
    name: "North flow",
    points: [
      streams[0],
      { x: 57.0, y: 51.0 },
      { x: 58.4, y: 61.7 },
      runway.sosij,
      runway.atret,
      runway.threshold34L,
    ],
  },
  {
    id: "WEST_FLOW",
    name: "West flow",
    points: [
      streams[1],
      { x: 48.8, y: 64.8 },
      { x: 56.7, y: 69.5 },
      runway.sosij,
      runway.atret,
      runway.threshold34L,
    ],
  },
  {
    id: "SOUTH_FLOW",
    name: "South flow",
    points: [
      streams[2],
      runway.merge,
      { x: 71.5, y: 82.2 },
      runway.sosij,
      runway.atret,
      runway.threshold34L,
    ],
  },
  {
    id: "EAST_FLOW",
    name: "East flow",
    points: [
      streams[3],
      { x: 82.2, y: 63.4 },
      { x: 75.6, y: 70.2 },
      runway.sosij,
      runway.atret,
      runway.threshold34L,
    ],
  },
];

export const holds = [
  { id: "NORTH_HOLD", name: "North Hold", x: 54, y: 35, inboundHeading: 160 },
  { id: "WEST_HOLD", name: "West Hold", x: 33, y: 58, inboundHeading: 115 },
  { id: "SOUTH_HOLD", name: "South Hold", x: 50, y: 83, inboundHeading: 335 },
];

export function toLatLng(point: Point): [number, number] {
  return [-33.9399 + (67 - point.y) * 0.0115, 151.1753 + (point.x - 63) * 0.0135];
}
