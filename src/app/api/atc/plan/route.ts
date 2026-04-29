import { planArrivalsWithTrace } from "@/lib/server/atc-planner";
import type { Aircraft, ControlMode } from "@/types/atc";

type PlanRequest = {
  mode?: ControlMode;
  aircraft?: Aircraft[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as PlanRequest;

  if ((body.mode !== "ai" && body.mode !== "traditional") || !Array.isArray(body.aircraft)) {
    return Response.json({ error: "Invalid planning request" }, { status: 400 });
  }

  return Response.json(planArrivalsWithTrace(body.aircraft, body.mode));
}
