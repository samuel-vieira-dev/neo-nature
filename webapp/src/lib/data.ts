// ---------------------------------------------------------------------------
// Neo Nature — mock data (Phase 1 prototype)
// Shapes intentionally mirror what the real APIs will return in Phase 2
// (BuyGoods postbacks, carrier tracking, helpdesk tickets, CMS content).
// ---------------------------------------------------------------------------

export type Product = {
  id: string;
  name: string;
  short: string; // label text on the bottle
  tagline: string;
  category: string;
  accent: string; // each product keeps its own identity color
  price: number;
  compareAt?: number;
  capsules: number;
  dosePerDay: number;
  rating: number;
  reviews: number;
  featured: boolean;
  benefits: string[];
};

export const products: Product[] = [
  {
    id: "heroup",
    name: "HeroUp",
    short: "HERO UP",
    tagline: "Libido & Performance Support",
    category: "Men's Health",
    accent: "#3b82f6",
    price: 69,
    compareAt: 99,
    capsules: 60,
    dosePerDay: 2,
    rating: 4.8,
    reviews: 2143,
    featured: true,
    benefits: ["Boost performance", "Increase stamina", "Support virility", "Sharpen drive & confidence"],
  },
  {
    id: "verdagreens",
    name: "VerdaGreens",
    short: "VERDA GREENS",
    tagline: "Daily Superfood Blend",
    category: "Daily Essentials",
    accent: "#34d399",
    price: 59,
    compareAt: 79,
    capsules: 30,
    dosePerDay: 1,
    rating: 4.7,
    reviews: 1587,
    featured: true,
    benefits: ["75+ vitamins & minerals", "Gut & immune support", "Natural energy", "One scoop, once a day"],
  },
  {
    id: "lunarest",
    name: "LunaRest",
    short: "LUNA REST",
    tagline: "Deep Sleep Formula",
    category: "Sleep & Recovery",
    accent: "#8b5cf6",
    price: 49,
    compareAt: 69,
    capsules: 60,
    dosePerDay: 2,
    rating: 4.9,
    reviews: 982,
    featured: true,
    benefits: ["Fall asleep faster", "Deeper REM cycles", "Wake up refreshed", "Non-habit forming"],
  },
  {
    id: "igniteburn",
    name: "IgniteBurn",
    short: "IGNITE BURN",
    tagline: "Metabolism & Energy Igniter",
    category: "Weight Management",
    accent: "#f97316",
    price: 64,
    compareAt: 89,
    capsules: 60,
    dosePerDay: 2,
    rating: 4.6,
    reviews: 1804,
    featured: true,
    benefits: ["Fire up metabolism", "Clean all-day energy", "Curb cravings", "Thermogenic blend"],
  },
  {
    id: "claritymind",
    name: "ClarityMind",
    short: "CLARITY MIND",
    tagline: "Focus & Memory Nootropic",
    category: "Brain Health",
    accent: "#06b6d4",
    price: 54,
    compareAt: 74,
    capsules: 30,
    dosePerDay: 1,
    rating: 4.7,
    reviews: 764,
    featured: true,
    benefits: ["Laser focus", "Faster recall", "Calm mental energy", "No jitters, no crash"],
  },
  {
    id: "glucoease",
    name: "GlucoEase",
    short: "GLUCO EASE",
    tagline: "Blood Sugar Support",
    category: "Metabolic Health",
    accent: "#2dd4bf",
    price: 55,
    compareAt: 75,
    capsules: 60,
    dosePerDay: 2,
    rating: 4.7,
    reviews: 918,
    featured: true,
    benefits: ["Support healthy glucose levels", "Steadier morning readings", "Berberine + chromium blend", "Fewer energy crashes"],
  },
  // -------- extended line (the "esteira") --------
  { id: "flexease", name: "FlexEase", short: "FLEX EASE", tagline: "Joint Comfort & Mobility", category: "Joint Health", accent: "#f43f5e", price: 49, capsules: 60, dosePerDay: 2, rating: 4.5, reviews: 623, featured: false, benefits: ["Ease stiff joints", "Support cartilage", "Move freely again"] },
  { id: "gutbios", name: "GutBios", short: "GUT BIOS", tagline: "40B CFU Probiotic Complex", category: "Gut Health", accent: "#eab308", price: 44, capsules: 30, dosePerDay: 1, rating: 4.6, reviews: 511, featured: false, benefits: ["Balance gut flora", "Reduce bloating", "Immunity from within"] },
  { id: "omegapure", name: "OmegaPure", short: "OMEGA PURE", tagline: "Triple-Strength Fish Oil", category: "Heart Health", accent: "#0ea5e9", price: 39, capsules: 90, dosePerDay: 3, rating: 4.8, reviews: 890, featured: false, benefits: ["Heart & brain support", "Ultra-purified", "No fishy burps"] },
  { id: "immunoshield", name: "ImmunoShield", short: "IMMUNO SHIELD", tagline: "Immune Defense Complex", category: "Immunity", accent: "#22c55e", price: 42, capsules: 60, dosePerDay: 2, rating: 4.5, reviews: 448, featured: false, benefits: ["Vitamin C + D + Zinc", "Elderberry boost", "Year-round defense"] },
  { id: "collaglow", name: "CollaGlow", short: "COLLA GLOW", tagline: "Beauty Collagen Peptides", category: "Beauty", accent: "#ec4899", price: 55, capsules: 90, dosePerDay: 3, rating: 4.7, reviews: 1290, featured: false, benefits: ["Radiant skin", "Stronger hair & nails", "Types I & III collagen"] },
  { id: "ironroot", name: "IronRoot", short: "IRON ROOT", tagline: "Energy & Vitality Iron Blend", category: "Daily Essentials", accent: "#a16207", price: 36, capsules: 60, dosePerDay: 1, rating: 4.4, reviews: 302, featured: false, benefits: ["Fight fatigue", "Gentle on the stomach", "With vitamin C"] },
  { id: "calmzen", name: "CalmZen", short: "CALM ZEN", tagline: "Stress & Mood Balance", category: "Mood", accent: "#14b8a6", price: 47, capsules: 60, dosePerDay: 2, rating: 4.6, reviews: 577, featured: false, benefits: ["Melt away stress", "Ashwagandha KSM-66", "Steady, calm mood"] },
  { id: "thermocut", name: "ThermoCut", short: "THERMO CUT", tagline: "Nighttime Fat Support", category: "Weight Management", accent: "#dc2626", price: 58, capsules: 60, dosePerDay: 2, rating: 4.3, reviews: 415, featured: false, benefits: ["Works while you sleep", "Stimulant-free", "Pairs with IgniteBurn"] },
  { id: "vitald3k2", name: "VitalD3+K2", short: "VITAL D3 K2", tagline: "Sunshine Vitamin Duo", category: "Daily Essentials", accent: "#fbbf24", price: 29, capsules: 90, dosePerDay: 1, rating: 4.9, reviews: 1034, featured: false, benefits: ["Bone & heart synergy", "5000 IU D3", "Immune support"] },
  { id: "primetest", name: "PrimeTest", short: "PRIME TEST", tagline: "Natural Testosterone Support", category: "Men's Health", accent: "#6366f1", price: 72, capsules: 90, dosePerDay: 3, rating: 4.5, reviews: 689, featured: false, benefits: ["Support healthy T levels", "Strength & recovery", "Pairs with HeroUp"] },
];

export const productById = (id: string) => products.find((p) => p.id === id);

// ---------------------------------------------------------------------------

export type ContentItem = {
  slug: string;
  track: string;
  title: string;
  kind: "article" | "video" | "audio";
  minutes: number;
  locked?: number; // unlocks at this streak length
  body: string[];
};

export const contentTracks = [
  { id: "first30", name: "Your First 30 Days", emoji: "🌱" },
  { id: "maximize", name: "Maximize Results", emoji: "⚡" },
  { id: "rituals", name: "Recipes & Rituals", emoji: "🥗" },
  { id: "science", name: "The Science", emoji: "🔬" },
];

export const contentItems: ContentItem[] = [
  { slug: "week-1-what-to-expect", track: "first30", title: "Week 1: What to expect", kind: "article", minutes: 3, body: ["Your body is just getting acquainted with the active ingredients. During the first week most people notice subtle shifts — slightly better energy in the morning, a calmer baseline.", "The single most important thing right now is consistency. Results compound: missing days in week one is the #1 reason people think a supplement 'doesn't work'.", "Set your reminder for the same time every day and let Neo Nature handle the rest. Your streak starts now. 🔥"] },
  { slug: "week-2-building-momentum", track: "first30", title: "Week 2: Building momentum", kind: "video", minutes: 4, body: ["By week two, active ingredient levels are building up in your system.", "This is where the habit becomes automatic — pair your dose with something you already do daily, like your morning coffee.", "Tip: keep the bottle where you can see it. Out of sight really is out of mind."] },
  { slug: "week-3-4-the-turning-point", track: "first30", title: "Weeks 3–4: The turning point", kind: "article", minutes: 5, locked: 14, body: ["Most clinical studies on our key ingredients show measurable effects between weeks 3 and 6.", "This is the turning point — the moment consistency starts paying visible dividends.", "Keep going. You're closer than you think."] },
  { slug: "day-30-checkpoint", track: "first30", title: "Day 30: Your checkpoint", kind: "article", minutes: 3, locked: 30, body: ["Congratulations — 30 days of consistency puts you ahead of 90% of supplement users.", "Take a moment to compare how you feel now vs. day one.", "This is also the perfect time to reorder so you never break the chain."] },
  { slug: "timing-your-dose", track: "maximize", title: "The best time to take your dose", kind: "article", minutes: 4, body: ["Fat-soluble ingredients absorb best with a meal — breakfast is ideal for most of our formulas.", "HeroUp and IgniteBurn work best earlier in the day; LunaRest should be taken 45 minutes before bed.", "Whatever time you choose, the same time every day beats the 'perfect' time."] },
  { slug: "foods-that-amplify", track: "maximize", title: "5 foods that amplify results", kind: "video", minutes: 6, body: ["Healthy fats (avocado, olive oil) improve absorption of fat-soluble compounds.", "Leafy greens, berries, fatty fish, nuts and fermented foods round out the top five.", "Think of food as the stage your supplement performs on."] },
  { slug: "sleep-multiplier", track: "maximize", title: "Sleep: the silent multiplier", kind: "audio", minutes: 5, body: ["Every formula we make works better on 7+ hours of sleep.", "Recovery, hormone balance and energy all route through sleep quality.", "Struggling? That's exactly what LunaRest was formulated for."] },
  { slug: "morning-power-smoothie", track: "rituals", title: "Morning power smoothie", kind: "video", minutes: 3, body: ["Blend: 1 banana, a handful of spinach, 1 cup almond milk, 1 tbsp peanut butter, ice.", "Take your VerdaGreens alongside for a complete morning stack.", "Under 5 minutes, keeps you full till lunch."] },
  { slug: "5-minute-wind-down", track: "rituals", title: "The 5-minute wind-down", kind: "audio", minutes: 5, body: ["Dim the lights, put the phone away, breathe in for 4, hold for 7, out for 8.", "Take LunaRest 45 minutes before this ritual for best results.", "Your future self will thank you at 6 AM."] },
  { slug: "why-consistency-beats-dosage", track: "science", title: "Why consistency beats dosage", kind: "article", minutes: 6, body: ["Doubling a dose doesn't double results — but doubling consistency nearly does.", "Steady-state concentration is the pharmacological reason daily habits win.", "It's also why your streak is the single best predictor of your results."] },
  { slug: "inside-the-label", track: "science", title: "Inside the label: how to read it", kind: "article", minutes: 4, body: ["Serving size, % daily value, proprietary blends — we break down what actually matters.", "Rule of thumb: clinically-dosed single ingredients beat mystery blends.", "Every Neo Nature label lists exact doses. No fairy dust."] },
];

export const contentBySlug = (slug: string) => contentItems.find((c) => c.slug === slug);

// ---------------------------------------------------------------------------

export const faqs = [
  { q: "Where is my order?", a: "Every order ships within 24h (Mon–Fri) and typically arrives in 3–5 business days. Track it in real time on the Orders tab — no need to open a ticket." },
  { q: "What is your refund policy?", a: "Every purchase is covered by a 60-day, no-questions-asked money-back guarantee. Open a ticket and we'll process it within 48 hours — you don't even need to return the bottle." },
  { q: "How should I take my supplement?", a: "Each product page lists the exact dose and best timing. As a rule: take it at the same time every day, with a meal, and log it in the app to keep your streak alive." },
  { q: "Can I change my shipping address?", a: "If your order hasn't shipped yet, open a ticket with the new address and we'll update it. Once shipped, we can ask the carrier to redirect." },
];

export const issueTypes = [
  { id: "not_arrived", label: "Order hasn't arrived", emoji: "📦" },
  { id: "wrong_item", label: "Wrong item received", emoji: "🔄" },
  { id: "damaged", label: "Damaged product", emoji: "💔" },
  { id: "refund", label: "Request a refund", emoji: "💸" },
  { id: "other", label: "Something else", emoji: "💬" },
];

// ---------------------------------------------------------------------------

export const milestones = [7, 14, 30, 60, 90];
