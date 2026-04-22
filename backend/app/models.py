"""
ORM models — mirrors the Class Diagram in UML__1_.pdf.

Tables:
  users             → recruiter / admin / verification_staff accounts
  resumes           → uploaded resume files + metadata
  reports           → fraud analysis result for each resume
  audit_logs        → admin-visible system events
  known_companies   → registry used by company verifier
"""
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="recruiter")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # A user can have many resumes they've uploaded
    resumes: Mapped[list["Resume"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(512))
    file_path: Mapped[str] = mapped_column(String(1024))
    file_type: Mapped[str] = mapped_column(String(16))       # "pdf" or "docx"
    file_size: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(32), default="uploaded")

    user: Mapped[User] = relationship(back_populates="resumes")
    # Each resume has exactly one fraud analysis report
    report: Mapped["Report | None"] = relationship(
        back_populates="resume", uselist=False, cascade="all, delete-orphan"
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    resume_id: Mapped[int] = mapped_column(
        ForeignKey("resumes.id", ondelete="CASCADE"), unique=True
    )
    risk_score: Mapped[int] = mapped_column(Integer)          # 0-100
    risk_level: Mapped[str] = mapped_column(String(16))       # low / medium / high
    decision: Mapped[str] = mapped_column(String(16), default="pending")
                                                              # pending / approved / rejected
    flags = Column(JSON, nullable=False, default=list)        # list of detected issues
    extracted_data = Column(JSON, nullable=False, default=dict)  # parsed resume data
    cert_results = Column(JSON, nullable=False, default=dict)    # per-certificate results
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    resume: Mapped[Resume] = relationship(back_populates="report")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64))           # e.g. "resume.upload"
    details = Column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class KnownCompany(Base):
    __tablename__ = "known_companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)