// ---------------------------------------------------------------------------
// The 3-phase protocol model. Every user is on a protocol from onboarding;
// the Home screen surfaces "Day N · Phase X" plus an expectation message that
// keeps motivation calibrated ("it's normal not to feel much yet").
// ---------------------------------------------------------------------------

export type Niche = "mens_health" | "weight_loss" | "diabetes";

export const goals: {
  niche: Niche;
  title: string;
  emoji: string;
  blurb: string;
  productId: string;
}[] = [
  {
    niche: "mens_health",
    title: "Performance & drive",
    emoji: "⚡",
    blurb: "Energy, stamina and confidence — feel like yourself again",
    productId: "heroup",
  },
  {
    niche: "weight_loss",
    title: "Weight management",
    emoji: "🔥",
    blurb: "Fire up your metabolism and take back control",
    productId: "igniteburn",
  },
  {
    niche: "diabetes",
    title: "Blood sugar balance",
    emoji: "🌿",
    blurb: "Steadier readings and fewer energy crashes",
    productId: "glucoease",
  },
];

export type ProtocolPhase = {
  n: 1 | 2 | 3;
  name: string;
  fromDay: number;
  toDay: number; // inclusive
  focus: string;
};

export const phases: ProtocolPhase[] = [
  { n: 1, name: "Foundation", fromDay: 1, toDay: 14, focus: "Build the habit — your body is loading up" },
  { n: 2, name: "Momentum", fromDay: 15, toDay: 45, focus: "Ingredients at working levels — changes begin" },
  { n: 3, name: "Peak", fromDay: 46, toDay: 90, focus: "Full effect — lock in your results" },
];

export function phaseForDay(day: number): ProtocolPhase {
  return phases.find((p) => day >= p.fromDay && day <= p.toDay) ?? phases[2];
}

/** Expectation message for a given protocol day — manages emotion, prevents refunds */
export function expectationForDay(day: number): string {
  if (day <= 3) return "It's completely normal not to feel anything yet — the first days are about building the habit.";
  if (day <= 7) return "Some people notice subtle shifts this week. If you don't, you're still right on track.";
  if (day <= 14) return "Active ingredients are reaching working levels. Consistency now is what pays off later.";
  if (day <= 21) return "This is the turning point window — small changes often show up around now.";
  if (day <= 30) return "Most studies show measurable effects between weeks 3 and 6. You're in the zone.";
  if (day <= 45) return "Momentum phase: compare how you feel now vs. day one. Log it in Progress!";
  if (day <= 60) return "You've outlasted 90% of supplement users. This is where results compound.";
  return "Peak phase — maintain the routine and enjoy the results you've built.";
}

export const habitAnchors = [
  "With your morning coffee",
  "With breakfast",
  "Before your workout",
  "With lunch",
  "After dinner",
  "Before bed",
];

/** Which Learn track matters most at each phase — powers the personalized carousel */
export function trackForPhase(phaseN: number): string {
  return phaseN === 1 ? "first30" : phaseN === 2 ? "maximize" : "science";
}

/** Protocol day (1-based) given the onboarding date */
export function protocolDay(onboardedAt: Date, now: Date): number {
  return Math.max(1, Math.floor((now.getTime() - onboardedAt.getTime()) / 86400000) + 1);
}
