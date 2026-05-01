"""Google News RSS adapter.

Builds a query URL of the form:

    https://news.google.com/rss/search?q=<query>&hl=<hl>&gl=<gl>&ceid=<ceid>

Google News supports the same operators as web search inside ``q``: quoted
phrases, ``OR``, ``AND``, leading-minus exclusions.
"""

from __future__ import annotations

from typing import Iterable
from urllib.parse import quote_plus

from ..feeds import GoogleNewsLocale
from .base import RawMention
from .rss import entries_to_mentions, fetch_feed

GOOGLE_NEWS_BASE = "https://news.google.com/rss/search"


def build_url(query: str, locale: GoogleNewsLocale) -> str:
    return (
        f"{GOOGLE_NEWS_BASE}?q={quote_plus(query)}"
        f"&hl={locale.hl}&gl={locale.gl}&ceid={locale.ceid}"
    )


class FetchError(RuntimeError):
    """Raised when the upstream feed could not be retrieved."""


def fetch(
    *,
    query: str,
    locale: GoogleNewsLocale,
    matched_keyword: str,
    user_agent: str,
    timeout: float,
) -> Iterable[RawMention]:
    url = build_url(query, locale)
    parsed = fetch_feed(url, user_agent=user_agent, timeout=timeout)
    if parsed is None:
        raise FetchError(f"google_news fetch failed: {url}")
    return entries_to_mentions(
        parsed,
        source_type="google_news",
        source_name=f"Google News ({locale.code})",
        feed_query=query,
        matched_keyword=matched_keyword,
        language=locale.code,
    )
