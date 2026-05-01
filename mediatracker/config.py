from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(REPO_ROOT / ".env")


@dataclass(frozen=True)
class Config:
    db_path: Path
    user_agent: str
    http_timeout: float
    anthropic_api_key: str | None


def load_config() -> Config:
    db_rel = os.getenv("MEDIATRACKER_DB", "data/mediatracker.db")
    db_path = (REPO_ROOT / db_rel) if not os.path.isabs(db_rel) else Path(db_rel)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    return Config(
        db_path=db_path,
        user_agent=os.getenv(
            "MEDIATRACKER_USER_AGENT",
            "mediatracker/0.1 (+https://example.invalid)",
        ),
        http_timeout=float(os.getenv("MEDIATRACKER_HTTP_TIMEOUT", "20")),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )
