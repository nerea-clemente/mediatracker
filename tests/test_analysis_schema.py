"""Tests for Phase 2 JSON parsing.

The analyzer relies on ``client.messages.parse(output_format=ArticleAnalysis)``,
which validates Claude's response against the Pydantic model. These tests
exercise the schema directly with the kinds of malformed input the model
sometimes produces, so we know exactly which calls will be retried vs.
quarantined when validation fails.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from mediatracker.analysis.schema import ArticleAnalysis


def _good() -> dict:
    return {
        "sentiment": "positive",
        "sentiment_confidence": 0.92,
        "prominence": "primary",
        "angle": "expansion announcement",
        "key_claims": ["BioMar opens Costa Rica plant"],
        "people_quoted": [
            {
                "name": "Carlos Diaz",
                "affiliation": "BioMar Group, CEO",
                "quote_summary": "Strategic foothold for Central America",
            }
        ],
        "risk_flags": ["none"],
        "summary": "BioMar inaugurated a new plant in Costa Rica. CEO Carlos Diaz attended the opening.",
    }


def test_happy_path_parses() -> None:
    a = ArticleAnalysis.model_validate(_good())
    assert a.sentiment == "positive"
    assert a.people_quoted[0].name == "Carlos Diaz"
    assert a.risk_flags == ["none"]


def test_invalid_sentiment_value_rejected() -> None:
    bad = _good() | {"sentiment": "very positive"}
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_invalid_prominence_value_rejected() -> None:
    bad = _good() | {"prominence": "main"}
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_confidence_out_of_range_rejected() -> None:
    bad = _good() | {"sentiment_confidence": 1.5}
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)
    bad = _good() | {"sentiment_confidence": -0.1}
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_invalid_risk_flag_rejected() -> None:
    bad = _good() | {"risk_flags": ["legal", "bogus"]}
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_missing_required_field_rejected() -> None:
    bad = _good()
    del bad["summary"]
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_empty_lists_default_when_absent() -> None:
    minimal = {
        "sentiment": "neutral",
        "sentiment_confidence": 0.5,
        "prominence": "passing",
        "angle": "industry roundup",
        "summary": "Generic industry roundup.",
    }
    a = ArticleAnalysis.model_validate(minimal)
    assert a.key_claims == []
    assert a.people_quoted == []
    assert a.risk_flags == ["none"]


def test_partial_person_quoted_rejected() -> None:
    """All three person fields are required; affiliation often comes back
    as null when the model didn't have it. Confirm that fails fast."""
    bad = _good() | {
        "people_quoted": [{"name": "Carlos Diaz", "quote_summary": "..."}]
    }
    with pytest.raises(ValidationError):
        ArticleAnalysis.model_validate(bad)


def test_round_trip_via_json() -> None:
    """Serialise and reparse — what storage of the analysis row will do."""
    a = ArticleAnalysis.model_validate(_good())
    raw = a.model_dump_json()
    b = ArticleAnalysis.model_validate(json.loads(raw))
    assert a == b
