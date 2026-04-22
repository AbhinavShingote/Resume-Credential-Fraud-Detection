"""
Resume upload + analysis endpoints.

Covers SRS REQ-1 to REQ-5 (upload) and orchestrates the full pipeline:
  parser → fraud_detector → company_verifier → certificate_verifier → risk_scorer

  POST /api/v1/resumes/upload   → upload + analyze in one shot
  GET  /api/v1/resumes/         → list resumes of the current user
  GET  /api/v1/resumes/{id}     → get one resume
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..auth.jwt_handler import get_current_user
from ..config import settings
from ..database import get_db
from ..ml.company_verifier import verify_all_companies
from ..ml.fraud_detector import detect_fraud
from ..ml.parser import parse_resume
from ..ml.risk_scorer import score_risk
from ..models import AuditLog, Report, Resume, User
from ..schemas import ReportOut, ResumeOut

router = APIRouter(prefix="/api/v1/resumes", tags=["resumes"])


# ---------------- Helpers ----------------

def _validate_upload(file: UploadFile) -> tuple[str, bytes]:
    """
    REQ-2 & REQ-4: validate file extension and size before saving.
    Returns (extension_with_dot, file_bytes) or raises HTTPException.
    """
    # 1. Extension check (REQ-2: only PDF / DOCX)
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in settings.ALLOWED_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"Only {settings.ALLOWED_EXTS} files are allowed",
        )

    # 2. Read all bytes (FastAPI's UploadFile uses an async spooled tempfile)
    file.file.seek(0)
    data = file.file.read()

    # 3. Empty file check
    if len(data) == 0:
        raise HTTPException(400, "Uploaded file is empty")

    # 4. Size check (REQ-4: max 5 MB)
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.MAX_UPLOAD_MB} MB limit",
        )

    return ext, data


def _save_to_disk(data: bytes, ext: str) -> tuple[str, str]:
    """Persist bytes to disk with a UUID filename. Returns (stored_name, full_path)."""
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(settings.UPLOAD_DIR, stored_name)
    with open(full_path, "wb") as f:
        f.write(data)
    return stored_name, full_path


# ---------------- Endpoints ----------------

@router.post("/upload", response_model=ReportOut, status_code=201)
def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    REQ-1 to REQ-5: upload a resume, then run the full analysis pipeline.

    Pipeline:
      1. Validate + save file
      2. Parse (parser.py)
      3. Detect fraud patterns (fraud_detector.py)
      4. Verify each claimed company (company_verifier.py)
      5. Compute risk score (risk_scorer.py)
      6. Persist resume + report, return the report
    """
    # -------- Step 1: validate and save the file --------
    ext, data = _validate_upload(file)
    stored_name, full_path = _save_to_disk(data, ext)

    # Create the Resume row (status="parsing" initially)
    resume = Resume(
        user_id=user.id,
        filename=file.filename,
        file_path=full_path,
        file_type=ext.lstrip("."),
        file_size=len(data),
        status="parsing",
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    try:
        # -------- Step 2: parse --------
        parsed = parse_resume(full_path)

        # -------- Step 3: fraud detection --------
        flags = detect_fraud(parsed)

        # -------- Step 4: company verification --------
        flags += verify_all_companies(parsed.get("companies", []), db)

        # -------- Step 5: risk scoring --------
        # (Certificates are analyzed via a separate endpoint in a later step;
        #  for now we pass an empty cert_results dict.)
        risk = score_risk(flags=flags, cert_results={})

        # -------- Step 6: persist the report --------
        report = Report(
            resume_id=resume.id,
            risk_score=risk["score"],
            risk_level=risk["level"],
            decision="pending",
            flags=flags,
            extracted_data=parsed,
            cert_results={},
        )
        db.add(report)

        resume.status = "analyzed"

        # Audit trail — who analyzed what, when
        db.add(AuditLog(
            user_id=user.id,
            action="analyze_resume",
            details={
                "resume_id": resume.id,
                "risk_score": risk["score"],
                "risk_level": risk["level"],
                "flag_count": len(flags),
            },
        ))

        db.commit()
        db.refresh(report)
        return report

    except Exception as e:
        # Something in the pipeline failed — mark the resume and re-raise
        resume.status = "failed"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {e}",
        )


@router.get("/", response_model=list[ResumeOut])
def list_my_resumes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all resumes uploaded by the current user, newest first."""
    return (
        db.query(Resume)
        .filter(Resume.user_id == user.id)
        .order_by(Resume.uploaded_at.desc())
        .all()
    )


@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get one resume by ID — only if the caller uploaded it."""
    resume = (
        db.query(Resume)
        .filter(Resume.id == resume_id, Resume.user_id == user.id)
        .first()
    )
    if not resume:
        raise HTTPException(404, "Resume not found")
    return resume