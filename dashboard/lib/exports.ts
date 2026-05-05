// Export helpers. Two formats: XLSX (multi-sheet workbook with clickable
// links) and Print/Save-as-PDF. xlsx is loaded lazily on click — it's
// ~700KB and would otherwise bloat the initial page load.

import type { Mention, Story } from "./data";

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function printDashboard() {
  if (typeof window !== "undefined") window.print();
}

// --- XLSX (multi-sheet workbook) ----------------------------------------
//
// Two sheets:
//   - Stories: one row per clustered story; headline is a hyperlink to
//     the primary article (or the first pickup if no primary).
//   - Mentions: one row per article; URL column is a hyperlink.

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

function representativeUrl(storyId: number, mentions: Mention[]): string | null {
  const own = mentions.filter((m) => m.story_id === storyId);
  if (!own.length) return null;
  const primary = own.find((m) => m.prominence === "primary");
  return (primary ?? own[0]).url || null;
}

export async function downloadXlsx(stories: Story[], mentions: Mention[]) {
  // Dynamic import so xlsx (~700KB) loads only on click.
  const XLSX = await import("xlsx");

  // Stories sheet --------------------------------------------------------
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
  const storiesSheet = XLSX.utils.json_to_sheet(storyRows);
  storiesSheet["!cols"] = [
    { wch: 5 }, { wch: 60 }, { wch: 10 }, { wch: 10 },
    { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 70 },
  ];
  // Hyperlink the Headline cell (column B, index 1) for each story row.
  for (let i = 0; i < stories.length; i++) {
    const url = representativeUrl(stories[i].id, mentions);
    if (!url) continue;
    const ref = XLSX.utils.encode_cell({ c: 1, r: i + 1 }); // +1 skips the header row
    const cell = storiesSheet[ref];
    if (cell) cell.l = { Target: url, Tooltip: "Open article" };
  }

  // Mentions sheet -------------------------------------------------------
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
  const mentionsSheet = XLSX.utils.json_to_sheet(mentionRows);
  mentionsSheet["!cols"] = [
    { wch: 5 }, { wch: 8 }, { wch: 60 }, { wch: 50 }, { wch: 22 },
    { wch: 10 }, { wch: 8 }, { wch: 22 }, { wch: 9 }, { wch: 10 },
    { wch: 11 }, { wch: 28 }, { wch: 22 }, { wch: 50 }, { wch: 30 },
    { wch: 10 }, { wch: 60 },
  ];
  // Hyperlink the URL cell (column D, index 3) and the Title cell
  // (column C, index 2) — gives readers two click targets per row.
  for (let i = 0; i < mentions.length; i++) {
    const url = mentions[i].url;
    if (!url) continue;
    for (const colIdx of [2, 3]) {
      const ref = XLSX.utils.encode_cell({ c: colIdx, r: i + 1 });
      const cell = mentionsSheet[ref];
      if (cell) cell.l = { Target: url, Tooltip: "Open article" };
    }
  }

  // Build the actual workbook with both sheets.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, storiesSheet, "Stories");
  XLSX.utils.book_append_sheet(wb, mentionsSheet, "Mentions");
  XLSX.writeFile(wb, `biomar-coverage-${isoDate()}.xlsx`);
}
