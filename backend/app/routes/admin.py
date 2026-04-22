"""
Admin-only endpoints — user management, audit log, system stats.

Every route here requires role="admin". A recruiter trying to call any of
these will get 403 Forbidden.

  GET    /api/v1/admin/users            → list all users
  PATCH  /api/v1/admin/users/{id}/role  → change a user's role
  DELETE /api/v1/admin/users/{id}       → delete a user
  GET    /api/v1/admin/audit            → recent audit log entries
  GET    /api/v1/admin/stats            → system-wide stats
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.jwt_handler import require_role
from ..database import get_db
from ..models import AuditLog, Report, Resume, User
from ..schemas import UserOut

# Every route below is protected by require_role("admin") at the router level.
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin"))],
)


# ---------------- User management ----------------

@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    """List all users in the system, newest first."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
def change_user_role(
    user_id: int,
    role: str,
    db: Session = Depends(get_db),
):
    """
    Change a user's role.
    Valid roles: recruiter | admin | verification_staff.
    """
    if role not in ("recruiter", "admin", "verification_staff"):
        raise HTTPException(400, f"Invalid role: {role}")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.role = role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """
    Delete a user (cascades to their resumes and reports via FK constraints).
    Returns 204 No Content on success.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return None


# ---------------- Monitoring ----------------

@router.get("/audit")
def recent_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    """
    Return the `limit` most recent audit entries.
    Used by the admin monitoring page to show "who did what, when".
    """
    limit = max(1, min(limit, 500))  # clamp between 1 and 500

    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log in logs
    ]


@router.get("/stats")
def system_stats(db: Session = Depends(get_db)):
    """
    System-wide stats (across all users, not just the caller).
    Used by the admin dashboard.
    """
    total_users = db.query(User).count()
    total_resumes = db.query(Resume).count()
    total_reports = db.query(Report).count()

    # Count by risk level
    high = db.query(Report).filter(Report.risk_level == "high").count()
    medium = db.query(Report).filter(Report.risk_level == "medium").count()
    low = db.query(Report).filter(Report.risk_level == "low").count()

    # Average score across everything
    avg = db.query(func.avg(Report.risk_score)).scalar()

    return {
        "total_users": total_users,
        "total_resumes": total_resumes,
        "total_reports": total_reports,
        "risk_distribution": {"high": high, "medium": medium, "low": low},
        "avg_risk_score": int(avg) if avg is not None else 0,
    }