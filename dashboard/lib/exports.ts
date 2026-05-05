// Export helpers. All client-side: CSV, XLSX (multi-sheet), browser print.
// xlsx is loaded lazily on click — it's ~700KB and would otherwise bloat
// the initial page load.

import type { Mention, Story } from "./data";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const r of rows) lines.push(r.map(escapeCsv).join(","));
  // BOM so Excel detects UTF-8 (otherwise Norwegian/Spanish accents go sideways).
  return "﻿" + lines.join("\r\n");
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadStoriesCsv(stories: Story[]) {
  const headers = [
    "id",
    "headline",
    "company",
    "primary_sentiment",
    "risk_flags",
    "pickup_count",
    "first_seen",
    "last_seen",
    "is_about_target_brand",
    "story_summary",
  ];
  const rows = stories.map((s) => [
    s.id,
    s.headline,
    s.company ?? "",
    s.primary_sentiment,
    s.risk_flags.filter((f) => f !== "none").join("|"),
    s.pickup_count,
    s.first_seen,
    s.last_seen,
    s.is_about_target_brand ?? "",
    s.story_summary,
  ]);
  triggerDownload(rowsToCsv(headers, rows), `biomar-stories-${isoDate()}.csv`);
}

export function downloadMentionsCsv(mentions: Mention[]) {
  const headers = [
    "id",
    "story_id",
    "title",
    "url",
    "outlet",
    "company",
    "language",
    "published_at",
    "sentiment",
    "sentiment_confidence",
    "prominence",
    "angle",
    "risk_flags",
    "key_claims",
    "people_quoted",
    "is_about_target_brand",
    "summary",
  ];
  const rows = mentions.map((m) => [
    m.id,
    m.story_id,
    m.title,
    m.url,
    m.source_name,
    m.company ?? "",
    m.language,
    m.published_at,
    m.sentiment,
    m.sentiment_confidence,
    m.prominence,
    m.angle,
    m.risk_flags.filter((f) => f !== "none").join("|"),
    m.key_claims.join(" | "),
    m.people_quoted.map((p) => `${p.name} (${p.affiliation})`).join("; "),
    m.is_about_target_brand ?? "",
    m.summary,
  ]);
  triggerDownload(rowsToCsv(headers, rows), `biomar-mentions-${isoDate()}.csv`);
}

export function printDashboard() {
  if (typeof window !== "undefined") window.print();
}

// XLSX export: one workbook with two sheets — Stories and Mentions.
// Column widths set so headlines and summaries are readable on open.

type StoryRow = {
  ID: number;
  Headline: string;
  Company: string;
  Sentiment: string;
  "Risk flags": string;
  Pickups: number;
  "First seen": string;
  "Last seen": string;
  "Off-topic?": string;
  "Story summary": string;
};

type MentionRow = {
  ID: number;
  "Story ID": number;
  Title: string;
  URL: string;
  Outlet: string;
  Company: string;
  Language: string;
  Published: string;
  Sentiment: string;
  Confidence: number;
  Prominence: string;
  Angle: string;
  "Risk flags": string;
  "Key claims": string;
  "People quoted": string;
  "Off-topic?": string;
  Summary: string;
};

export async function downloadXlsx(stories: Story[], mentions: Mention[]) {
  // Dynamic import so xlsx (~700KB) loads only when the user actually exports.
  const XLSX = await import("xlsx");
  const storyRows: StoryRow[] = stories.map((s) => ({
    ID: s.id,
    Headline: s.headline,
    Company: s.company ?? "",
    Sentiment: s.primary_sentiment,
    "Risk flags": s.risk_flags.filter((f) => f !== "none").join(", "),
    Pickups: s.pickup_count,
    "First seen": s.first_seen,
    "Last seen": s.last_seen,
    "Off-topic?": s.is_about_target_brand === false ? "yes" : "",
    "Story summary": s.story_summary,
  }));

  const mentionRows: MentionRow[] = mentions.map((m) => ({
    ID: m.id,
    "Story ID": m.story_id,
    Title: m.title,
    URL: m.url,
    Outlet: m.source_name,
    Company: m.company ?? "",
    Language: m.language,
    Published: m.published_at,
    Sentiment: m.sentiment,
    Confidence: Number(m.sentiment_confidence?.toFixed?.(2) ?? m.sentiment_confidence ?? 0),
    Prominence: m.prominence,
    Angle: m.angle,
    "Risk flags": m.risk_flags.filter((f) => f !== "none").join(", "),
    "Key claims": m.key_claims.join(" | "),
    "People quoted": m.people_quoted.map((p) => `${p.name} (${p.affiliation})`).join("; "),
    "Off-topic?": m.is_about_target_brand === false ? "yes" : "",
    Summary: m.summary,
  }));

  const wb = XLSX.utils.book_new();

  const storiesSheet = XLSX.utils.json_to_sheet(storyRows);
  storiesSheet["!cols"] = [
    { wch: 5 }, { wch: 60 }, { wch: 10 }, { wch: 10 },
    { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(wb, storiesSheet, "Stories");

  const mentionsSheet = XLSX.utils.json_to_sheet(mentionRows);
  mentionsSheet["!cols"] = [
    { wch: 5 }, { wch: 8 }, { wch: 60 }, { wch: 50 }, { wch: 22 },
    { wch: 10 }, { wch: 8 }, { wch: 22 }, { wch: 9 }, { wch: 10 },
    { wch: 11 }, { wch: 28 }, { wch: 22 }, { wch: 50 }, { wch: 30 },
    { wch: 10 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, mentionsSheet, "Mentions");

  XLSX.writeFile(wb, `biomar-coverage-${isoDate()}.xlsx`);
}
