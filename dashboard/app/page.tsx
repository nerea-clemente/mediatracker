"use client";

import { useMemo, useState } from "react";
import {
  GENERATED_AT,
  IS_MOCK,
  MENTIONS,
  SHARE_OF_VOICE,
  STORIES,
  mentionsForStory,
  type Mention,
  type RiskFlag,
  type Sentiment,
  type Story,
} from "@/lib/data";
import { downloadXlsx, printDashboard } from "@/lib/exports";
import {
  CountryBar,
  SentimentChart,
  ShareOfVoiceArea,
  ShareOfVoicePie,
  TopOutletsChart,
  VolumeChart,
} from "@/components/charts";

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

type DateRange = "24h" | "7d" | "14d" | "30d" | "3m" | "qtd" | "ytd" | "1y" | "all";
type Language = "all" | "en" | "da" | "no" | "es";

const LANGUAGE_LABELS: Record<Exclude<Language, "all">, string> = {
  en: "English",
  da: "Danish",
  no: "Norwegian",
  es: "Spanish",
};
type SortKey = "last_seen" | "pickup_count" | "sentiment";

const REFERENCE_NOW = new Date("2026-05-01T08:00:00Z");

// Reference for "today" — always now() so windows roll forward without a redeploy.
function rangeCutoff(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  const cutoff = new Date(now);
  switch (range) {
    case "24h":
      cutoff.setUTCHours(now.getUTCHours() - 24);
      break;
    case "7d":
      cutoff.setUTCDate(now.getUTCDate() - 7);
      break;
    case "14d":
      cutoff.setUTCDate(now.getUTCDate() - 14);
      break;
    case "30d":
      cutoff.setUTCDate(now.getUTCDate() - 30);
      break;
    case "3m":
      cutoff.setUTCMonth(now.getUTCMonth() - 3);
      break;
    case "1y":
      cutoff.setUTCFullYear(now.getUTCFullYear() - 1);
      break;
    case "qtd": {
      const q = Math.floor(now.getUTCMonth() / 3) * 3;
      return new Date(Date.UTC(now.getUTCFullYear(), q, 1));
    }
    case "ytd":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }
  return cutoff;
}

function withinRange(iso: string, range: DateRange): boolean {
  const cutoff = rangeCutoff(range);
  if (!cutoff) return true;
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
      <tr className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-3 py-3 align-top">
          <div className="flex items-start gap-2 min-w-0">
            <span className={`text-xs w-3 mt-0.5 shrink-0 transition-colors ${expanded ? "text-[#0471ad]" : "text-slate-400"}`}>{expanded ? "▾" : "▸"}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 line-clamp-2">{story.headline}</div>
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
                {IS_MOCK && (
                  <div className="text-[11px] text-slate-400 mb-2 italic">
                    Mock data: links open the outlet homepage, not a real article.
                  </div>
                )}
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
  const [language, setLanguage] = useState<Language>("all");
  const [showOffTopic, setShowOffTopic] = useState(false);
  const [hideReleases, setHideReleases] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | "all">("all");
  const [risk, setRisk] = useState<RiskFlag | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Main view = BioMar mentions only. Competitor mentions are aggregated
  // into the share-of-voice section but never appear in the story table
  // or sentiment/risk charts.
  const biomarMentions = useMemo(
    () => MENTIONS.filter((m) => (m.company ?? "BioMar") === "BioMar"),
    [],
  );

  const filteredMentions = useMemo(() => {
    return biomarMentions.filter((m) => {
      if (!withinRange(m.published_at, dateRange)) return false;
      if (language !== "all" && m.language !== language) return false;
      // Off-topic mentions are hidden unless the user opts in. Default
      // (no analysis yet, or no field) is treated as "on-topic".
      if (!showOffTopic && m.is_about_target_brand === false) return false;
      if (hideReleases && m.outlet_kind === "release") return false;
      if (sentiment !== "all" && m.sentiment !== sentiment) return false;
      if (risk !== "all" && !m.risk_flags.includes(risk)) return false;
      return true;
    });
  }, [biomarMentions, dateRange, language, sentiment, risk, showOffTopic, hideReleases]);

  // Share of voice = mentions (BioMar + competitors) bucketed by company.
  // Filtered by date range so trends are comparable, and — like the main
  // view — off-topic mentions (wrong-company "Biomar" namesakes) are
  // excluded unless the user opts in, so they don't inflate any company's
  // share.
  const sovMentions = useMemo(
    () =>
      MENTIONS.filter(
        (m) =>
          withinRange(m.published_at, dateRange) &&
          (showOffTopic || m.is_about_target_brand !== false) &&
          !(hideReleases && m.outlet_kind === "release"),
      ),
    [dateRange, showOffTopic, hideReleases],
  );

  const sovPeriodTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const m of sovMentions) {
      const c = m.company ?? "Other";
      totals.set(c, (totals.get(c) ?? 0) + 1);
    }
    return SHARE_OF_VOICE.companies.map((c) => ({ company: c, count: totals.get(c) ?? 0 }));
  }, [sovMentions]);

  const sovTimeseries = useMemo(() => {
    // Compute the per-week, per-company series client-side from the same
    // filtered mention set the pie uses — so date range and the off-topic
    // toggle apply consistently to both charts.
    const weekOf = (iso: string) => {
      const d = new Date(iso);
      const y = d.getUTCFullYear();
      const oneJan = new Date(Date.UTC(y, 0, 1));
      const day = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
      const week = Math.ceil((day + oneJan.getUTCDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    };
    const byWeek = new Map<string, Record<string, number>>();
    for (const m of sovMentions) {
      if (!m.published_at) continue;
      const wk = weekOf(m.published_at);
      if (!byWeek.has(wk)) byWeek.set(wk, {});
      const c = m.company ?? "Other";
      byWeek.get(wk)![c] = (byWeek.get(wk)![c] ?? 0) + 1;
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, counts]) => {
        const row: Record<string, number | string> = { week };
        for (const c of SHARE_OF_VOICE.companies) row[c] = counts[c] ?? 0;
        return row as { week: string } & Record<string, number | string>;
      });
  }, [sovMentions]);

  const filteredStories = useMemo(() => {
    const visibleStoryIds = new Set(filteredMentions.map((m) => m.story_id));
    let stories = STORIES.filter(
      (s) => (s.company ?? "BioMar") === "BioMar" && visibleStoryIds.has(s.id),
    );
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
      (s) =>
        (s.company ?? "BioMar") === "BioMar" &&
        s.risk_flags.some((f) => f !== "none") &&
        withinRange(s.last_seen, "7d"),
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
    <main className="max-w-7xl mx-auto px-4 py-5 sm:p-6 space-y-5 sm:space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-block w-1.5 h-7 rounded bg-[#0471ad] shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">BioMar coverage</h1>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              {IS_MOCK
                ? "Mock data · the scheduled refresh hasn't run yet."
                : GENERATED_AT
                ? `Last refreshed ${new Date(GENERATED_AT).toLocaleString()} (UTC build).`
                : "Live data."}
              {" "}
              <span className="text-slate-400">·</span> {filteredMentions.length} mentions in view across {filteredStories.length} stories.
            </p>
            <p className="text-xs text-slate-500 mt-3 italic max-w-3xl leading-relaxed">
              Pilot / test version. Coverage refreshes four times daily Danish time
              (07:30, 11:30, 18:00, 00:00). Hard-paywalled Danish business outlets
              (Børsen, Finans.dk, Berlingske premium) are not indexed by Google
              News and are <span className="not-italic font-semibold">not</span> covered by this build. Questions or feedback?{" "}
              <a href="mailto:nerpa@biomar.com" className="text-[#0471ad] hover:underline not-italic font-medium">
                nerpa@biomar.com
              </a>
              .
            </p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 pt-1 shrink-0 hidden sm:block">mediatracker</div>
        </div>
      </header>

      {/* Stat cards — at-a-glance numbers respecting current filters. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Mentions" value={filteredMentions.length} hint="in current view" />
        <StatCard label="Stories" value={filteredStories.length} hint="after clustering" />
        <StatCard
          label="% positive"
          value={(() => {
            const an = filteredMentions.filter((m) => m.sentiment_confidence > 0);
            if (!an.length) return "—";
            const pos = an.filter((m) => m.sentiment === "positive").length;
            return `${Math.round((pos / an.length) * 100)}%`;
          })()}
          hint={`of ${filteredMentions.filter((m) => m.sentiment_confidence > 0).length} analyzed`}
        />
        <StatCard
          label="Risk-flagged · 7d"
          value={riskStoriesLast7d.length}
          hint="stories with any non-none flag"
          accent={riskStoriesLast7d.length > 0 ? "amber" : undefined}
        />
      </section>

      {IS_MOCK && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <strong>This is mock data.</strong> The first scheduled run will replace it with real
          BioMar coverage. Trigger it manually from the Actions tab if you don't want to wait.
        </div>
      )}

      {/* Export toolbar */}
      <section className="no-print flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Export</span>
        <button
          onClick={() => downloadXlsx(filteredStories, filteredMentions)}
          className="inline-flex items-center gap-1.5 rounded border border-[#0471ad] bg-[#0471ad] text-white px-3 py-1.5 hover:bg-[#03578a] hover:border-[#03578a] transition-colors font-medium"
          title="Two-sheet workbook (Stories + Mentions) with clickable article links. Filters applied."
        >
          <span>⤓</span> Excel (.xlsx)
          <span className="text-sky-100/80">({filteredStories.length} stories · {filteredMentions.length} mentions)</span>
        </button>
        <button
          onClick={printDashboard}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 hover:border-slate-400 hover:bg-slate-50 transition-colors"
          title="Open the browser print dialog (Save as PDF available there)"
        >
          <span>🖨</span> Print / PDF
        </button>
        <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">Both exports respect the active filters</span>
      </section>

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
      <section className="no-print rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FilterBox label="Date range">
            <select className="filter-select" value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}>
              <option value="24h">Past 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="3m">Last 3 months</option>
              <option value="qtd">Quarter to date</option>
              <option value="ytd">Year to date</option>
              <option value="1y">Last year</option>
              <option value="all">All time</option>
            </select>
          </FilterBox>
          <FilterBox label="Language">
            <select className="filter-select" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="all">All languages</option>
              {(Object.keys(LANGUAGE_LABELS) as (keyof typeof LANGUAGE_LABELS)[]).map((code) => (
                <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>
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
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
          <label className="flex items-start sm:items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-slate-300 mt-0.5 sm:mt-0 shrink-0"
              checked={showOffTopic}
              onChange={(e) => setShowOffTopic(e.target.checked)}
            />
            <span>
              Include off-topic mentions{" "}
              <span className="text-slate-400">
                (other companies sharing the &ldquo;Biomar&rdquo; name)
              </span>
            </span>
          </label>
          <label className="flex items-start sm:items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-slate-300 mt-0.5 sm:mt-0 shrink-0"
              checked={hideReleases}
              onChange={(e) => setHideReleases(e.target.checked)}
            />
            <span>
              Hide press releases{" "}
              <span className="text-slate-400">
                (PR wires &amp; aggregators — NTB, Ritzau, Mynewsdesk, etc.)
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Charts */}
      <section className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Volume over time" subtitle="Mentions per day">
          <VolumeChart mentions={filteredMentions} />
        </ChartCard>
        <ChartCard title="Sentiment breakdown" subtitle={`pos ${sentimentBreakdown.positive} · neu ${sentimentBreakdown.neutral} · neg ${sentimentBreakdown.negative}`}>
          <SentimentChart mentions={filteredMentions} />
        </ChartCard>
        <ChartCard title="Top outlets" subtitle="Pickups per source">
          <TopOutletsChart mentions={filteredMentions} />
        </ChartCard>
        <ChartCard title="By country / region" subtitle="Where the coverage is published">
          <CountryBar mentions={filteredMentions} />
        </ChartCard>
      </section>

      {/* Share of Voice */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="font-semibold text-slate-900">Share of voice</div>
            <div className="text-xs text-slate-500">
              BioMar vs Skretting vs Cargill — mention count by ISO week and total share for the selected range. Competitor mentions aren&apos;t analyzed individually.
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Total: {sovPeriodTotals.reduce((s, r) => s + r.count, 0)} mentions
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Volume over time (per week)
            </div>
            <ShareOfVoiceArea data={sovTimeseries} companies={SHARE_OF_VOICE.companies} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Share for selected range
            </div>
            <ShareOfVoicePie data={sovPeriodTotals} />
          </div>
        </div>
        {sovPeriodTotals.every((r) => r.company === "BioMar" || r.count === 0) && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            No competitor mentions ingested yet. The next scheduled refresh (or a manual <em>Run workflow</em>) will pull Skretting and Cargill coverage.
          </div>
        )}
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
        <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[640px]">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-40" />
            <col className="w-16" />
            <col className="w-24" />
          </colgroup>
          <thead className="bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Headline</th>
              <th className="px-3 py-2 text-left">Sentiment</th>
              <th className="px-3 py-2 text-left">Risk flags</th>
              <th className="px-3 py-2 text-left">Pickups</th>
              <th className="px-3 py-2 text-left">Last seen</th>
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
        </div>
      </section>

      <footer className="text-xs text-slate-400 pt-2">
        {IS_MOCK
          ? "All data on this page is fabricated for layout review."
          : "Data refreshed by the scheduled GitHub Actions workflow. Click any story for the full pickup list and analysis."}
      </footer>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "amber";
}) {
  const accentClasses =
    accent === "amber"
      ? "border-amber-300 bg-amber-50"
      : "border-slate-200 bg-white";
  const valueClass =
    accent === "amber" ? "text-amber-900" : "text-slate-900";
  return (
    <div className={`rounded-lg border ${accentClasses} px-4 py-3`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
