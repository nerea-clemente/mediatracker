"""Pydantic models for the per-article analysis JSON returned by Claude.

Used with ``client.messages.parse(output_format=ArticleAnalysis, ...)`` so
the SDK validates Claude's response against this schema before we touch it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Sentiment = Literal["positive", "neutral", "negative"]
Prominence = Literal["primary", "secondary", "passing"]
RiskFlag = Literal[
    "legal",
    "financial",
    "controversy",
    "exec_statement",
    "product_issue",
    "none",
]


class PersonQuoted(BaseModel):
    name: str
    affiliation: str
    quote_summary: str = Field(
        description="One-sentence paraphrase of what they said. Not a verbatim quote."
    )


class ArticleAnalysis(BaseModel):
    """Schema Claude must fill in for every article we hand it."""

    sentiment: Sentiment
    sentiment_confidence: float = Field(ge=0.0, le=1.0)
    prominence: Prominence = Field(
        description=(
            "primary = the brand is the focus of the article; "
            "secondary = the brand has a meaningful role but isn't the focus; "
            "passing = the brand is mentioned in passing or in a list."
        )
    )
    angle: str = Field(
        description="Short phrase (≤ 12 words) describing the narrative framing."
    )
    key_claims: list[str] = Field(
        default_factory=list,
        description="Factual claims made about the brand in the article. ≤ 5 entries.",
    )
    people_quoted: list[PersonQuoted] = Field(default_factory=list)
    risk_flags: list[RiskFlag] = Field(
        default_factory=lambda: ["none"],
        description=(
            "Subset of: legal, financial, controversy, exec_statement, "
            "product_issue, none. Use ['none'] when nothing applies."
        ),
    )
    summary: str = Field(
        description="Two neutral sentences summarising the article."
    )
