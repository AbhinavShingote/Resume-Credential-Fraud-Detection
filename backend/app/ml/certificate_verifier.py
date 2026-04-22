"""
Certificate verification — OCR + Error Level Analysis (ELA) for image tampering.

Covers SRS REQ-15 to REQ-18:
  REQ-15: Accept and verify certificate images
  REQ-16: Detect tampering via ELA (pixel-level anomaly detection)
  REQ-17: OCR-extract issuer and candidate info
  REQ-18: Return verification status + confidence score

How ELA works:
  When you edit part of a JPEG and re-save, the edited region ends up with a
  DIFFERENT compression history than the rest of the image. Re-compressing the
  whole image at a known quality and diffing pixel-by-pixel reveals this
  difference — tampered regions show up as bright spots.
"""
from __future__ import annotations

import io
from typing import Any

import cv2
import numpy as np
from PIL import Image


def _compute_ela_score(img: np.ndarray, quality: int = 90) -> float:
    """
    Compute an Error Level Analysis score in [0, 1].
    Higher score → more likely tampered.

    Steps:
      1. Re-save the image at JPEG quality 90
      2. Compute the mean pixel difference between original and re-saved
      3. Normalize to [0, 1] with a multiplier to amplify small differences
    """
    try:
        # OpenCV uses BGR, PIL uses RGB — convert before saving
        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    except Exception:
        return 0.0

    # Re-save the image in memory at a known JPEG quality
    buf = io.BytesIO()
    pil_img.save(buf, "JPEG", quality=quality)
    buf.seek(0)

    # Read it back and convert back to BGR
    resaved = np.array(Image.open(buf))
    resaved_bgr = cv2.cvtColor(resaved, cv2.COLOR_RGB2BGR)

    # Defensive: resize if shapes mismatch (rare edge case)
    if img.shape != resaved_bgr.shape:
        resaved_bgr = cv2.resize(resaved_bgr, (img.shape[1], img.shape[0]))

    # Mean absolute pixel difference, normalized by max possible value (255)
    diff = cv2.absdiff(img, resaved_bgr)
    mean_diff = float(np.mean(diff)) / 255.0

    # Amplify — real tampering typically gives a raw mean diff of 0.05-0.20,
    # so multiplying by 6 maps that to our final 0.3-1.0 "tampered" range.
    return min(1.0, mean_diff * 6.0)


def _ocr_text(img: np.ndarray) -> str:
    """REQ-17: Extract readable text from the certificate using Tesseract OCR."""
    try:
        import pytesseract
        return pytesseract.image_to_string(img) or ""
    except Exception:
        # If Tesseract isn't installed or fails, just return empty
        # (the verifier will flag "low text" separately)
        return ""


def verify_certificate(
    img: np.ndarray,
    issuer_template: np.ndarray | None = None,
) -> dict[str, Any]:
    """
    Main certificate verification entry point.

    Args:
        img: OpenCV BGR image of the certificate (read with cv2.imread or decoded from bytes)
        issuer_template: Optional reference logo for template matching (future extension)

    Returns:
        {
          "status": "verified" | "suspicious" | "failed",
          "confidence": 0.0 to 1.0,
          "ela_score": raw ELA score,
          "extracted_text": first 500 chars of OCR output,
          "flags": list of human-readable concern strings
        }
    """
    flags: list[str] = []

    # Step 1: Pixel-level tampering check
    ela = _compute_ela_score(img)

    # Step 2: OCR text extraction
    text = _ocr_text(img)

    # Step 3: Rule-based decision
    confidence = 1.0 - ela

    if ela > 0.5:
        status = "failed"
        flags.append("High ELA anomaly — image likely tampered")
    elif ela > 0.25:
        status = "suspicious"
        flags.append("Moderate ELA anomaly — manual review recommended")
    else:
        status = "verified"

    # Step 4: Text-based checks layered on top
    if len(text.strip()) < 20:
        if status == "verified":
            status = "suspicious"
        flags.append("OCR extracted very little text — image may be low-quality or non-standard")
        confidence *= 0.7

    # Step 5: Check for a recognizable issuer keyword
    # (a real certificate should at least mention its issuing body)
    issuer_keywords = (
        "university", "institute", "amazon", "google", "microsoft",
        "coursera", "udemy", "aws", "oracle", "ibm", "meta", "cisco", "stanford",
    )
    if status == "verified" and not any(k in text.lower() for k in issuer_keywords):
        flags.append("No recognized issuer keyword found in certificate text")
        confidence *= 0.85

    return {
        "status": status,
        "confidence": round(max(0.0, min(1.0, confidence)), 2),
        "ela_score": round(ela, 3),
        "extracted_text": text[:500],
        "flags": flags,
    }


def verify_certificate_from_bytes(data: bytes) -> dict[str, Any]:
    """
    Convenience wrapper: accept raw image bytes (e.g. from an HTTP upload)
    and run the verifier on it.
    """
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        return {
            "status": "failed",
            "confidence": 0.0,
            "ela_score": 0.0,
            "extracted_text": "",
            "flags": ["Could not decode image — bad file format"],
        }
    return verify_certificate(img)