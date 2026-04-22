"""
Fraud detection engine — rule-based heuristics over parsed resume data.

Covers SRS REQ-10 to REQ-14:
  REQ-10: Detect suspicious patterns in general (empty/thin resumes)
  REQ-11: Detect overlapping employment ranges
  REQ-12: Detect future-dated experience
  REQ-13: Detect PDF metadata tampering
  REQ-14: Detect template reuse (fingerprint matching)

Each detector returns a list of flag dicts:
    { "type": "date_overlap", "severity": "high", "detail": "..." }
These flags are then aggregated by the risk scorer into a 0-100 score.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any


# Map month abbreviations to numbers, for parsing date ranges
MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_date(raw: str) -> datetime | None:
    """
    Best-effort parser for resume date strings.
    Handles: "Jun 2022", "2022", "Present", "Current"
    """
    if raw is None:
        return None
    s = raw.strip().lower()
    if s in ("present", "current"):
        return datetime.utcnow()

    m = re.match(r"([a-z]+)?\s*(\d{4})", s)
    if not m:
        return None

    month_name, year = m.group(1), int(m.group(2))
    month = MONTH_MAP.get(month_name[:3], 1) if month_name else 1
    try:
        return datetime(year, month, 1)
    except ValueError:
        return None


# ---------------- Individual fraud checks ----------------

def _check_empty_resume(parsed: dict) -> list[dict[str, Any]]:
    """REQ-10: A resume with almost no text and no email is clearly suspicious."""
    flags = []
    if parsed.get("raw_text_length", 0) < 100 and not parsed.get("email"):
        flags.append({
            "type": "low_content",
            "severity": "medium",
            "detail": "Resume contains very little extractable text",
        })
    return flags


def _check_date_overlap(experience: list[dict]) -> list[dict[str, Any]]:
    """
    REQ-11: Flag when two employment periods overlap by more than 2 months.
    (A 1-2 month overlap during job transitions is normal and ignored.)
    """
    # Parse all date ranges to datetime tuples
    parsed = []
    for e in experience:
        start = _parse_date(e.get("start", ""))
        end = _parse_date(e.get("end", ""))
        if start and end and start <= end:
            parsed.append((start, end, e))

    flags = []
    # Compare every pair of experiences
    for i in range(len(parsed)):
        for j in range(i + 1, len(parsed)):
            s1, e1, _ = parsed[i]
            s2, e2, _ = parsed[j]
            # Overlap = days between latest start and earliest end
            overlap_days = (min(e1, e2) - max(s1, s2)).days
            if overlap_days > 60:  # more than 2 months = suspicious
                flags.append({
                    "type": "date_overlap",
                    "severity": "high" if overlap_days > 180 else "medium",
                    "detail": (
                        f"Employment ranges overlap by {overlap_days} days "
                        f"({s1.strftime('%b %Y')}–{e1.strftime('%b %Y')} and "
                        f"{s2.strftime('%b %Y')}–{e2.strftime('%b %Y')})"
                    ),
                })
                break  # one overlap per pair is enough
    return flags


def _check_future_dates(experience: list[dict]) -> list[dict[str, Any]]:
    """REQ-12: End dates more than a year in the future are impossible."""
    flags = []
    now = datetime.utcnow()
    for e in experience:
        end = _parse_date(e.get("end", ""))
        if end and (
            end.year > now.year + 1
            or (end.year == now.year + 1 and end.month > now.month)
        ):
            flags.append({
                "type": "date_future",
                "severity": "high",
                "detail": f"Experience end date is in the future: {e.get('end')}",
            })
    return flags


def _check_metadata_tampering(
    metadata: dict[str, Any],
    name: str | None,
) -> list[dict[str, Any]]:
    """REQ-13: Spot signs that the PDF was edited or not authored by the candidate."""
    flags = []

    # Heuristic 1: a freshly authored resume rarely has >3 modification records
    modified = metadata.get("modified", 0)
    if modified > 3:
        flags.append({
            "type": "metadata_tamper",
            "severity": "high",
            "detail": (
                f"PDF has {modified} modification records — "
                f"unusual for a freshly authored resume"
            ),
        })

    # Heuristic 2: PDF author field doesn't match candidate name
    author = (metadata.get("author") or "").strip().lower()
    if name and author and author not in name.lower() and name.lower().split()[0] not in author:
        flags.append({
            "type": "metadata_tamper",
            "severity": "medium",
            "detail": (
                f"PDF author field '{metadata.get('author')}' does not match "
                f"candidate name '{name}'"
            ),
        })

    # Heuristic 3: PDF produced by an image-editing tool = highly suspicious
    producer = (metadata.get("producer") or "").lower()
    if producer and any(tool in producer for tool in ("canva", "photoshop", "gimp")):
        flags.append({
            "type": "metadata_tamper",
            "severity": "medium",
            "detail": f"PDF producer is an image-editing tool: '{metadata.get('producer')}'",
        })

    return flags


def _check_template_reuse(
    text_sample: str,
    known_fingerprints: set[str] | None = None,
) -> list[dict[str, Any]]:
    """
    REQ-14: Compute a fingerprint of the resume structure and check
    if we've seen it before (e.g. a "fake resume template" being
    shared around on Telegram).

    In production this would query a DB of fingerprints from past submissions.
    """
    if not text_sample:
        return []

    # Normalize whitespace, take first 500 chars, then hash
    normalized = re.sub(r"\s+", " ", text_sample.lower())[:500]
    fingerprint = hashlib.md5(normalized.encode()).hexdigest()

    known = known_fingerprints or set()
    if fingerprint in known:
        return [{
            "type": "template_reuse",
            "severity": "medium",
            "detail": f"Resume structure matches known template (fingerprint {fingerprint[:8]})",
            "fingerprint": fingerprint,
        }]
    return []


# ---------------- Main entry point ----------------

def detect_fraud(
    parsed: dict[str, Any],
    known_fingerprints: set[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Run all fraud detection checks on parsed resume data.

    Args:
        parsed: output of parser.parse_resume()
        known_fingerprints: optional set of known bad template hashes

    Returns:
        List of flag dicts, each like:
            {"type": str, "severity": "low|medium|high", "detail": str}
    """
    flags: list[dict[str, Any]] = []

    experience = parsed.get("experience", [])
    metadata = parsed.get("metadata", {})
    name = parsed.get("name")

    flags += _check_empty_resume(parsed)
    flags += _check_date_overlap(experience)
    flags += _check_future_dates(experience)
    flags += _check_metadata_tampering(metadata, name)
    flags += _check_template_reuse(parsed.get("_raw_text", ""), known_fingerprints)

    return flags