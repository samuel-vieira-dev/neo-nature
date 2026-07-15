// ---------------------------------------------------------------------------
// Onboarding goals and reminder anchors. The v0.3 Home screen no longer shows
// a protocol phase/day — this file only powers the onboarding goal step and
// the reminder-anchor picker.
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

export const habitAnchors = [
  "With your morning coffee",
  "With breakfast",
  "Before your workout",
  "With lunch",
  "After dinner",
  "Before bed",
];
