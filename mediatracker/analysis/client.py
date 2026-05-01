"""Single wrapper around the Anthropic SDK.

All Claude calls in mediatracker go through ``call_haiku()`` (per-article
analysis) or ``call_sonnet()`` (executive summaries, Phase 5).  The wrapper
handles retries via the SDK's built-in backoff, validates structured output
against a Pydantic model, and logs every call to the ``api_calls`` ledger
in SQLite.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from typing import TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from ..sources.base import now_utc_iso

log = logging.getLogger(__name__)

# Pricing as of cache date 2026-04-15 (USD per 1M tokens). See
# shared/models.md in the claude-api skill.
PRICING: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5":  (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-7":   (5.00, 25.00),
}

T = TypeVar("T", bound=BaseModel)


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    in_price, out_price = PRICING.get(model, (0.0, 0.0))
    return (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price


@dataclass
class CallResult:
    parsed: BaseModel | None
    raw_text: str | None
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    ok: bool
    error: str | None


def _log_api_call(
    conn: sqlite3.Connection,
    *,
    model: str,
    purpose: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_creation_tokens: int,
    cost_usd: float,
    mention_id: int | None,
    ok: bool,
    error: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO api_calls (
            created_at, model, purpose, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, cost_usd,
            mention_id, ok, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now_utc_iso(),
            model,
            purpose,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_creation_tokens,
            cost_usd,
            mention_id,
            1 if ok else 0,
            error,
        ),
    )


def call_structured(
    client: anthropic.Anthropic,
    *,
    model: str,
    system: str,
    user_prompt: str,
    output_format: type[T],
    max_tokens: int,
    purpose: str,
    conn: sqlite3.Connection,
    mention_id: int | None = None,
) -> CallResult:
    """One Anthropic call returning a Pydantic-validated object.

    The SDK retries 429s and 5xx automatically (default max_retries=2).
    Validation failures land in ``error`` and ``ok=False`` so the caller
    can decide whether to skip or retry.
    """
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            output_format=output_format,
        )
    except anthropic.APIError as exc:
        log.warning("anthropic api error model=%s purpose=%s err=%s", model, purpose, exc)
        _log_api_call(
            conn,
            model=model,
            purpose=purpose,
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=0,
            cache_creation_tokens=0,
            cost_usd=0.0,
            mention_id=mention_id,
            ok=False,
            error=f"{type(exc).__name__}: {exc}",
        )
        return CallResult(None, None, model, 0, 0, 0.0, False, str(exc))
    except ValidationError as exc:
        log.warning("validation error model=%s purpose=%s err=%s", model, purpose, exc)
        _log_api_call(
            conn,
            model=model,
            purpose=purpose,
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=0,
            cache_creation_tokens=0,
            cost_usd=0.0,
            mention_id=mention_id,
            ok=False,
            error=f"validation: {exc}",
        )
        return CallResult(None, None, model, 0, 0, 0.0, False, f"validation: {exc}")

    usage = response.usage
    in_tok = getattr(usage, "input_tokens", 0) or 0
    out_tok = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cost = estimate_cost_usd(model, in_tok, out_tok)

    parsed = response.parsed_output
    raw_text = next(
        (b.text for b in response.content if getattr(b, "type", None) == "text"),
        None,
    )

    _log_api_call(
        conn,
        model=model,
        purpose=purpose,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cache_read_tokens=cache_read,
        cache_creation_tokens=cache_creation,
        cost_usd=cost,
        mention_id=mention_id,
        ok=parsed is not None,
        error=None if parsed is not None else "no parsed_output",
    )

    return CallResult(
        parsed=parsed,
        raw_text=raw_text,
        model=model,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cost_usd=cost,
        ok=parsed is not None,
        error=None if parsed is not None else "no parsed_output",
    )


def make_client(api_key: str | None) -> anthropic.Anthropic:
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. Add it to .env locally or as a "
            "GitHub repository secret for the scheduled workflow."
        )
    return anthropic.Anthropic(api_key=api_key, max_retries=3)
