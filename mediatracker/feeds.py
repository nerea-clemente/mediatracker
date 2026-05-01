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
# Danish coverage just says "Schouw"; the strict "Schouw & Co" form was
# returning 3 hits/30d in Danish vs 59 in English. Widen to bare "Schouw"
# scoped to BioMar / Aarhus context so we don't pick up unrelated Schouw
# surnames.
PARENT_KEYWORD = "Schouw"
PARENT_VARIATIONS = ["Schouw"]
PARENT_CONTEXT_TERMS = ["BioMar", "Aarhus", "Schouw & Co"]

# Named executives. Searched as exact-quoted phrases.
EXEC_QUERIES = [
    {"keyword": "Carlos Diaz", "phrases": ["Carlos Diaz", "Carlos Díaz"], "context": "BioMar"},
    {"keyword": "Jens Bjerg Sørensen", "phrases": ["Jens Bjerg Sørensen", "Jens Bjerg Sorensen"], "context": None},
]

# ---------------------------------------------------------------------------
# Competitors — used for share-of-voice. We ingest them and count, but we
# DO NOT analyse them (the Phase 2 analyzer is scoped to BioMar keywords
# only, so cost stays flat). Each query has a ``company`` label that the
# dashboard groups by.
# ---------------------------------------------------------------------------

COMPETITOR_QUERIES = [
    {
        "keyword": "Skretting",
        "phrases": ["Skretting"],
        "context": None,        # name is unique enough on its own
        "company": "Skretting",
    },
    {
        "keyword": "Cargill Aqua",
        # Generic "Cargill" alone is huge agribusiness noise — scope to
        # the aquaculture brand names. "Ewos" is the legacy brand still
        # used in trade press.
        "phrases": ["Cargill Aqua Nutrition", "Ewos"],
        "context": None,
        "company": "Cargill",
    },
]


# ---------------------------------------------------------------------------
# Site-scoped queries — surface paywalled / locally-indexed outlets that
# Google News' generic locale doesn't return. Each runs against ONE
# specified locale only.
# ---------------------------------------------------------------------------

SITE_SCOPED_QUERIES = [
    # Børsen — Denmark's main business paper. Paywalled but indexed by
    # Google News at the headline+lede level.
    {"keyword": "BioMar (borsen.dk)",  "phrase": "BioMar",  "site": "borsen.dk",  "locale": "da", "company": "BioMar"},
    {"keyword": "Schouw (borsen.dk)",  "phrase": "Schouw",  "site": "borsen.dk",  "locale": "da", "company": "BioMar"},
    # Finans.dk — Jyllands-Posten's business arm.
    {"keyword": "BioMar (finans.dk)",  "phrase": "BioMar",  "site": "finans.dk",  "locale": "da", "company": "BioMar"},
    {"keyword": "Schouw (finans.dk)",  "phrase": "Schouw",  "site": "finans.dk",  "locale": "da", "company": "BioMar"},
    # Berlingske Business
    {"keyword": "BioMar (berlingske.dk)", "phrase": "BioMar", "site": "berlingske.dk", "locale": "da", "company": "BioMar"},
    # Norway: Sysla / E24 are good business outlets but well-indexed already.
    # Add only if specific gaps appear.
]


# Map a ``matched_keyword`` (as stored in mentions.matched_keyword) to a
# canonical company display name. Used by the export step to bucket
# mentions into share-of-voice series.
KEYWORD_TO_COMPANY: dict[str, str] = {
    PRIMARY_KEYWORD: "BioMar",
    PARENT_KEYWORD: "BioMar",  # Schouw articles roll up under BioMar
    **{ex["keyword"]: "BioMar" for ex in EXEC_QUERIES},
    **{cq["keyword"]: cq["company"] for cq in COMPETITOR_QUERIES},
    **{ss["keyword"]: ss["company"] for ss in SITE_SCOPED_QUERIES},
}

BIOMAR_KEYWORDS: set[str] = {
    k for k, c in KEYWORD_TO_COMPANY.items() if c == "BioMar"
}


def keyword_to_company(matched_keyword: str) -> str:
    return KEYWORD_TO_COMPANY.get(matched_keyword, matched_keyword)


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
# Currently empty. Most aquaculture trade-press sites (IntraFish,
# Undercurrent News, Fish Farming Expert, Hatchery International) sit
# behind Cloudflare bot protection that 403s automated fetchers — and
# their BioMar coverage already flows in via Google News, where we
# extract the per-item publisher (see ``rss.py``). So the dropdown shows
# "IntraFish", "SalmonBusiness", "Fish Farming Expert" etc. as outlet
# names without us having to hit those sites directly.
#
# Add an entry only if (a) the URL responds 200 to a non-browser UA, and
# (b) the publisher is missing from Google News results.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TradePressFeed:
    name: str
    url: str
    language: str = "en"
    keyword_filter: list[str] = field(default_factory=list)


_DEFAULT_FILTER = [
    "biomar", "schouw",
    "larviva", "inicio", "efico", "orbit", "sigma",
    "carlos diaz", "carlos díaz",
    "jens bjerg",
]

TRADE_PRESS_FEEDS: list[TradePressFeed] = []


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

    # Schouw: bare name AND any context term (BioMar / Aarhus / "Schouw & Co").
    # Avoids matching unrelated Schouw surnames while catching Danish-only
    # coverage that just writes "Schouw".
    parent_q = (
        f"({_quote_or(PARENT_VARIATIONS)}) AND ({_quote_or(PARENT_CONTEXT_TERMS)})"
    )
    queries.append((PARENT_KEYWORD, parent_q))

    for ex in EXEC_QUERIES:
        phrase_q = _quote_or(ex["phrases"])
        if ex["context"]:
            q = f"({phrase_q}) AND \"{ex['context']}\""
        else:
            q = phrase_q
        queries.append((ex["keyword"], q))

    for cq in COMPETITOR_QUERIES:
        phrase_q = _quote_or(cq["phrases"])
        if cq["context"]:
            q = f"({phrase_q}) AND \"{cq['context']}\""
        else:
            q = phrase_q
        queries.append((cq["keyword"], q))

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

    # Site-scoped queries: each runs against one locale only.
    locale_by_code = {l.code: l for l in GOOGLE_NEWS_LOCALES}
    for ss in SITE_SCOPED_QUERIES:
        locale = locale_by_code.get(ss["locale"])
        if not locale:
            continue
        q = f'"{ss["phrase"]}" site:{ss["site"]}'
        feeds.append(
            FeedSpec(
                source_type="google_news",
                source_name=f"Google News ({locale.code} · {ss['site']})",
                feed_query=q,
                matched_keyword=ss["keyword"],
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
