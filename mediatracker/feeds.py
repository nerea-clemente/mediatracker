"""Feed registry. Edit this file to change what we ingest.

Two adapters are wired up in Phase 1:

  * ``google_news``  — builds a Google News RSS query per language.
  * ``trade_press``  — generic RSS pulled from a known URL.

Each entry produces ``Mention`` rows tagged with ``source_type``,
``source_name``, ``feed_query``, ``matched_keyword``, and ``language``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ---------------------------------------------------------------------------
# Keywords. Edit these to retune what we track.
# ---------------------------------------------------------------------------

# Variations are OR-joined into the Google News query as quoted phrases.
# Exclusions are AND-NOTed. Google News query syntax supports OR, quotes, and
# leading-minus exclusions. Order of variations doesn't matter.
PRIMARY_KEYWORD = "BioMar"
PRIMARY_VARIATIONS = ["BioMar", "Bio Mar", "BioMar Group", "Biomar"]
PRIMARY_EXCLUDE = ["biomarker", "biomarkers", "biomarine"]

# Parent company — tagged separately so we can split BioMar vs. parent volume.
PARENT_KEYWORD = "Schouw"
PARENT_VARIATIONS = ["Schouw & Co", "Schouw og Co", "Schouw & Co."]

# Named executives. Searched as exact-quoted phrases.
EXEC_QUERIES = [
    {"keyword": "Carlos Diaz", "phrases": ["Carlos Diaz", "Carlos Díaz"], "context": "BioMar"},
    {"keyword": "Jens Bjerg Sørensen", "phrases": ["Jens Bjerg Sørensen", "Jens Bjerg Sorensen"], "context": None},
]


# ---------------------------------------------------------------------------
# Google News locales. One locale = one feed per query group.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GoogleNewsLocale:
    code: str          # short label we store in DB ('en', 'da', 'no', 'es')
    hl: str            # interface language
    gl: str            # country
    ceid: str          # 'COUNTRY:LANG'


GOOGLE_NEWS_LOCALES: list[GoogleNewsLocale] = [
    GoogleNewsLocale(code="en", hl="en-US", gl="US", ceid="US:en"),
    GoogleNewsLocale(code="da", hl="da",    gl="DK", ceid="DK:da"),
    GoogleNewsLocale(code="no", hl="no",    gl="NO", ceid="NO:no"),
    GoogleNewsLocale(code="es", hl="es-419", gl="CL", ceid="CL:es-419"),
]


# ---------------------------------------------------------------------------
# Trade press direct RSS feeds.
#
# IMPORTANT: these URLs are best-effort defaults. Some publications change or
# remove their RSS endpoints. If a feed 404s the ingest will log a warning
# and continue. Verify URLs at first run and edit here as needed.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TradePressFeed:
    name: str
    url: str
    language: str = "en"
    # Trade press feeds aren't keyword-filtered server-side, so we filter
    # client-side by these keywords (case-insensitive substring match).
    # Empty list = ingest everything (use only if the publication is fully
    # on-topic, like a BioMar dedicated newsletter).
    keyword_filter: list[str] = field(default_factory=list)


_DEFAULT_FILTER = [
    "biomar", "schouw",
    "larviva", "inicio", "efico", "orbit", "sigma",
    "carlos diaz", "carlos díaz",
    "jens bjerg",
]

TRADE_PRESS_FEEDS: list[TradePressFeed] = [
    TradePressFeed(
        name="Undercurrent News",
        url="https://www.undercurrentnews.com/feed/",
        keyword_filter=_DEFAULT_FILTER,
    ),
    TradePressFeed(
        name="SalmonBusiness",
        url="https://www.salmonbusiness.com/feed/",
        keyword_filter=_DEFAULT_FILTER,
    ),
    TradePressFeed(
        name="Fish Farming Expert",
        url="https://www.fishfarmingexpert.com/rss",
        keyword_filter=_DEFAULT_FILTER,
    ),
    TradePressFeed(
        name="Hatchery International",
        url="https://www.hatcheryinternational.com/feed/",
        keyword_filter=_DEFAULT_FILTER,
    ),
    TradePressFeed(
        name="IntraFish",
        url="https://www.intrafish.com/?service=rss",
        keyword_filter=_DEFAULT_FILTER,
    ),
]


# ---------------------------------------------------------------------------
# Compiled feed list — what ingest.py actually iterates over.
# ---------------------------------------------------------------------------

SourceType = Literal["google_news", "trade_press"]


@dataclass(frozen=True)
class FeedSpec:
    source_type: SourceType
    source_name: str
    feed_query: str          # query string (google) or feed URL (trade_press)
    matched_keyword: str
    language: str | None
    # google_news only:
    locale: GoogleNewsLocale | None = None
    # trade_press only:
    trade_feed: TradePressFeed | None = None


def _quote_or(phrases: list[str]) -> str:
    return " OR ".join(f'"{p}"' for p in phrases)


def _exclude(terms: list[str]) -> str:
    return " ".join(f"-{t}" for t in terms)


def build_google_news_queries() -> list[tuple[str, str]]:
    """Return list of (matched_keyword, query_string) pairs."""
    queries: list[tuple[str, str]] = []

    primary_q = f"({_quote_or(PRIMARY_VARIATIONS)}) {_exclude(PRIMARY_EXCLUDE)}".strip()
    queries.append((PRIMARY_KEYWORD, primary_q))

    parent_q = f"({_quote_or(PARENT_VARIATIONS)})"
    queries.append((PARENT_KEYWORD, parent_q))

    for ex in EXEC_QUERIES:
        phrase_q = _quote_or(ex["phrases"])
        if ex["context"]:
            q = f"({phrase_q}) AND \"{ex['context']}\""
        else:
            q = phrase_q
        queries.append((ex["keyword"], q))

    return queries


def all_feeds() -> list[FeedSpec]:
    feeds: list[FeedSpec] = []

    for keyword, query in build_google_news_queries():
        for locale in GOOGLE_NEWS_LOCALES:
            feeds.append(
                FeedSpec(
                    source_type="google_news",
                    source_name=f"Google News ({locale.code})",
                    feed_query=query,
                    matched_keyword=keyword,
                    language=locale.code,
                    locale=locale,
                )
            )

    for tf in TRADE_PRESS_FEEDS:
        feeds.append(
            FeedSpec(
                source_type="trade_press",
                source_name=tf.name,
                feed_query=tf.url,
                matched_keyword=PRIMARY_KEYWORD,  # actual match decided post-fetch
                language=tf.language,
                trade_feed=tf,
            )
        )

    return feeds
