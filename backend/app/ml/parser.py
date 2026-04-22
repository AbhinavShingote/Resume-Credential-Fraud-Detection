"""
Resume parser — extracts structured data from PDF/DOCX resumes.

Covers SRS REQ-6 to REQ-9:
  REQ-6: Extract plain text from PDF and DOCX
  REQ-7: Identify candidate contact info (email, phone)
  REQ-8: Parse work-experience date ranges
  REQ-9: Extract education, skills, and company list
"""
from __future__ import annotations

import os
import re
from typing import Any

import pdfplumber
from docx import Document

# ---------------- Regex patterns for contact info ----------------

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s-]?)?\(?\d{3,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,6}")

# Date range like "Jun 2022 – Present" or "2021 - 2023"
MONTHS = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)"
DATE_RANGE_RE = re.compile(
    rf"({MONTHS}\s+\d{{4}}|\d{{4}})\s*[–\-to]+\s*({MONTHS}\s+\d{{4}}|\d{{4}}|Present|present|Current|current)",
    re.IGNORECASE,
)

# ---------------- Skill keyword library ----------------

SKILL_KEYWORDS = {
    "python", "java", "javascript", "typescript", "react", "node", "nodejs",
    "angular", "vue", "sql", "postgresql", "mysql", "mongodb", "redis",
    "docker", "kubernetes", "aws", "azure", "gcp", "git", "linux",
    "machine learning", "ml", "deep learning", "pytorch", "tensorflow",
    "nlp", "opencv", "spring boot", "fastapi", "django", "flask",
    "go", "rust", "c++", "tableau", "power bi", "excel", "figma",
}

# Lazy-load spaCy so tests can run even without the model installed
_nlp = None


def _get_nlp():
    """Load spaCy's English NER model on first use (caches for later calls)."""
    global _nlp
    if _nlp is None:
        import spacy
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            _nlp = None  # Graceful degradation — company extraction will be skipped
    return _nlp


# ---------------- Text extraction from files ----------------

def _extract_text(path: str) -> str:
    """REQ-6: Pull plain text out of a PDF or DOCX file."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        try:
            with pdfplumber.open(path) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            return ""
    elif ext == ".docx":
        try:
            doc = Document(path)
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception:
            return ""
    return ""


def extract_pdf_metadata(path: str) -> dict[str, Any]:
    """
    Extract PDF metadata for tampering heuristics.
    The fraud detector uses `producer`, `author`, and `modified` count
    to spot resumes that were edited many times or produced by image tools.
    """
    meta: dict[str, Any] = {"producer": None, "author": None, "modified": 0}
    if not path.lower().endswith(".pdf"):
        return meta
    try:
        with pdfplumber.open(path) as pdf:
            m = pdf.metadata or {}
            meta["producer"] = m.get("Producer")
            meta["author"] = m.get("Author")
            # Count how many modification / creation timestamps exist
            mod_dates = [
                v for k, v in m.items()
                if k.lower().startswith(("mod", "create"))
            ]
            meta["modified"] = len(set(str(d) for d in mod_dates if d))
    except Exception:
        pass
    return meta


# ---------------- Individual field extractors ----------------

def _extract_dates(text: str) -> list[dict[str, str]]:
    """REQ-8: Find (start, end) date ranges in experience-like sections."""
    ranges = []
    for m in DATE_RANGE_RE.finditer(text):
        ranges.append({"start": m.group(1), "end": m.group(3)})
    return ranges


def _extract_skills(text: str) -> list[str]:
    """REQ-9: Match text against our skill keyword library."""
    lowered = text.lower()
    return sorted({kw for kw in SKILL_KEYWORDS if kw in lowered})


# Words spaCy frequently misclassifies as ORG in resumes — filter them out
_NON_COMPANY_TOKENS = {
    # Degree types
    "b.tech", "btech", "b.e.", "be", "b.sc", "bsc", "m.tech", "mtech",
    "msc", "m.sc", "mba", "phd", "ph.d", "diploma",
    # Resume section headers
    "projects", "education", "experience", "skills", "certifications",
    "achievements", "awards", "internships", "hobbies", "interests",
    "objective", "summary", "profile", "declaration", "references",
    # Common misclassifications
    "cgpa", "gpa", "percentage", "marks", "grade", "class",
    "computer engineering", "information technology", "electronics",
    "mechanical engineering", "civil engineering", "electrical engineering",
    "full stack development", "web development", "machine learning",
    "artificial intelligence", "data science",
    "cbse", "icse", "ssc", "hsc", "state board",
    "aicte", "ugc", "nirf",
    # Short / generic words
    "ltd", "inc", "pvt", "limited", "corp",
}


# Words spaCy frequently misclassifies as ORG in resumes — filter them out
_NON_COMPANY_TOKENS = {
    # Degree types
    "b.tech", "btech", "b.e.", "be", "b.sc", "bsc", "m.tech", "mtech",
    "msc", "m.sc", "mba", "phd", "ph.d", "diploma",
    # Resume section headers
    "projects", "education", "experience", "skills", "certifications",
    "achievements", "awards", "internships", "hobbies", "interests",
    "objective", "summary", "profile", "declaration", "references",
    # Common misclassifications
    "cgpa", "gpa", "percentage", "marks", "grade", "class",
    "computer engineering", "information technology", "electronics",
    "mechanical engineering", "civil engineering", "electrical engineering",
    "full stack development", "web development", "machine learning",
    "artificial intelligence", "data science", "team size",
    "cbse", "icse", "ssc", "hsc", "state board",
    "aicte", "ugc", "nirf",
    # Short / generic words
    "ltd", "inc", "pvt", "limited", "corp",
}


def _extract_companies(text: str) -> list[str]:
    """
    REQ-9: Use spaCy NER to pull out ORG entities, then filter aggressively.

    spaCy's ORG detector has a high false-positive rate on resumes — it
    tags degree types, project titles, subject areas, and long phrases
    as organizations. We apply a multi-stage filter to keep only plausible
    company names (2-4 words, proper capitalization, no skill-list noise).
    """
    nlp = _get_nlp()
    if nlp is None:
        return []

    doc = nlp(text[:20000])
    orgs = [ent.text.strip() for ent in doc.ents if ent.label_ == "ORG"]

    seen: set[str] = set()
    out: list[str] = []

    for o in orgs:
        clean = o.strip()

        # Filter: strip leading articles like "the Cisco Internship" → "Cisco Internship"
        if clean.lower().startswith(("the ", "an ", "a ")):
            clean = clean.split(" ", 1)[1]

        lower = clean.lower()

        # Filter 1: known non-company tokens
        if lower in _NON_COMPANY_TOKENS:
            continue

        # Filter 2: too short
        if len(clean) < 3:
            continue

        # Filter 3: ALL CAPS short strings are usually acronyms/headers
        if clean.isupper() and len(clean) < 6:
            continue

        # Filter 4: too many words = it's a project description, not a company
        # Real company names are almost always 1-4 words
        word_count = len(clean.split())
        if word_count > 4:
            continue

        # Filter 5: contains digits that look like dates (e.g. "AI ML 28 Jul")
        if any(ch.isdigit() for ch in clean):
            continue

        # Filter 6: contains punctuation common in skill-lists (commas, slashes)
        if "," in clean or "/" in clean or ";" in clean:
            continue

        # Filter 7: dedupe
        if lower in seen:
            continue
        seen.add(lower)
        out.append(clean)

    return out[:10]

def _extract_name(text: str) -> str | None:
    """Heuristic: the name is usually the first 2-5 word line in the resume."""
    for line in text.splitlines():
        line = line.strip()
        if 2 <= len(line.split()) <= 5 and line.replace(" ", "").isalpha():
            return line
    return None


# ---------------- Main entry point ----------------

def parse_resume(path: str) -> dict[str, Any]:
    """
    Parse a resume file and return all extracted data.

    Returns:
        {
          "name": "Priya Sharma",
          "email": "priya@example.com",
          "phone": "+91 98XXX...",
          "experience": [{"start": "Jun 2022", "end": "Present"}, ...],
          "education": ["B.Tech CSE, IIT Bombay, 2020", ...],
          "skills": ["python", "react", "aws", ...],
          "companies": ["Google", "TCS", ...],
          "metadata": {"producer": "...", "author": "...", "modified": 2},
          "raw_text_length": 3421,
        }
    """
    text = _extract_text(path)

    email_match = EMAIL_RE.search(text)
    phone_match = PHONE_RE.search(text)

    return {
        "name": _extract_name(text),
        "email": email_match.group(0) if email_match else None,
        "phone": phone_match.group(0) if phone_match else None,
        "experience": _extract_dates(text),
        "education": [
            line for line in text.splitlines()
            if any(k in line.lower() for k in (
                "b.tech", "b.e.", "m.tech", "msc", "bsc", "phd", "university", "college"
            ))
        ][:5],
        "skills": _extract_skills(text),
        "companies": _extract_companies(text),
        "metadata": extract_pdf_metadata(path),
        "raw_text_length": len(text),
    }