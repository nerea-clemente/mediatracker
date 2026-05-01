"use client";

import { useMemo, useState } from "react";
import {
  ALL_OUTLETS,
  MENTIONS,
  STORIES,
  mentionsForStory,
  type Mention,
  type RiskFlag,
  type Sentiment,
  type Story,
} from "@/lib/data";
import { SentimentChart, TopOutletsChart, VolumeChart } from "@/components/charts";

const RISK_LABEL: Record<RiskFlag, string> = {
  legal: "Legal",
  financial: "Financial",
  controversy: "Controversy",
  exec_statement: "Exec statement",
  product_issue: "Product issue",
  none: "None",
};

const SENTIMENT_BADGE: Record<Sentiment, string> = {
  positive: "bg-green-100 text-green-800 ring-green-200",
  neutral: "bg-gray-100 text-gray-800 ring-gray-200",
  negative: "bg-red-100 text-red-800 ring-red-200",
};

const RISK_BADGE: Record<RiskFlag, string> = {
  legal: "bg-amber-100 text-amber-800 ring-amber-200",
  financial: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  controversy: "bg-orange-100 text-orange-800 ring-orange-200",
  exec_statement: "bg-sky-100 text-sky-800 ring-sky-200",
  product_issue: "bg-red-100 text-red-800 ring-red-200",
  none: "bg-gray-100 text-gray-600 ring-gray-200",
};

type DateRange = "7d" | "14d" | "30d" | "all";
type SortKey = "last_seen" | "pickup_count" | "sentiment";

const REFERENCE_NOW = new Date("2026-05-01T08:00:00Z");

function withinRange(iso: string, range: DateRange): boolean {
  if (range === "all") return true;
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const cutoff = new Date(REFERENCE_NOW);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return new Date(iso) >= cutoff;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

function StoryRow({ story, mentions, expanded, onToggle }: {
  story: Story;
  mentions: Mention[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs w-3">{expanded ? "▾" : "▸"}</span>
            <div>
              <div className="font-medium text-slate-900">{story.headline}</div>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{story.story_summary}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-top whitespace-nowrap">
          <Badge className={SENTIMENT_BADGE[story.primary_sentiment]}>{story.primary_sentiment}</Badge>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-wrap gap-1">
            {story.risk_flags.filter((f) => f !== "none").map((f) => (
              <Badge key={f} className={RISK_BADGE[f]}>{RISK_LABEL[f]}</Badge>
            ))}
            {story.risk_flags.every((f) => f === "none") && (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 align-top text-sm tabular-nums">{story.pickup_count}</td>
        <td className="px-3 py-3 align-top text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {story.last_seen.slice(0, 10)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60">
          <td colSpan={5} className="px-3 py-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Story summary</div>
                <p className="text-sm text-slate-700">{story.story_summary}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Pickups ({mentions.length})
                </div>
                <div className="text-[11px] text-slate-400 mb-2 italic">
                  Mock data: links open the outlet homepage, not a real article.
                </div>
                <ul className="space-y-2">
                  {mentions.map((m) => (
                    <li key={m.id} className="text-sm">
                      <a href={m.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                        {m.title}
                      </a>
                      <div className="text-xs text-slate-500">
                        {m.source_name} · {m.language} · {m.published_at.slice(0, 10)} ·{" "}
                        <Badge className={SENTIMENT_BADGE[m.sentiment]}>{m.sentiment}</Badge>{" "}
                        <span className="text-slate-400">{m.prominence}</span>
                      </div>
                      {m.angle && <div className="text-xs text-slate-600 mt-0.5"><span className="font-semibold">Angle:</span> {m.angle}</div>}
                      {m.key_claims.length > 0 && (
                        <ul className="text-xs text-slate-600 list-disc list-inside mt-0.5">
                          {m.key_claims.map((c, i) => (<li key={i}>{c}</li>))}
                        </ul>
                      )}
                      {m.people_quoted.length > 0 && (
                        <div className="text-xs text-slate-600 mt-0.5">
                          <span className="font-semibold">Quoted:</span>{" "}
                          {m.people_quoted.map((p) => `${p.name} (${p.affiliation})`).join("; ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Page() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [outlet, setOutlet] = useState<string>("all");
  const [sentiment, setSentiment] = useState<Sentiment | "all">("all");
  const [risk, setRisk] = useState<RiskFlag | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filteredMentions = useMemo(() => {
    return MENTIONS.filter((m) => {
      if (!withinRange(m.published_at, dateRange)) return false;
      if (outlet !== "all" && m.source_name !== outlet) return false;
      if (sentiment !== "all" && m.sentiment !== sentiment) return false;
      if (risk !== "all" && !m.risk_flags.includes(risk)) return false;
      return true;
    });
  }, [dateRange, outlet, sentiment, risk]);

  const filteredStories = useMemo(() => {
    const visibleStoryIds = new Set(filteredMentions.map((m) => m.story_id));
    let stories = STORIES.filter((s) => visibleStoryIds.has(s.id));
    stories = stories.sort((a, b) => {
      if (sortKey === "last_seen") return b.last_seen.localeCompare(a.last_seen);
      if (sortKey === "pickup_count") return b.pickup_count - a.pickup_count;
      const order: Record<Sentiment, number> = { negative: 0, neutral: 1, positive: 2 };
      return order[a.primary_sentiment] - order[b.primary_sentiment];
    });
    return stories;
  }, [filteredMentions, sortKey]);

  const riskStoriesLast7d = useMemo(() => {
    return STORIES.filter(
      (s) => s.risk_flags.some((f) => f !== "none") && withinRange(s.last_seen, "7d"),
    ).sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  }, []);

  const sentimentBreakdown = useMemo(() => {
    const c: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
    for (const m of filteredMentions) c[m.sentiment]++;
    return c;
  }, [filteredMentions]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">BioMar coverage</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mockup with seeded data · reference date 1 May 2026 · {filteredMentions.length} mentions in view across{" "}
            {filteredStories.length} stories
          </p>
        </div>
        <div className="text-xs text-slate-400">mediatracker · phase 4 preview</div>
      </header>

      {/* Risk highlights */}
      {riskStoriesLast7d.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">
            Risk-flagged stories · last 7 days
          </div>
          <ul className="space-y-2">
            {riskStoriesLast7d.map((s) => (
              <li key={s.id} className="flex items-start gap-3 text-sm">
                <Badge className={SENTIMENT_BADGE[s.primary_sentiment]}>{s.primary_sentiment}</Badge>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{s.headline}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{s.story_summary}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.risk_flags.filter((f) => f !== "none").map((f) => (
                      <Badge key={f} className={RISK_BADGE[f]}>{RISK_LABEL[f]}</Badge>
                    ))}
                    <span className="text-xs text-slate-500 ml-1">{s.pickup_count} pickups</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filters */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FilterBox label="Date range">
            <select className="filter-select" value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}>
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </FilterBox>
          <FilterBox label="Outlet">
            <select className="filter-select" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
              <option value="all">All outlets</option>
              {ALL_OUTLETS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </FilterBox>
          <FilterBox label="Sentiment">
            <select className="filter-select" value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment | "all")}>
              <option value="all">All</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </FilterBox>
          <FilterBox label="Risk flag">
            <select className="filter-select" value={risk} onChange={(e) => setRisk(e.target.value as RiskFlag | "all")}>
              <option value="all">Any</option>
              <option value="legal">Legal</option>
              <option value="financial">Financial</option>
              <option value="controversy">Controversy</option>
              <option value="exec_statement">Exec statement</option>
              <option value="product_issue">Product issue</option>
              <option value="none">None</option>
            </select>
          </FilterBox>
        </div>
      </section>

      {/* Charts */}
      <section className="grid lg:grid-cols-3 gap-4">
        <ChartCard title="Volume over time" subtitle="Mentions per day">
          <VolumeChart mentions={filteredMentions} />
        </ChartCard>
        <ChartCard title="Sentiment breakdown" subtitle={`pos ${sentimentBreakdown.positive} · neu ${sentimentBreakdown.neutral} · neg ${sentimentBreakdown.negative}`}>
          <SentimentChart mentions={filteredMentions} />
        </ChartCard>
        <ChartCard title="Top outlets" subtitle="Pickups per source">
          <TopOutletsChart mentions={filteredMentions} />
        </ChartCard>
      </section>

      {/* Stories table */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <div className="font-semibold text-slate-900">Stories</div>
            <div className="text-xs text-slate-500">Click a row to expand pickups & analysis</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Sort:</span>
            <select className="filter-select !w-auto" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="last_seen">Most recent</option>
              <option value="pickup_count">Most pickups</option>
              <option value="sentiment">Most negative first</option>
            </select>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Headline</th>
              <th className="px-3 py-2 text-left w-24">Sentiment</th>
              <th className="px-3 py-2 text-left w-48">Risk flags</th>
              <th className="px-3 py-2 text-left w-20">Pickups</th>
              <th className="px-3 py-2 text-left w-28">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filteredStories.map((s) => (
              <StoryRow
                key={s.id}
                story={s}
                mentions={mentionsForStory(s.id)}
                expanded={expanded.has(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
            {filteredStories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                  No stories match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="text-xs text-slate-400 pt-2">
        All data on this page is fabricated for layout review. Real data lands once Phases 2 (analyzer) and 3 (clustering) are wired up.
      </footer>
    </main>
  );
}

function FilterBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2">
        <div className="font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
