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

─────────────────────────────────────────────────────────────────────
DESIGN PHILOSOPHY (per SRS):
─────────────────────────────────────────────────────────────────────
The score reflects DOCUMENT-LEVEL fraud signals (metadata tampering,
impossible dates, template reuse, certificate forgery) — NOT whether
we happen to recognize company names in our local registry.

"Unknown company" flags are deliberately de-weighted because a missing
entry in OUR reference data is not evidence of fraud — it's a gap in
OUR knowledge. Academic resumes frequently include school names,
project titles, and small companies we simply don't have listed.

Real fraud signals (metadata tampering, date impossibility, certificate
forgery via ELA) carry the full weight. This mirrors how commercial
fraud-detection services operate: their high-confidence signals come
from document forensics + trusted data partnerships, not from
arbitrary whitelists.
─────────────────────────────────────────────────────────────────────
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
    "date_future":     1.3,   # "worked until 2030" → clear lie
    "date_overlap":    1.1,   # impossible concurrent jobs
    "template_reuse":  0.9,   # shared template (could be innocent)
    "skill_inflation": 0.7,   # subjective — lighter penalty
    "low_content":     0.8,   # suspiciously thin resume
}

# Certificate-specific penalties — these ARE strong fraud evidence
CERT_FAILED_PENALTY = 25
CERT_SUSPICIOUS_PENALTY = 12

# Informational weight for unverified employers (per SRS philosophy above)
UNVERIFIED_EMPLOYER_POINTS = 3
MAX_UNVERIFIED_FLAGS_COUNTED = 2  # after 2, further unknowns are ignored


def score_risk(
    flags: list[dict[str, Any]] | None = None,
    cert_results: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Compute a weighted risk score from fraud flags + certificate results.

    Args:
        flags: list of flag dicts from fraud_detector and company_verifier.
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

    # Track how many unverified-employer flags we've counted.
    # These are informational (not fraud evidence) — see module docstring.
    unverified_counted = 0

    # ─────────────────────────────────────────────────────────────
    # Step 1: Score each flag
    # ─────────────────────────────────────────────────────────────
    for f in flags:
        severity = f.get("severity", "low")
        ftype = f.get("type", "")

        # ── Special handling for fake_company / unverified employers ──
        # These reflect gaps in OUR registry, not fraud evidence.
        # Add tiny nominal weight for the first 2, ignore the rest entirely.
        if ftype == "fake_company":
            if unverified_counted < MAX_UNVERIFIED_FLAGS_COUNTED:
                score += UNVERIFIED_EMPLOYER_POINTS
                breakdown.append({
                    "contribution": UNVERIFIED_EMPLOYER_POINTS,
                    "source": "unverified_employer [informational]",
                })
                unverified_counted += 1
            # Beyond the cap → contribute zero, skip silently
            continue

        # ── Real fraud signals: full weight ──
        base = SEVERITY_WEIGHTS.get(severity, SEVERITY_WEIGHTS["low"])
        mult = TYPE_MULTIPLIERS.get(ftype, 1.0)

        contribution = base * mult
        score += contribution
        breakdown.append({
            "contribution": round(contribution, 1),
            "source": f"{ftype} [{severity}]",
        })

    # ─────────────────────────────────────────────────────────────
    # Step 2: Certificate penalties — these ARE strong fraud evidence
    # ─────────────────────────────────────────────────────────────
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

    # ─────────────────────────────────────────────────────────────
    # Step 3: Cap score in [0, 100] and classify into a band
    # ─────────────────────────────────────────────────────────────
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