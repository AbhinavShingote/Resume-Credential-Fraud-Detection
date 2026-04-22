"""
Company verification — layered lookup:
  1. Check local known_companies table (fast, offline)
  2. If not found, query OpenCorporates public API (200M+ companies worldwide)
  3. Cache positive hits back to the local DB for next time

Covers SRS REQ-19 to REQ-21 with real-world data.

OpenCorporates free tier:
  - 500 requests per month per IP
  - No API key needed for basic search
  - See: https://api.opencorporates.com/documentation/API-Reference
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..models import KnownCompany

log = logging.getLogger(__name__)

OPENCORPORATES_URL = "https://api.opencorporates.com/v0.4/companies/search"
HTTP_TIMEOUT = 5.0  # seconds — don't block the upload pipeline


def _normalize(name: str) -> str:
    """Strip common corporate suffixes for fuzzy matching."""
    if not name:
        return ""
    n = name.lower().strip()
    suffixes = (
        " pvt ltd", " pvt. ltd.", " private limited", " ltd", " limited",
        " inc", " inc.", " llc", " llp", " corp", " corporation",
        " technologies", " systems", " solutions", " services",
    )
    for suffix in suffixes:
        if n.endswith(suffix):
            n = n[: -len(suffix)].strip()
            break
    return n


def _check_opencorporates(name: str) -> dict[str, Any] | None:
    """
    Query OpenCorporates public API for a company name.
    Returns the first plausible match, or None if nothing good.
    Silent on network errors — we don't want verification to break uploads.
    """
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            r = client.get(
                OPENCORPORATES_URL,
                params={"q": name, "per_page": 5, "order": "score"},
                headers={"User-Agent": "VisiVerify/1.0 (academic project)"},
            )
            if r.status_code != 200:
                return None

            data = r.json()
            results = data.get("results", {}).get("companies", [])
            if not results:
                return None

            top = results[0].get("company", {})
            top_name = top.get("name", "")
            status = (top.get("current_status") or "").lower()

            # Skip dissolved / struck-off entries
            if any(bad in status for bad in ("dissolved", "struck off", "inactive")):
                return None

            return {
                "name": top_name,
                "jurisdiction": top.get("jurisdiction_code", ""),
                "opencorp_url": top.get("opencorporates_url", ""),
            }

    except Exception as e:
        log.warning(f"OpenCorporates lookup failed for '{name}': {e}")
        return None


def verify_company(name: str, db: Session) -> dict[str, Any]:
    """
    Three-layer company verification:
      Layer 1: exact match in local DB     → confidence 1.0
      Layer 2: fuzzy normalized match      → confidence 0.75–0.9
      Layer 3: OpenCorporates live lookup  → confidence 0.7 (cached locally)
      Else: verified=False, confidence 0.0
    """
    if not name or len(name.strip()) < 3:
        return {"verified": False, "confidence": 0.0, "matched_name": None}

    target = _normalize(name)

    # ---- Layer 1: exact local match ----
    exact = db.query(KnownCompany).filter(KnownCompany.name.ilike(name)).first()
    if exact:
        return {"verified": True, "confidence": 1.0, "matched_name": exact.name,
                "source": "local"}

    # ---- Layer 2: fuzzy local match ----
    for c in db.query(KnownCompany).all():
        normalized_candidate = _normalize(c.name)
        if normalized_candidate == target:
            return {"verified": True, "confidence": 0.9, "matched_name": c.name,
                    "source": "local"}
        if target and (target in normalized_candidate or normalized_candidate in target):
            if min(len(target), len(normalized_candidate)) >= 4:
                return {"verified": True, "confidence": 0.75, "matched_name": c.name,
                        "source": "local"}

    # ---- Layer 3: OpenCorporates live lookup ----
    remote = _check_opencorporates(name)
    if remote:
        # Cache it in the local DB so next time it's an instant local hit
        try:
            new_entry = KnownCompany(name=remote["name"], domain=None)
            db.add(new_entry)
            db.commit()
        except Exception:
            db.rollback()

        return {
            "verified": True,
            "confidence": 0.7,
            "matched_name": remote["name"],
            "source": "opencorporates",
            "jurisdiction": remote.get("jurisdiction", ""),
        }

    # ---- No match anywhere ----
    return {"verified": False, "confidence": 0.0, "matched_name": None}


def verify_all_companies(
    companies: list[str],
    db: Session,
) -> list[dict[str, Any]]:
    """Verify every company; flag unverified ones as medium-severity fraud signals."""
    flags = []
    for company in companies:
        result = verify_company(company, db)
        if not result["verified"]:
            flags.append({
                "type": "fake_company",
                "severity": "medium",
                "detail": f"Company '{company}' not found in any registry",
            })
    return flags