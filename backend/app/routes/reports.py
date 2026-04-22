"""
Report endpoints — powers the recruiter dashboard.

Covers SRS REQ-25 to REQ-28:
  REQ-25: Display list of analyzed resumes with risk scores
  REQ-26: Drill into a detailed fraud report
  REQ-27: Filter by risk level
  REQ-28: Record recruiter decision (approve/reject/flag)

  GET   /api/v1/reports/stats              → dashboard summary (counts)
  GET   /api/v1/reports/                   → list all reports (with filter)
  GET   /api/v1/reports/{id}               → full report detail
  PATCH /api/v1/reports/{id}/decision      → recruiter decision
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.jwt_handler import get_current_user
from ..database import get_db
from ..models import AuditLog, Report, Resume, User
from ..schemas import DashboardRowOut, DashboardStats, DecisionIn, ReportOut

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


# ---------------- Dashboard stats ----------------

@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Summary stats for the top of the dashboard (the 4 big cards).
    Scoped to the current user's uploads only.
    """
    # Join Report with Resume so we can filter by user_id
    base = db.query(Report).join(Resume).filter(Resume.user_id == user.id)

    total = base.count()
    high = base.filter(Report.risk_level == "high").count()
    medium = base.filter(Report.risk_level == "medium").count()
    low = base.filter(Report.risk_level == "low").count()

    # Average score (SQL AVG) — handle the "no reports yet" case gracefully
    avg = db.query(func.avg(Report.risk_score)).join(Resume).filter(
        Resume.user_id == user.id
    ).scalar()
    avg_score = int(avg) if avg is not None else 0

    return DashboardStats(
        total=total, high=high, medium=medium, low=low, avg_score=avg_score
    )


# ---------------- List all reports ----------------

@router.get("/", response_model=list[DashboardRowOut])
def list_reports(
    level: str | None = Query(None, description="Filter: low | medium | high"),
    decision: str | None = Query(None, description="Filter: pending | approved | rejected"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    REQ-25 + REQ-27: list reports with optional filters for the dashboard table.
    """
    q = db.query(Report, Resume).join(Resume).filter(Resume.user_id == user.id)

    if level in ("low", "medium", "high"):
        q = q.filter(Report.risk_level == level)
    if decision in ("pending", "approved", "rejected"):
        q = q.filter(Report.decision == decision)

    q = q.order_by(Report.generated_at.desc())

    rows = []
    for report, resume in q.all():
        # Pull the candidate name out of the extracted_data JSON blob
        candidate_name = (report.extracted_data or {}).get("name")
        rows.append(DashboardRowOut(
            resume_id=resume.id,
            candidate_name=candidate_name,
            filename=resume.filename,
            uploaded_at=resume.uploaded_at,
            risk_score=report.risk_score,
            risk_level=report.risk_level,
            decision=report.decision,
            flag_count=len(report.flags or []),
        ))
    return rows


# ---------------- Single report detail ----------------

@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    REQ-26: full fraud report for a single resume — what the Report page shows.
    Enforces that the caller owns the underlying resume.
    """
    report = (
        db.query(Report)
        .join(Resume)
        .filter(Report.id == report_id, Resume.user_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found")
    return report


# ---------------- Recruiter decision ----------------

@router.patch("/{report_id}/decision", response_model=ReportOut)
def set_decision(
    report_id: int,
    payload: DecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    REQ-28: recruiter records their verdict on a candidate.
    Also writes an entry to the audit log.
    """
    report = (
        db.query(Report)
        .join(Resume)
        .filter(Report.id == report_id, Resume.user_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found")

    previous = report.decision
    report.decision = payload.decision

    # Audit trail for compliance / admin monitoring
    db.add(AuditLog(
        user_id=user.id,
        action="set_decision",
        details={
            "report_id": report.id,
            "from": previous,
            "to": payload.decision,
        },
    ))

    db.commit()
    db.refresh(report)
    return report

# ---------------- Report by resume ID (for frontend convenience) ----------------

@router.get("/by-resume/{resume_id}", response_model=ReportOut)
def get_report_by_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fetch a report by its associated resume_id instead of report_id.

    Exists because the frontend routes by resume_id (/reports/:id in the URL
    corresponds to a Resume, not a Report). Saves the frontend from having
    to do two round-trips just to find the right report.
    """
    report = (
        db.query(Report)
        .join(Resume)
        .filter(Resume.id == resume_id, Resume.user_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(404, "No report found for this resume")
    return report