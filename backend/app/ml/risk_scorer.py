"""
Risk scoring engine — aggregates fraud flags into a final 0-100 score.

Covers SRS REQ-22 to REQ-24:
  REQ-22: Aggregate all flags into a weighted numerical score
  REQ-23: Classify score into Low / Medium / High bands
  REQ-24: Return an explainable breakdown (which flags contributed how much)

Band thresholds come from config.py (RISK_LOW_MAX=39, RISK_MED_MAX=69):
  0-39   → Low risk    (likely genuine)
  40-69  → Medium risk (manual review recommended)
  70-100 → High risk   (very likely fraudulent)
"""
from __future__ import annotations

from typing import Any

from ..config import settings


# Base weights — how many points each severity level contributes
SEVERITY_WEIGHTS = {
    "low": 8,
    "medium": 18,
    "high": 28,
}

# Per-type multipliers — some fraud types are more damning than others.
# E.g. a tampered certificate is worse than a reused template.
TYPE_MULTIPLIERS = {
    "cert_tamper":     1.3,   # photoshopped certificate → very serious
    "metadata_tamper": 1.2,   # edited PDF metadata
    "date_future":     1.3,   # "worked until 2027" → clear lie
    "date_overlap":    1.1,   # impossible concurrent jobs
    "fake_company":    1.0,   # unknown employer (baseline)
    "template_reuse":  0.9,   # shared template (could be innocent)
    "skill_inflation": 0.7,   # subjective — lighter penalty
    "low_content":     0.8,   # empty resume
}

# Certificate-specific penalties applied on top of flag-based scoring
CERT_FAILED_PENALTY = 25
CERT_SUSPICIOUS_PENALTY = 12


def score_risk(
    flags: list[dict[str, Any]] | None = None,
    cert_results: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Compute a weighted risk score from flags + certificate results.

    Args:
        flags: list of flag dicts from fraud_detector and company_verifier
               Each has: {"type": str, "severity": "low|medium|high", ...}
        cert_results: dict mapping cert name → verification result
               e.g. {"AWS Cert": {"status": "failed", "confidence": 0.1}}

    Returns:
        {
          "score": 87,              # 0-100, capped
          "level": "high",          # "low" | "medium" | "high"
          "breakdown": [            # for explainability in the UI
            {"contribution": 36.4, "source": "cert_tamper [high]"},
            {"contribution": 21.6, "source": "metadata_tamper [high]"},
            {"contribution": 25,   "source": "cert_failed:AWS Cert"},
            ...
          ]
        }
    """
    flags = flags or []
    cert_results = cert_results or {}

    score = 0.0
    breakdown: list[dict[str, Any]] = []

    # -------- Step 1: score each flag --------
    # Count fake_company flags separately — they should NOT compound linearly.
    # A resume with 5 unknown companies isn't 5× as fraudulent as one with 1;
    # it usually just means we don't have those companies in our registry yet.
    fake_company_count = sum(1 for f in flags if f.get("type") == "fake_company")

    for f in flags:
        severity = f.get("severity", "low")
        ftype = f.get("type", "")

        # Special handling for fake_company: cap at first 2 flags, discount the rest
        if ftype == "fake_company":
            fake_seen_so_far = sum(
                1 for b in breakdown if b["source"].startswith("fake_company")
            )
            if fake_seen_so_far >= 2:
                # After 2 unknown companies, only add a tiny trickle (2 points each, max 6 total)
                if fake_seen_so_far < 5:
                    score += 2
                    breakdown.append({
                        "contribution": 2,
                        "source": f"{ftype} [minor — registry gap]",
                    })
                continue

        base = SEVERITY_WEIGHTS.get(severity, SEVERITY_WEIGHTS["low"])
        mult = TYPE_MULTIPLIERS.get(ftype, 1.0)

        contribution = base * mult
        score += contribution

        breakdown.append({
            "contribution": round(contribution, 1),
            "source": f"{ftype} [{severity}]",
        })

    # -------- Step 2: certificate penalties --------
    for name, r in cert_results.items():
        status = r.get("status", "")
        if status == "failed":
            score += CERT_FAILED_PENALTY
            breakdown.append({
                "contribution": CERT_FAILED_PENALTY,
                "source": f"cert_failed:{name}",
            })
        elif status == "suspicious":
            score += CERT_SUSPICIOUS_PENALTY
            breakdown.append({
                "contribution": CERT_SUSPICIOUS_PENALTY,
                "source": f"cert_suspicious:{name}",
            })

    # -------- Step 3: cap and classify --------
    final_score = int(min(100, max(0, round(score))))

    if final_score <= settings.RISK_LOW_MAX:
        level = "low"
    elif final_score <= settings.RISK_MED_MAX:
        level = "medium"
    else:
        level = "high"

    return {
        "score": final_score,
        "level": level,
        "breakdown": breakdown,
    }