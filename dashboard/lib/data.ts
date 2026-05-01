// Seeded fake data for the dashboard mockup.
// In production this is replaced by an API route that reads from SQLite.
// Schema mirrors what Phases 1-3 will produce.

export type Sentiment = "positive" | "neutral" | "negative";
export type Prominence = "primary" | "secondary" | "passing";
export type RiskFlag =
  | "legal"
  | "financial"
  | "controversy"
  | "exec_statement"
  | "product_issue"
  | "none";

export type Mention = {
  id: number;
  story_id: number;
  url: string;
  title: string;
  source_name: string;
  language: "en" | "da" | "no" | "es";
  published_at: string; // ISO
  sentiment: Sentiment;
  sentiment_confidence: number;
  prominence: Prominence;
  angle: string;
  key_claims: string[];
  people_quoted: { name: string; affiliation: string; quote_summary: string }[];
  risk_flags: RiskFlag[];
  summary: string;
};

export type Story = {
  id: number;
  headline: string;
  story_summary: string;
  first_seen: string;
  last_seen: string;
  primary_sentiment: Sentiment;
  risk_flags: RiskFlag[];
  pickup_count: number;
};

// Helper to build dates relative to a fixed "today" so the mockup is stable.
const TODAY = new Date("2026-05-01T08:00:00Z");
const daysAgo = (n: number, hour = 9) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const STORIES: Story[] = [
  {
    id: 1,
    headline: "Salmon mortality at Norwegian farm linked to feed batch",
    story_summary:
      "A mortality event at a Lerøy site in northern Norway is being investigated; preliminary reports cite a contaminated feed batch. BioMar acknowledged the investigation and said it is cooperating with regulators.",
    first_seen: daysAgo(2),
    last_seen: daysAgo(0, 14),
    primary_sentiment: "negative",
    risk_flags: ["product_issue", "controversy"],
    pickup_count: 5,
  },
  {
    id: 2,
    headline: "Schouw & Co Q1 results: BioMar segment revenue up 8%",
    story_summary:
      "Parent Schouw & Co reported Q1 numbers with BioMar revenue of DKK 4.1bn, up 8% YoY, citing strong demand in Chile and Norway. Margins improved on lower fishmeal pricing.",
    first_seen: daysAgo(5),
    last_seen: daysAgo(4),
    primary_sentiment: "positive",
    risk_flags: ["financial"],
    pickup_count: 4,
  },
  {
    id: 3,
    headline: "BioMar opens new feed plant in Costa Rica",
    story_summary:
      "BioMar inaugurated a 100,000-tonne capacity feed plant in Puntarenas to serve Central American shrimp and tilapia operations. CEO Carlos Diaz attended the opening.",
    first_seen: daysAgo(8),
    last_seen: daysAgo(7),
    primary_sentiment: "positive",
    risk_flags: ["none"],
    pickup_count: 3,
  },
  {
    id: 4,
    headline: "BioMar and Skretting partner on insect-protein research",
    story_summary:
      "Two of the largest aquafeed producers announced a precompetitive research partnership with Innovafeed to evaluate black soldier fly meal at industrial scale.",
    first_seen: daysAgo(11),
    last_seen: daysAgo(10),
    primary_sentiment: "positive",
    risk_flags: ["none"],
    pickup_count: 3,
  },
  {
    id: 5,
    headline: "Carlos Diaz interview on BioMar sustainability strategy",
    story_summary:
      "In a long-form interview with IntraFish, BioMar CEO Carlos Diaz discussed the company's 2030 net-zero roadmap and pushback on rising fishmeal dependency claims.",
    first_seen: daysAgo(14),
    last_seen: daysAgo(14),
    primary_sentiment: "neutral",
    risk_flags: ["exec_statement"],
    pickup_count: 2,
  },
  {
    id: 6,
    headline: "Chile tightens aquaculture environmental rules",
    story_summary:
      "Chilean regulator Sernapesca published draft rules tightening nitrogen discharge limits at salmon farms; feed suppliers including BioMar are mentioned as needing to adjust formulations.",
    first_seen: daysAgo(16),
    last_seen: daysAgo(15),
    primary_sentiment: "neutral",
    risk_flags: ["legal", "controversy"],
    pickup_count: 3,
  },
  {
    id: 7,
    headline: "Algae-based feed trial: BioMar reports 92% growth parity",
    story_summary:
      "Trial results from BioMar's LARVIVA algae-substituted formulation showed 92% growth performance vs. control with a 30% reduction in marine-ingredient inclusion.",
    first_seen: daysAgo(19),
    last_seen: daysAgo(19),
    primary_sentiment: "positive",
    risk_flags: ["none"],
    pickup_count: 2,
  },
  {
    id: 8,
    headline: "Fishmeal supply pressure squeezes feed margins",
    story_summary:
      "Peruvian anchovy quota cuts and El Niño aftereffects continue to pressure fishmeal pricing. Analyst note flags BioMar and Cargill as most exposed.",
    first_seen: daysAgo(22),
    last_seen: daysAgo(20),
    primary_sentiment: "negative",
    risk_flags: ["financial"],
    pickup_count: 2,
  },
  {
    id: 9,
    headline: "Scottish salmon farming faces renewed criticism",
    story_summary:
      "WildFish campaign report criticizes Scottish salmon industry over mortality rates; feed companies named as part of the supply chain. BioMar's name appears in passing.",
    first_seen: daysAgo(25),
    last_seen: daysAgo(24),
    primary_sentiment: "negative",
    risk_flags: ["controversy"],
    pickup_count: 2,
  },
  {
    id: 10,
    headline: "EU CSRD: aquafeed producers prep first disclosures",
    story_summary:
      "Commentary piece on the European sustainability disclosure regime mentions BioMar as having published an early voluntary report.",
    first_seen: daysAgo(28),
    last_seen: daysAgo(28),
    primary_sentiment: "neutral",
    risk_flags: ["legal"],
    pickup_count: 1,
  },
];

const O = {
  undercurrent: "Undercurrent News",
  salmonbiz: "SalmonBusiness",
  intrafish: "IntraFish",
  reuters: "Reuters",
  bloomberg: "Bloomberg",
  ffe: "Fish Farming Expert",
  hatchery: "Hatchery International",
  aftenposten: "Aftenposten",
  borsen: "Børsen",
  mercurio: "El Mercurio",
  thefishsite: "The Fish Site",
  seafoodsource: "SeafoodSource",
};

let _id = 0;
const m = (
  story_id: number,
  source_name: string,
  language: Mention["language"],
  daysOld: number,
  hour: number,
  partial: Partial<Mention>,
): Mention => ({
  id: ++_id,
  story_id,
  url: `https://${source_name.toLowerCase().replace(/\s+/g, "")}.example/article-${++_id}`,
  title: partial.title || "untitled",
  source_name,
  language,
  published_at: daysAgo(daysOld, hour),
  sentiment: partial.sentiment || "neutral",
  sentiment_confidence: partial.sentiment_confidence ?? 0.85,
  prominence: partial.prominence || "primary",
  angle: partial.angle || "",
  key_claims: partial.key_claims || [],
  people_quoted: partial.people_quoted || [],
  risk_flags: partial.risk_flags || ["none"],
  summary: partial.summary || "",
});

export const MENTIONS: Mention[] = [
  // Story 1: Norwegian mortality + feed batch (5 pickups, negative)
  m(1, O.aftenposten, "no", 2, 8, {
    title: "Lerøy-anlegg rammet av høy dødelighet — fôrleverandør gransker",
    sentiment: "negative",
    sentiment_confidence: 0.92,
    prominence: "primary",
    angle: "regulatory investigation, supplier accountability",
    key_claims: [
      "Mortality rates exceeded 8% at affected pens",
      "BioMar confirms it is investigating the implicated feed batch",
    ],
    people_quoted: [{ name: "Carlos Diaz", affiliation: "BioMar Group, CEO", quote_summary: "Cooperating fully with regulators" }],
    risk_flags: ["product_issue", "controversy"],
    summary: "Lerøy reports significant mortality event; preliminary findings point to a specific BioMar feed batch under investigation.",
  }),
  m(1, O.intrafish, "en", 2, 11, {
    title: "BioMar feed batch under investigation after Lerøy mortality event",
    sentiment: "negative",
    prominence: "primary",
    angle: "supplier under scrutiny",
    key_claims: ["Norwegian Food Safety Authority opens inquiry"],
    risk_flags: ["product_issue"],
    summary: "Mattilsynet has opened an inquiry. BioMar pulled the affected batch.",
  }),
  m(1, O.salmonbiz, "en", 1, 9, {
    title: "Mattilsynet probes feed-linked salmon mortality at Lerøy site",
    sentiment: "negative",
    prominence: "primary",
    angle: "regulator-driven",
    key_claims: ["Estimated biological loss could reach NOK 40m"],
    risk_flags: ["product_issue", "financial"],
    summary: "Industry watchers cite NOK 40m biological loss estimate.",
  }),
  m(1, O.undercurrent, "en", 1, 13, {
    title: "BioMar pulls implicated feed lot, says investigation is ongoing",
    sentiment: "neutral",
    prominence: "primary",
    angle: "company response",
    key_claims: ["Lot 24-NO-3387 withdrawn", "No customer-facing recall outside Norway"],
    risk_flags: ["product_issue"],
    summary: "BioMar withdrew lot 24-NO-3387 and says no other markets affected.",
  }),
  m(1, O.ffe, "en", 0, 14, {
    title: "Q&A: what we know about the Lerøy mortality investigation",
    sentiment: "negative",
    prominence: "primary",
    angle: "explainer",
    key_claims: [],
    risk_flags: ["product_issue", "controversy"],
    summary: "Explainer piece walking through the timeline and open questions.",
  }),

  // Story 2: Schouw Q1 (4 pickups, positive financial)
  m(2, O.borsen, "da", 5, 8, {
    title: "Schouw & Co løfter BioMar-segment med 8% i Q1",
    sentiment: "positive",
    prominence: "primary",
    angle: "earnings beat",
    key_claims: ["BioMar revenue DKK 4.1bn in Q1", "EBIT margin up 60bps"],
    people_quoted: [{ name: "Jens Bjerg Sørensen", affiliation: "Schouw & Co, President", quote_summary: "Margins improving on lower fishmeal" }],
    risk_flags: ["financial"],
    summary: "Schouw Q1 report; BioMar segment up 8% YoY on Chile and Norway demand.",
  }),
  m(2, O.reuters, "en", 5, 10, {
    title: "Denmark's Schouw raises outlook on BioMar feed strength",
    sentiment: "positive",
    prominence: "primary",
    angle: "earnings",
    key_claims: ["FY guidance raised to top end of prior range"],
    risk_flags: ["financial"],
    summary: "Schouw lifted FY guidance citing BioMar performance.",
  }),
  m(2, O.bloomberg, "en", 5, 12, {
    title: "Schouw & Co beats Q1 estimates as feed margin expands",
    sentiment: "positive",
    prominence: "primary",
    angle: "earnings beat",
    risk_flags: ["financial"],
    summary: "Beat consensus by ~6% on operating profit.",
  }),
  m(2, O.intrafish, "en", 4, 9, {
    title: "BioMar Q1: Chile and Norway lead growth, Ecuador soft",
    sentiment: "positive",
    prominence: "primary",
    angle: "segment breakdown",
    risk_flags: ["financial"],
    summary: "Regional breakdown: strong Chile/Norway, soft Ecuador shrimp volumes.",
  }),

  // Story 3: Costa Rica plant (3 pickups, positive)
  m(3, O.thefishsite, "en", 8, 11, {
    title: "BioMar opens 100,000-tonne plant in Puntarenas, Costa Rica",
    sentiment: "positive",
    prominence: "primary",
    angle: "expansion announcement",
    key_claims: ["Plant capacity 100,000 t/year", "Investment ~USD 60m"],
    people_quoted: [{ name: "Carlos Diaz", affiliation: "BioMar Group, CEO", quote_summary: "Strategic foothold for Central America" }],
    risk_flags: ["none"],
    summary: "Opening ceremony attended by CEO; plant targets shrimp and tilapia markets.",
  }),
  m(3, O.mercurio, "es", 8, 12, {
    title: "BioMar inaugura planta en Puntarenas para mercado centroamericano",
    sentiment: "positive",
    prominence: "primary",
    angle: "regional investment",
    risk_flags: ["none"],
    summary: "Spanish-language coverage of the Costa Rica plant opening.",
  }),
  m(3, O.undercurrent, "en", 7, 10, {
    title: "BioMar bets on Central American shrimp with new feed mill",
    sentiment: "positive",
    prominence: "primary",
    angle: "strategy",
    risk_flags: ["none"],
    summary: "Analysis piece on BioMar's Central America expansion.",
  }),

  // Story 4: Skretting / Innovafeed insect protein (3 pickups, positive)
  m(4, O.intrafish, "en", 11, 9, {
    title: "BioMar, Skretting team with Innovafeed on insect protein at scale",
    sentiment: "positive",
    prominence: "primary",
    angle: "industry collaboration",
    key_claims: ["Multi-year MoU", "Industrial-scale BSF meal evaluation"],
    risk_flags: ["none"],
    summary: "Two largest aquafeed producers announce precompetitive partnership.",
  }),
  m(4, O.seafoodsource, "en", 11, 10, {
    title: "Aquafeed rivals join forces on insect-protein feasibility",
    sentiment: "positive",
    prominence: "primary",
    risk_flags: ["none"],
    summary: "Coverage of the BioMar-Skretting-Innovafeed announcement.",
  }),
  m(4, O.thefishsite, "en", 10, 13, {
    title: "Black soldier fly meal: are aquafeed giants finally ready?",
    sentiment: "positive",
    prominence: "secondary",
    angle: "trend piece",
    risk_flags: ["none"],
    summary: "Trend piece using the partnership as the lede.",
  }),

  // Story 5: Carlos Diaz interview (2 pickups, neutral, exec_statement)
  m(5, O.intrafish, "en", 14, 8, {
    title: "Long read: Carlos Diaz on BioMar's path to net-zero",
    sentiment: "neutral",
    prominence: "primary",
    angle: "executive interview",
    key_claims: ["2030 emissions target reaffirmed", "Pushback on fishmeal-dependency narrative"],
    people_quoted: [{ name: "Carlos Diaz", affiliation: "BioMar Group, CEO", quote_summary: "Net-zero roadmap remains on track; fishmeal critics misread the data" }],
    risk_flags: ["exec_statement"],
    summary: "Wide-ranging interview on strategy, sustainability, and competition.",
  }),
  m(5, O.undercurrent, "en", 14, 14, {
    title: "BioMar CEO defends sustainability record in IntraFish interview",
    sentiment: "neutral",
    prominence: "primary",
    angle: "follow-up",
    risk_flags: ["exec_statement"],
    summary: "Pickup of the IntraFish interview.",
  }),

  // Story 6: Chile rules (3 pickups, neutral, legal)
  m(6, O.mercurio, "es", 16, 9, {
    title: "Sernapesca propone nuevos límites de descarga de nitrógeno",
    sentiment: "neutral",
    prominence: "secondary",
    angle: "regulatory draft",
    risk_flags: ["legal", "controversy"],
    summary: "Chilean regulator proposes tighter nitrogen discharge rules.",
  }),
  m(6, O.salmonbiz, "en", 16, 11, {
    title: "Chile readies tighter aquaculture rules; feed makers face reformulation",
    sentiment: "negative",
    prominence: "secondary",
    angle: "industry impact",
    risk_flags: ["legal"],
    summary: "Industry implications of the proposed rules.",
  }),
  m(6, O.intrafish, "en", 15, 10, {
    title: "What Chile's draft nitrogen rules mean for BioMar, Skretting, Cargill",
    sentiment: "neutral",
    prominence: "primary",
    angle: "explainer",
    risk_flags: ["legal"],
    summary: "Explainer on which feed makers are most exposed.",
  }),

  // Story 7: Algae trial (2 pickups, positive)
  m(7, O.thefishsite, "en", 19, 9, {
    title: "BioMar's LARVIVA algae trial hits 92% growth parity",
    sentiment: "positive",
    prominence: "primary",
    angle: "R&D milestone",
    key_claims: ["92% growth parity vs. control", "30% lower marine ingredient inclusion"],
    risk_flags: ["none"],
    summary: "Trial results published in peer-reviewed journal.",
  }),
  m(7, O.hatchery, "en", 19, 12, {
    title: "Algae substitution in larval feeds: where the data is",
    sentiment: "positive",
    prominence: "secondary",
    risk_flags: ["none"],
    summary: "Roundup mentioning BioMar's LARVIVA results.",
  }),

  // Story 8: Fishmeal supply (2 pickups, negative, financial)
  m(8, O.bloomberg, "en", 22, 8, {
    title: "Anchovy shortfall keeps fishmeal at multi-year highs",
    sentiment: "negative",
    prominence: "secondary",
    angle: "commodity",
    key_claims: ["Peruvian quota cut 18% YoY"],
    risk_flags: ["financial"],
    summary: "Bloomberg commodity piece flagging exposure of major aquafeed buyers.",
  }),
  m(8, O.undercurrent, "en", 20, 10, {
    title: "Analyst note: BioMar, Cargill most exposed to fishmeal squeeze",
    sentiment: "negative",
    prominence: "primary",
    angle: "analyst note",
    risk_flags: ["financial"],
    summary: "Sell-side note naming most-exposed players.",
  }),

  // Story 9: Scottish criticism (2 pickups, negative, controversy)
  m(9, O.ffe, "en", 25, 11, {
    title: "WildFish report blasts Scottish salmon industry mortality rates",
    sentiment: "negative",
    prominence: "passing",
    angle: "NGO campaign",
    risk_flags: ["controversy"],
    summary: "BioMar named in passing as part of the supply chain.",
  }),
  m(9, O.thefishsite, "en", 24, 9, {
    title: "Salmon industry pushes back on WildFish mortality claims",
    sentiment: "negative",
    prominence: "passing",
    angle: "industry response",
    risk_flags: ["controversy"],
    summary: "Industry response piece referencing feed companies.",
  }),

  // Story 10: CSRD (1 pickup, neutral, legal)
  m(10, O.seafoodsource, "en", 28, 10, {
    title: "Aquafeed producers brace for first CSRD disclosure cycle",
    sentiment: "neutral",
    prominence: "passing",
    angle: "regulatory commentary",
    key_claims: ["BioMar published early voluntary report"],
    risk_flags: ["legal"],
    summary: "Commentary on CSRD readiness across the sector.",
  }),
];

export function mentionsForStory(storyId: number): Mention[] {
  return MENTIONS.filter((m) => m.story_id === storyId);
}

export const ALL_OUTLETS = Array.from(new Set(MENTIONS.map((m) => m.source_name))).sort();
