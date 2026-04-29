# AI ATC

AI ATC explores a major bottleneck in aviation: air traffic control capacity. ATC is one of the most safety-critical parts of the aviation system, but much of the coordination workflow still depends on old communication patterns, congested radio channels, manual sequencing, and in some places paper-based processes. These constraints can contribute to delays, inefficient holding, extra fuel burn, and higher workload during already high-pressure operations.

Controllers are highly trained and tightly regulated, but the job is difficult to scale. They need to make fast, precise decisions under intense pressure, while staffing shortages, fatigue, and events like government shutdowns can reduce available capacity. At the same time, flight demand keeps increasing.

AI ATC tests a human-supervised approach to this problem. The system uses strict coordination logic to sequence aircraft, assign speeds and headings, check spacing, prioritize aircraft, and create clear instructions. An AI supervisor sits above that logic to review complex situations, while the human controller remains responsible for oversight and emergencies.

Aircraft already have advanced automation for navigation and flight management. ATC has not received the same level of automation support. AI ATC focuses on reducing repetitive coordination work so controllers can spend more attention on exceptions, emergencies, and final authority.

The current simulation loads in 60 aircraft, placed around Sydney Airport. AI ATC coordinates them into holding patterns and then lands them, while also letting other aircraft take off. 

It then provides a trace of agent descisions and log of tts comms with pilots so supervisor human can monitor the situation. 

## Tech Spec

- Next.js, React, TypeScript, Leaflet, and Tailwind CSS.
- Simulates Sydney Approach traffic into runway 34L.
- Supports traditional and AI-assisted control modes.
- Generates aircraft with callsigns, wake category, route, phase, speed, altitude, fuel, and runway sequence.
- Deterministic planner handles runway sequencing, wake spacing, vectoring, delays, and fallback logic.
- AI supervisor can review high-pressure decisions when an OpenAI API key is configured.
- Radio channel simulates controller instructions and pilot readbacks.
- Trace view explains planner and supervisor decisions.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional:

```bash
OPENAI_API_KEY=...
```

Without an API key, the app still runs partially using deterministic planning.
