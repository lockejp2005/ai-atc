import { buildPilotReadback, validateRadioInstructionRequest } from "@/lib/server/atc-agents";

export async function POST(request: Request) {
  const body = await request.json();
  const radioRequest = validateRadioInstructionRequest(body);

  if (!radioRequest) {
    return Response.json({ error: "Invalid pilot readback request" }, { status: 400 });
  }

  return Response.json({ readback: buildPilotReadback(radioRequest) });
}
