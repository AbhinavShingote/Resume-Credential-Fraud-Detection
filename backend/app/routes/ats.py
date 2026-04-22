"""
External ATS (Applicant Tracking System) REST API.

Covers SRS REQ-29 to REQ-31:
  REQ-29: Expose fraud scores via a stable REST endpoint
  REQ-30: Return a minimal, well-defined JSON contract
  REQ-31: Authenticate ATS callers with a token (JWT for now)

  GET /api/v1/ats/report/{resume_id}    → simplified fraud report
  GET /api/v1/ats/health                → uptime probe for the ATS

Why this is a separate endpoint (not /api/v1/reports):
  - External systems shouldn't see our internal field names
  - Simpler response = easier integration for third parties
  - Future-proof: we can evolve /reports without breaking ATS consumers
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.jwt_handler import get_current_user
from ..database import get_db
from ..models import Report, Resume, User
from ..schemas import ATSReportResponse

router = APIRouter(prefix="/api/v1/ats", tags=["ats"])


@router.get("/health")
def health():
    """
    Simple uptime probe.
    ATS systems hit this every few minutes to check we're alive.
    Returns 200 OK with a tiny JSON body.
    """
    return {"status": "ok", "service": "VisiVerify ATS API", "version": "1.0"}


@router.get("/report/{resume_id}", response_model=ATSReportResponse)
def ats_report(
    resume_id: int,
    db: Session = Depends(get_db),
    # Requires a valid JWT — in production, ATS integrations would use
    # API keys instead, but JWT keeps the demo simple and secure.
    _user: User = Depends(get_current_user),
):
    """
    REQ-29 + REQ-30: minimal fraud report for external ATS consumers.

    Deliberately strips internal fields (`flags`, `extracted_data`, `cert_results`)
    and returns only the high-level verdict + top 3 human-readable concerns.
    """
    # Load the report and its resume in one query
    joined = (
        db.query(Report, Resume)
        .join(Resume)
        .filter(Resume.id == resume_id)
        .first()
    )
    if not joined:
        raise HTTPException(404, "No report found for this resume_id")

    report, resume = joined

    # Pull candidate name from the extracted_data blob
    candidate_name = (report.extracted_data or {}).get("name")

    # Summarize the top 3 flags as short human-readable strings
    # (ATS consumers want a quick summary, not our full flag objects)
    top_flags = [
        f.get("detail", f.get("type", "unknown flag"))
        for f in (report.flags or [])
    ][:3]

    return ATSReportResponse(
        resume_id=resume.id,
        candidate_name=candidate_name,
        risk_score=report.risk_score,
        risk_level=report.risk_level,
        flag_count=len(report.flags or []),
        top_flags=top_flags,
        generated_at=report.generated_at,
    )