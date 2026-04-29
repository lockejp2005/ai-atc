const VOICE_BY_KIND = {
  system: "cedar",
  instruction: "marin",
  readback: "ash",
} as const;

type TtsRequest = {
  text?: string;
  kind?: keyof typeof VOICE_BY_KIND;
  voiceProfile?: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  const body = (await request.json()) as TtsRequest;
  const text = body.text?.trim();
  if (!text) {
    return Response.json({ error: "Text is required" }, { status: 400 });
  }

  const kind = body.kind && body.kind in VOICE_BY_KIND ? body.kind : "instruction";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: VOICE_BY_KIND[kind],
      input: text,
      instructions: voiceInstructions(kind, body.voiceProfile),
      speed: kind === "readback" ? 1.22 : kind === "instruction" ? 1.16 : 1.08,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return Response.json({ error: "OpenAI TTS request failed", detail: error }, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

function voiceInstructions(kind: keyof typeof VOICE_BY_KIND, voiceProfile?: string) {
  if (kind === "readback") {
    return [
      "Sound like a calm professional airline pilot from the Midwestern United States reading back an ATC clearance over VHF radio.",
      "Use a natural General American / Midwest accent, brisk concise cadence, aviation radio discipline, and slight cockpit confidence.",
      "Emphasize headings, altitudes, speeds, runway, and sequence numbers clearly. Do not sound theatrical.",
      "Speak faster than normal conversation while staying intelligible, like an efficient airline crew on a busy approach frequency.",
      voiceProfile ? `Pilot voice profile: ${voiceProfile}. Keep this profile subtle and consistent.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (kind === "system") {
    return "Sound like a calm operations announcer on an AI-generated demo channel. Clear, brief, neutral, and brisk.";
  }

  return [
    "Sound like a calm professional Sydney approach controller over VHF radio.",
    "Use fast clipped ATC cadence, confident prioritization, and clear emphasis on headings, altitudes, speeds, runway, and sequence.",
    "Do not over-explain; sound operational and time-efficient.",
  ].join(" ");
}
