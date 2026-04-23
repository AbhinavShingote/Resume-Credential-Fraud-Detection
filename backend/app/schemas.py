"""
Pydantic schemas — validate API request bodies and serialize responses.

Database models (models.py)  = what the DB stores
API schemas   (this file)    = what the API accepts / returns

Keeping them separate means you can hide internal fields (like password_hash)
from the API without affecting the DB.
"""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


# ========== Authentication ==========

class UserRegister(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["recruiter", "candidate", "admin", "verification_staff"] = "recruiter"


class UserLogin(BaseModel):
    """Body of POST /api/v1/auth/login"""
    email: EmailStr
    password: str


class UserOut(BaseModel):
    """How a user is shown in responses (note: no password_hash)"""
    id: int
    email: EmailStr
    name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True  # Allow reading from ORM objects


class TokenResponse(BaseModel):
    """Response of POST /login — JWT + user info"""
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ========== Resumes & Reports ==========

class ResumeOut(BaseModel):
    id: int
    filename: str
    file_type: str
    file_size: int
    uploaded_at: datetime
    status: str

    class Config:
        from_attributes = True


class ReportOut(BaseModel):
    """Full fraud analysis report (shown on the Report detail page)"""
    id: int
    resume_id: int
    risk_score: int
    risk_level: str
    decision: str
    flags: list[dict[str, Any]]
    extracted_data: dict[str, Any]
    cert_results: dict[str, Any]
    generated_at: datetime

    class Config:
        from_attributes = True


class DashboardRowOut(BaseModel):
    """One row in the dashboard table"""
    resume_id: int
    candidate_name: str | None
    filename: str
    uploaded_at: datetime
    risk_score: int | None
    risk_level: str | None
    decision: str | None
    flag_count: int


class DashboardStats(BaseModel):
    """Top-of-dashboard summary stat cards"""
    total: int
    high: int
    medium: int
    low: int
    avg_score: int


class DecisionIn(BaseModel):
    """Body of PATCH /reports/{id}/decision — recruiter's verdict"""
    decision: Literal["approved", "rejected", "pending"]


# ========== External ATS API (REQ-29 to REQ-31) ==========

class ATSReportResponse(BaseModel):
    """
    Simplified JSON contract for external Applicant Tracking Systems.
    Deliberately minimal — third parties don't need our full internal report.
    """
    resume_id: int
    candidate_name: str | None
    risk_score: int
    risk_level: str
    flag_count: int
    top_flags: list[str]
    generated_at: datetime