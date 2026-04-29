AI ATC Hackathon Plan: Sydney Arrival Optimiser
0. Scope

Build a demo-only AI ATC arrival sequencing simulator for Sydney Airport / YSSY.

Sydney has three runways: 16R/34L, 16L/34R, and 07/25. The main north-south runway is 16R/34L, and Runway 34L points roughly 340 degrees. Use 34L arrivals as the default demo scenario.

1. Main user interface
Interface A: FR24-style map

Main screen:

 -------------------------------------------------------
|  AI ATC: Sydney Arrival Optimiser                     |
|-------------------------------------------------------|
|                                                       |
|                 Map of Sydney / YSSY                  |
|                                                       |
|   Aircraft icons                                      |
|   Heading trails                                      |
|   Holding stacks                                      |
|   Final approach path                                 |
|   Runway 34L marker                                   |
|                                                       |
|-------------------------------------------------------|
| Scenario Controls | ATC Feed | Metrics Panel          |
 -------------------------------------------------------

Map should show:

- Sydney Airport
- Runway 34L / 16R line
- Final approach path
- Merge point
- Holding fixes
- Aircraft icons
- Aircraft trail lines
- Congestion heat / warning circles
Interface B: Scenario control panel

Controls:

Airport: Sydney / YSSY
Runway Mode: 34L arrivals
Traffic Level:
  - Light: 8 aircraft
  - Medium: 20 aircraft
  - Heavy: 40 aircraft

Mode:
  - Traditional ATC
  - AI ATC

Buttons:
  - Generate Aircraft
  - Start Simulation
  - Pause
  - Reset
  - Compare Traditional vs AI
Interface C: Aircraft inspector

When user clicks an aircraft:

Callsign: QFA432
Airline: Qantas
Aircraft Type: B738
Wake Category: Medium
Origin: Melbourne
Distance to SYD: 72nm
Altitude: 18,000ft
Speed: 310kt
Fuel State: Normal
Current Intent: Landing YSSY 34L
ATC Status: Vectoring
Assigned Slot: 14:08:30
Delay: +6 min
Instruction: Turn heading 310, descend 7000ft, reduce 230kt
Reason: Sequencing behind VOZ812
Interface D: ATC command feed

Example:

14:02:10  AI ATC → QFA432: descend 7000ft, reduce speed 230kt
14:02:15  AI ATC → JST721: turn left heading 290, join downwind
14:02:30  AI ATC → VOZ812: cleared ILS 34L approach
14:03:00  AI ATC → RXA221: enter hold at MARLN, expect approach in 8 min
Interface E: Metrics panel

Show before/after comparison:

Average delay
Total holding time
Total fuel burned
Number of conflicts
Number of go-arounds
Runway utilisation
Aircraft landed per 10 minutes
Average time to land
2. Core data interfaces
Airport interface
export interface Airport {
  icao: string;
  iata: string;
  name: string;
  lat: number;
  lng: number;
  runways: Runway[];
  arrivalFixes: ArrivalFix[];
  holdingFixes: HoldingFix[];
}
Runway interface
export interface Runway {
  id: string;
  name: string;
  heading: number;
  lengthMeters: number;
  threshold: {
    lat: number;
    lng: number;
  };
  finalApproachFix: {
    lat: number;
    lng: number;
    altitudeFt: number;
  };
  mergePoint: {
    lat: number;
    lng: number;
    altitudeFt: number;
  };
  arrivalRatePerHour: number;
}
Aircraft interface
export interface Aircraft {
  id: string;
  callsign: string;

  airline: {
    code: string;
    name: string;
  };

  aircraft: {
    type: string;
    category: "regional" | "narrowbody" | "widebody" | "heavy";
    wakeCategory: "light" | "medium" | "heavy" | "super";
  };

  origin: string;
  destination: "YSSY";

  position: {
    lat: number;
    lng: number;
  };

  flightState: {
    altitudeFt: number;
    speedKt: number;
    headingDeg: number;
    verticalSpeedFpm: number;
    fuelKg: number;
  };

  intent: {
    phase: "arrival" | "holding" | "vectoring" | "downwind" | "base" | "final" | "landed" | "goAround";
    targetRunway: string;
    priority: "normal" | "lowFuel" | "medical" | "emergency";
  };

  atc: {
    assignedSlotTime?: string;
    sequenceNumber?: number;
    currentInstruction?: AtcInstruction;
    delaySeconds: number;
    holdingSeconds: number;
  };

  trail: Array<{
    lat: number;
    lng: number;
    timestamp: string;
  }>;
}
ATC instruction interface
export interface AtcInstruction {
  aircraftId: string;
  issuedAt: string;
  instructionType:
    | "turn"
    | "descend"
    | "reduceSpeed"
    | "increaseSpeed"
    | "hold"
    | "directToFix"
    | "clearedApproach"
    | "clearedToLand"
    | "goAround";

  headingDeg?: number;
  altitudeFt?: number;
  speedKt?: number;
  fixName?: string;
  runway?: string;

  reason: string;
  expectedDurationSeconds?: number;
}
3. Sydney airport demo config

Use approximate demo coordinates, not real nav-data-level precision.

export const SYDNEY_AIRPORT: Airport = {
  icao: "YSSY",
  iata: "SYD",
  name: "Sydney Kingsford Smith Airport",
  lat: -33.9399,
  lng: 151.1753,

  runways: [
    {
      id: "34L",
      name: "Runway 34L",
      heading: 340,
      lengthMeters: 3962,
      threshold: {
        lat: -33.974,
        lng: 151.179,
      },
      finalApproachFix: {
        lat: -34.115,
        lng: 151.230,
        altitudeFt: 3000,
      },
      mergePoint: {
        lat: -34.280,
        lng: 151.300,
        altitudeFt: 7000,
      },
      arrivalRatePerHour: 36,
    },
  ],

  arrivalFixes: [
    {
      id: "NORTH_STREAM",
      name: "North Arrival Stream",
      lat: -33.35,
      lng: 151.25,
      altitudeFt: 12000,
    },
    {
      id: "WEST_STREAM",
      name: "West Arrival Stream",
      lat: -33.80,
      lng: 150.45,
      altitudeFt: 14000,
    },
    {
      id: "SOUTH_STREAM",
      name: "South Arrival Stream",
      lat: -34.55,
      lng: 150.95,
      altitudeFt: 13000,
    },
  ],

  holdingFixes: [
    {
      id: "NORTH_HOLD",
      name: "North Hold",
      lat: -33.55,
      lng: 151.15,
      altitudeFt: 9000,
    },
    {
      id: "WEST_HOLD",
      name: "West Hold",
      lat: -33.85,
      lng: 150.70,
      altitudeFt: 10000,
    },
    {
      id: "SOUTH_HOLD",
      name: "South Hold",
      lat: -34.35,
      lng: 151.05,
      altitudeFt: 9000,
    },
  ],
};
4. Example JSON: traditional congested Sydney approach

This is the starting scenario. It should intentionally show inefficient traditional sequencing: too many aircraft arrive at once, some get holding, some get late vectors.

{
  "scenarioId": "syd-heavy-arrivals-traditional-001",
  "airport": {
    "icao": "YSSY",
    "iata": "SYD",
    "name": "Sydney Kingsford Smith Airport",
    "activeRunway": "34L",
    "arrivalRatePerHour": 36
  },
  "weather": {
    "windDirectionDeg": 330,
    "windSpeedKt": 14,
    "visibilityKm": 10,
    "conditions": "VMC"
  },
  "trafficMode": "traditional",
  "simulationStartTime": "2026-04-29T14:00:00+10:00",
  "problem": {
    "description": "Heavy inbound bank into Sydney. Multiple aircraft have similar ETAs to Runway 34L, causing spacing conflicts, holding, and late vectors.",
    "inefficiencies": [
      "Aircraft arrive at the terminal area before runway slots are available",
      "Several aircraft are placed into holding patterns",
      "Late vectoring creates extra track miles",
      "Step-down descents increase fuel burn",
      "Runway spacing is conservative and inconsistent"
    ]
  },
  "aircraft": [
    {
      "id": "ac_001",
      "callsign": "QFA432",
      "airline": { "code": "QFA", "name": "Qantas" },
      "aircraft": { "type": "B738", "category": "narrowbody", "wakeCategory": "medium" },
      "origin": "YMML",
      "destination": "YSSY",
      "position": { "lat": -34.25, "lng": 150.95 },
      "flightState": {
        "altitudeFt": 15000,
        "speedKt": 310,
        "headingDeg": 35,
        "verticalSpeedFpm": -1200,
        "fuelKg": 4200
      },
      "intent": {
        "phase": "arrival",
        "targetRunway": "34L",
        "priority": "normal"
      },
      "traditionalPlan": {
        "etaToRunwaySeconds": 780,
        "expectedDelaySeconds": 420,
        "assignedAction": "hold",
        "holdingFix": "SOUTH_HOLD",
        "reason": "Too close behind VOZ812 and JST721 on arrival stream"
      }
    },
    {
      "id": "ac_002",
      "callsign": "VOZ812",
      "airline": { "code": "VOZ", "name": "Virgin Australia" },
      "aircraft": { "type": "B738", "category": "narrowbody", "wakeCategory": "medium" },
      "origin": "YBBN",
      "destination": "YSSY",
      "position": { "lat": -33.45, "lng": 151.10 },
      "flightState": {
        "altitudeFt": 13000,
        "speedKt": 300,
        "headingDeg": 185,
        "verticalSpeedFpm": -900,
        "fuelKg": 3900
      },
      "intent": {
        "phase": "arrival",
        "targetRunway": "34L",
        "priority": "normal"
      },
      "traditionalPlan": {
        "etaToRunwaySeconds": 660,
        "expectedDelaySeconds": 120,
        "assignedAction": "vector",
        "reason": "Needs spacing behind JST721"
      }
    },
    {
      "id": "ac_003",
      "callsign": "JST721",
      "airline": { "code": "JST", "name": "Jetstar" },
      "aircraft": { "type": "A320", "category": "narrowbody", "wakeCategory": "medium" },
      "origin": "YSCB",
      "destination": "YSSY",
      "position": { "lat": -34.05, "lng": 150.75 },
      "flightState": {
        "altitudeFt": 11000,
        "speedKt": 285,
        "headingDeg": 75,
        "verticalSpeedFpm": -1000,
        "fuelKg": 3500
      },
      "intent": {
        "phase": "arrival",
        "targetRunway": "34L",
        "priority": "normal"
      },
      "traditionalPlan": {
        "etaToRunwaySeconds": 620,
        "expectedDelaySeconds": 0,
        "assignedAction": "continue",
        "reason": "First aircraft in current arrival sequence"
      }
    },
    {
      "id": "ac_004",
      "callsign": "RXA221",
      "airline": { "code": "RXA", "name": "Rex" },
      "aircraft": { "type": "SF34", "category": "regional", "wakeCategory": "medium" },
      "origin": "YSSY",
      "destination": "YSSY",
      "position": { "lat": -33.70, "lng": 150.80 },
      "flightState": {
        "altitudeFt": 9000,
        "speedKt": 240,
        "headingDeg": 115,
        "verticalSpeedFpm": -700,
        "fuelKg": 1500
      },
      "intent": {
        "phase": "arrival",
        "targetRunway": "34L",
        "priority": "normal"
      },
      "traditionalPlan": {
        "etaToRunwaySeconds": 700,
        "expectedDelaySeconds": 300,
        "assignedAction": "hold",
        "holdingFix": "WEST_HOLD",
        "reason": "Merged late into inbound stream"
      }
    },
    {
      "id": "ac_005",
      "callsign": "SIA231",
      "airline": { "code": "SIA", "name": "Singapore Airlines" },
      "aircraft": { "type": "A359", "category": "widebody", "wakeCategory": "heavy" },
      "origin": "WSSS",
      "destination": "YSSY",
      "position": { "lat": -33.30, "lng": 151.45 },
      "flightState": {
        "altitudeFt": 17000,
        "speedKt": 320,
        "headingDeg": 210,
        "verticalSpeedFpm": -1100,
        "fuelKg": 9000
      },
      "intent": {
        "phase": "arrival",
        "targetRunway": "34L",
        "priority": "normal"
      },
      "traditionalPlan": {
        "etaToRunwaySeconds": 840,
        "expectedDelaySeconds": 240,
        "assignedAction": "vector",
        "reason": "Heavy wake category requires additional spacing behind landing traffic"
      }
    }
  ],
  "traditionalOutcomeEstimate": {
    "averageDelaySeconds": 216,
    "totalHoldingSeconds": 720,
    "estimatedFuelBurnKg": 2850,
    "aircraftLandedInFirst10Minutes": 2,
    "conflictAlerts": 3,
    "goArounds": 0
  }
}
5. Traditional ATC simulation behaviour

Traditional mode should be deliberately simple and inefficient.

Rules:

1. Sort aircraft by raw ETA to runway.
2. If two aircraft are too close, delay the later one.
3. If delay > 180 seconds, send aircraft to holding.
4. Use step-down descents:
   15000 → 10000 → 7000 → 5000 → 3000
5. Use late vectoring once aircraft get near the merge point.
6. Use conservative spacing:
   medium after medium: 120 seconds
   heavy before medium: 180 seconds
   super/heavy wake: 210 seconds

Traditional instructions examples:

[
  {
    "aircraftId": "ac_001",
    "instructionType": "hold",
    "fixName": "SOUTH_HOLD",
    "altitudeFt": 9000,
    "reason": "Runway arrival sequence saturated"
  },
  {
    "aircraftId": "ac_002",
    "instructionType": "turn",
    "headingDeg": 190,
    "reason": "Late vector for spacing behind JST721"
  },
  {
    "aircraftId": "ac_005",
    "instructionType": "reduceSpeed",
    "speedKt": 220,
    "reason": "Additional wake spacing required behind heavy aircraft"
  }
]
6. AI ATC simulation behaviour

AI mode should feel smarter but still deterministic enough to work.

AI should:

1. Predict each aircraft ETA.
2. Assign runway slots before aircraft reach terminal airspace.
3. Prioritise emergencies / low fuel.
4. Sequence by:
   - ETA
   - wake category
   - fuel state
   - current distance
   - runway spacing constraints
5. Adjust speed early instead of using holding.
6. Vector aircraft to merge point smoothly.
7. Prefer continuous descent.
8. Avoid conflicts using minimum separation.
9. Generate human-readable explanation for every instruction.

AI instructions examples:

[
  {
    "aircraftId": "ac_001",
    "instructionType": "reduceSpeed",
    "speedKt": 250,
    "altitudeFt": 9000,
    "reason": "Absorb 4 minutes of delay early to avoid holding at SOUTH_HOLD"
  },
  {
    "aircraftId": "ac_002",
    "instructionType": "directToFix",
    "fixName": "MERGE_34L",
    "speedKt": 230,
    "reason": "Planned as sequence number 2 behind JST721"
  },
  {
    "aircraftId": "ac_005",
    "instructionType": "descend",
    "altitudeFt": 7000,
    "speedKt": 240,
    "reason": "Maintain heavy wake spacing while preserving continuous descent"
  }
]
7. AI planner input/output contract
Planner input
export interface AtcPlannerInput {
  airport: Airport;
  activeRunway: string;
  mode: "traditional" | "ai";
  currentTime: string;
  aircraft: Aircraft[];
  constraints: AtcConstraints;
}
Constraints
export interface AtcConstraints {
  minHorizontalSeparationNm: number;
  minVerticalSeparationFt: number;

  runwaySpacingSeconds: {
    mediumAfterMedium: number;
    mediumAfterHeavy: number;
    heavyAfterMedium: number;
    heavyAfterHeavy: number;
  };

  maxDescentRateFpm: number;
  maxTurnRateDegPerSecond: number;
  minApproachSpeedKt: number;
  maxApproachSpeedKt: number;
}
Planner output
export interface AtcPlannerOutput {
  mode: "traditional" | "ai";
  generatedAt: string;

  runwaySequence: Array<{
    aircraftId: string;
    callsign: string;
    sequenceNumber: number;
    assignedLandingTime: string;
    plannedDelaySeconds: number;
    reason: string;
  }>;

  instructions: AtcInstruction[];

  metricsEstimate: {
    averageDelaySeconds: number;
    totalHoldingSeconds: number;
    estimatedFuelBurnKg: number;
    aircraftLandedNext10Minutes: number;
    conflictAlerts: number;
    runwayUtilisationPercent: number;
  };
}
8. The “AI” implementation approach

For the hackathon, use two layers.

Layer 1: deterministic safety planner

This actually controls the simulation.

- calculates ETA
- assigns slots
- enforces spacing
- generates heading/speed/altitude targets
- prevents conflicts
Layer 2: LLM explanation layer

This makes it feel like AI ATC.

Use the LLM to produce:

- ATC-style command text
- reason explanations
- comparison summaries
- “why AI changed the sequence”

Do not rely on the LLM for physics/safety logic.

9. Simulation loop

Every tick:

function simulationTick() {
  updateAircraftPositions();
  updateAltitudes();
  detectConflicts();
  applyCurrentInstructions();
  checkFinalApproach();
  checkLanding();
  updateMetrics();

  if (tickNumber % 5 === 0) {
    const plannerOutput = runAtcPlanner(currentState);
    applyPlannerInstructions(plannerOutput.instructions);
    appendAtcFeed(plannerOutput.instructions);
  }
}
10. Demo flow
Step 1: Generate congestion

User clicks:

Generate Heavy Sydney Arrival Bank

Map fills with 30 aircraft.

Show warning:

Heavy inbound congestion detected.
18 aircraft expected within next 12 minutes.
Runway 34L capacity exceeded.
Step 2: Run traditional mode

Show:

- holding patterns
- late vectors
- delay increasing
- fuel burn increasing
Step 3: Switch to AI mode

Show:

AI ATC is resequencing arrivals...
Assigning runway slots...
Reducing speed early...
Avoiding holding...
Building final approach stream...
Step 4: Show comparison
Traditional ATC:
Average delay: 6.8 min
Holding time: 42 min total
Fuel burned: 8,400kg
Landed in 10 min: 5

AI ATC:
Average delay: 3.1 min
Holding time: 8 min total
Fuel burned: 5,900kg
Landed in 10 min: 7