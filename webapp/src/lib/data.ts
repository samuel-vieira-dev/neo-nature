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

export const faqs = [
  { q: "Where is my order?", a: "Every order ships within 24h (Mon–Fri) and typically arrives in 3–5 business days. Track it in real time on the Orders tab — no need to open a ticket." },
  { q: "What is your refund policy?", a: "Every purchase is covered by a 60-day, no-questions-asked money-back guarantee. Open a ticket and we'll process it within 48 hours — you don't even need to return the bottle." },
  { q: "How should I take my supplement?", a: "Each product page lists the exact dose and best timing. As a rule: take it at the same time every day, with a meal, and log it in the app to keep your streak alive." },
  { q: "Can I change my shipping address?", a: "If your order hasn't shipped yet, open a ticket with the new address and we'll update it. Once shipped, we can ask the carrier to redirect." },
  { q: "When will I start feeling results?", a: "Most of our key ingredients show measurable effects between weeks 3 and 6 of DAILY use. The first two weeks are about building levels in your body — it's completely normal to feel little at first. Consistency is the whole game." },
  { q: "What does the charge look like on my card?", a: "All charges appear as NEONATURE* followed by the product name (e.g. NEONATURE*HEROUP 855-201-4437). Check the Billing screen for your full history. If anything looks off, tap 'Get help with this charge' — it's faster than calling your bank." },
  { q: "Can I take more than the recommended dose?", a: "No — more isn't better. Our formulas are clinically dosed. Doubling the dose won't double results, but doubling your consistency practically will." },
  { q: "Is it safe with my medication?", a: "Our products are made with natural ingredients in FDA-registered facilities, but always check with your doctor before combining any supplement with prescription medication — especially blood thinners, diabetes or blood-pressure meds." },
  { q: "What happens if I miss a dose?", a: "Just take the next one at the usual time (don't double up) and check in again the next day. Consistency over time is what matters, not a perfect record." },
  { q: "Do you ship outside the US?", a: "Currently we ship to all 50 US states (free!). International shipping is on our roadmap — join the waitlist by opening a ticket." },
  { q: "How should I store my supplements?", a: "Cool, dry, and out of direct sunlight — a kitchen cabinet works great. No refrigeration needed. Keep the bottle where you'll SEE it: visible bottles get taken." },
];

export const issueTypes = [
  { id: "not_arrived", label: "Order hasn't arrived", emoji: "📦" },
  { id: "wrong_item", label: "Wrong item received", emoji: "🔄" },
  { id: "damaged", label: "Damaged product", emoji: "💔" },
  { id: "refund", label: "Request a refund", emoji: "💸" },
  { id: "other", label: "Something else", emoji: "💬" },
];
