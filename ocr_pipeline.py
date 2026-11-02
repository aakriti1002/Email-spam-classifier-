"""
ocr_pipeline.py
---------------
OCR preprocessing and text extraction for the Image-Based Email Spam Detector.

Dependencies (must be installed separately):
  - Tesseract OCR engine (system binary)
  - pytesseract   (Python wrapper)
  - opencv-python-headless
  - Pillow

On Windows (local development):
  Install Tesseract from: https://github.com/UB-Mannheim/tesseract/wiki
  Default path: C:\\Program Files\\Tesseract-OCR\\tesseract.exe

On Render (Linux):
  buildCommand includes: apt-get install -y tesseract-ocr

All functions return structured dicts so the Flask layer stays clean.
"""

from __future__ import annotations

import io
import os
import re
import sys
import logging
import tempfile
import platform
from typing import Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Optional-import helpers
# We import lazily so the rest of the app still loads if these libs are absent.
# Absence is reported clearly at request time rather than import time.
# ──────────────────────────────────────────────────────────────────────────────
_PIL_AVAILABLE = False
_CV2_AVAILABLE = False
_PYTESSERACT_AVAILABLE = False

try:
    from PIL import Image, ImageOps, ImageEnhance, ExifTags
    _PIL_AVAILABLE = True
except ImportError:
    pass

try:
    import cv2
    import numpy as np
    _CV2_AVAILABLE = True
except ImportError:
    pass

try:
    import pytesseract
    _PYTESSERACT_AVAILABLE = True

    # Locate Tesseract binary automatically if not already on PATH
    if platform.system() == "Windows":
        _WIN_PATHS = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            r"C:\Users\{}\AppData\Local\Programs\Tesseract-OCR\tesseract.exe".format(
                os.environ.get("USERNAME", "")
            ),
        ]
        for _p in _WIN_PATHS:
            if os.path.exists(_p):
                pytesseract.pytesseract.tesseract_cmd = _p
                break
    else:
        _LINUX_PATHS = [
            "/usr/bin/tesseract",
            "/usr/local/bin/tesseract",
            "/opt/render/project/src/bin/tesseract",
        ]
        for _p in _LINUX_PATHS:
            if os.path.exists(_p):
                pytesseract.pytesseract.tesseract_cmd = _p
                break
        if os.path.exists("/opt/render/project/src/tessdata"):
            os.environ.setdefault("TESSDATA_PREFIX", "/opt/render/project/src/tessdata")

except ImportError:
    pass


# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_BYTES = 5 * 1024 * 1024           # 5 MB
MAX_PIXEL_DIMENSION = 8000                 # either axis


# ──────────────────────────────────────────────────────────────────────────────
# Availability check
# ──────────────────────────────────────────────────────────────────────────────
def check_ocr_availability() -> dict:
    """Return a dict describing which OCR components are available."""
    tesseract_ok = False
    tesseract_version = None

    if _PYTESSERACT_AVAILABLE:
        try:
            tesseract_version = pytesseract.get_tesseract_version()
            tesseract_ok = True
        except Exception as exc:
            logger.warning("Tesseract engine not found: %s", exc)

    return {
        "pillow": _PIL_AVAILABLE,
        "opencv": _CV2_AVAILABLE,
        "pytesseract": _PYTESSERACT_AVAILABLE,
        "tesseract_engine": tesseract_ok,
        "tesseract_version": str(tesseract_version) if tesseract_version else None,
        "ready": _PIL_AVAILABLE and _PYTESSERACT_AVAILABLE and tesseract_ok,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Image validation
# ──────────────────────────────────────────────────────────────────────────────
def validate_image_upload(file_storage) -> tuple[bool, str]:
    """
    Validate a Flask FileStorage object.
    Returns (ok: bool, error_message: str).
    """
    filename = file_storage.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ALLOWED_EXTENSIONS:
        return False, (
            f"Unsupported file type '.{ext}'. "
            "Please upload a JPG, JPEG, PNG, or WEBP image."
        )

    # Read bytes once for validation
    file_storage.seek(0)
    raw = file_storage.read()
    file_storage.seek(0)

    # Size check
    if len(raw) == 0:
        return False, "The uploaded file is empty."
    if len(raw) > MAX_FILE_BYTES:
        mb = len(raw) / (1024 * 1024)
        return False, f"File too large ({mb:.1f} MB). Maximum allowed is 5 MB."

    # MIME / magic-byte check (PIL opens the header only)
    if not _PIL_AVAILABLE:
        return False, "Pillow is not installed on this server."

    try:
        img = Image.open(io.BytesIO(raw))
        fmt = (img.format or "").lower()
        if fmt not in {"jpeg", "png", "webp"}:
            return False, (
                f"File content is '{fmt}', not a supported image format. "
                "Please upload an actual JPG, PNG, or WEBP screenshot."
            )

        # Pixel dimension check
        w, h = img.size
        if w > MAX_PIXEL_DIMENSION or h > MAX_PIXEL_DIMENSION:
            return False, (
                f"Image dimensions ({w}×{h}) exceed the maximum "
                f"of {MAX_PIXEL_DIMENSION}×{MAX_PIXEL_DIMENSION} pixels."
            )

        if w < 10 or h < 10:
            return False, "Image is too small to extract any text."

    except Exception as exc:
        logger.warning("Image validation failed: %s", exc)
        return False, "The file appears to be corrupted or is not a valid image."

    return True, ""


# ──────────────────────────────────────────────────────────────────────────────
# Image preprocessing for OCR
# ──────────────────────────────────────────────────────────────────────────────
def _correct_exif_orientation(img: "Image.Image") -> "Image.Image":
    """Rotate image according to EXIF orientation tag."""
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
        if not exif:
            return img
        orient_key = next(
            (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
        )
        if orient_key is None:
            return img
        orientation = exif.get(orient_key)
        rotations = {3: 180, 6: 270, 8: 90}
        if orientation in rotations:
            img = img.rotate(rotations[orientation], expand=True)
    except Exception:
        pass
    return img


def _preprocess_with_opencv(pil_img: "Image.Image") -> "Image.Image":
    """
    Full OpenCV preprocessing pipeline:
      1. Convert to grayscale
      2. Gaussian noise reduction
      3. CLAHE contrast enhancement
      4. Adaptive thresholding (Otsu on most images, adaptive for low contrast)
    Returns a PIL image ready for Tesseract.
    """
    # PIL → numpy BGR
    img_rgb = np.array(pil_img.convert("RGB"))
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)

    # Upscale if too small (helps Tesseract accuracy)
    h, w = gray.shape
    if w < 300 or h < 100:
        scale = max(300 / w, 100 / h, 1.5)
        gray = cv2.resize(gray, None, fx=scale, fy=scale,
                          interpolation=cv2.INTER_CUBIC)

    # Denoise
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    # CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Binarize: try Otsu first; fall back to adaptive if result looks poor
    _, otsu = cv2.threshold(gray, 0, 255,
                             cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Estimate quality: if >90% black or >90% white, use adaptive
    black_ratio = np.sum(otsu == 0) / otsu.size
    if black_ratio < 0.05 or black_ratio > 0.95:
        processed = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            11, 2
        )
    else:
        processed = otsu

    return Image.fromarray(processed)


def _preprocess_pil_only(pil_img: "Image.Image") -> "Image.Image":
    """
    Fallback preprocessing using only Pillow (when OpenCV is unavailable).
    """
    img = pil_img.convert("L")   # grayscale

    # Upscale small images
    w, h = img.size
    if w < 300 or h < 100:
        scale = max(300 / w, 100 / h, 1.5)
        img = img.resize((int(w * scale), int(h * scale)),
                         Image.LANCZOS)  # type: ignore[attr-defined]

    # Mild contrast boost
    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = ImageEnhance.Sharpness(img).enhance(1.2)
    return img


def preprocess_image(raw_bytes: bytes) -> Optional["Image.Image"]:
    """
    Full preprocessing pipeline: EXIF → resize → noise reduction →
    contrast → binarise.
    Returns a PIL image or None on failure.
    """
    if not _PIL_AVAILABLE:
        return None
    try:
        pil_img = Image.open(io.BytesIO(raw_bytes))

        # Convert palette/RGBA modes before processing
        if pil_img.mode in ("P", "RGBA", "LA"):
            background = Image.new("RGB", pil_img.size, (255, 255, 255))
            if pil_img.mode in ("RGBA", "LA"):
                background.paste(pil_img, mask=pil_img.split()[-1])
            else:
                background.paste(pil_img.convert("RGBA"), mask=pil_img.convert("RGBA").split()[-1])
            pil_img = background
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        pil_img = _correct_exif_orientation(pil_img)

        if _CV2_AVAILABLE:
            return _preprocess_with_opencv(pil_img)
        else:
            return _preprocess_pil_only(pil_img)

    except Exception as exc:
        logger.error("Image preprocessing failed: %s", exc)
        return None


# ──────────────────────────────────────────────────────────────────────────────
# OCR text extraction
# ──────────────────────────────────────────────────────────────────────────────
def extract_text_from_image(raw_bytes: bytes) -> dict:
    """
    Extract text from an image using Tesseract OCR.

    Returns a dict:
      {
        "success": bool,
        "raw_text": str,            # full extracted text
        "cleaned_text": str,        # lightly cleaned (collapsed whitespace)
        "word_count": int,
        "char_count": int,
        "ocr_confidence": float,    # mean Tesseract confidence 0-100 (if available)
        "confidence_available": bool,
        "error": str or None,
      }
    """
    if not _PIL_AVAILABLE:
        return _ocr_error("Pillow is not installed. Cannot process images.")
    if not _PYTESSERACT_AVAILABLE:
        return _ocr_error(
            "pytesseract is not installed. "
            "Run: pip install pytesseract"
        )

    avail = check_ocr_availability()
    if not avail["tesseract_engine"]:
        return _ocr_error(
            "Tesseract OCR engine is not installed or not found on PATH. "
            "Windows: install from https://github.com/UB-Mannheim/tesseract/wiki. "
            "Linux/Render: apt-get install -y tesseract-ocr"
        )

    processed = preprocess_image(raw_bytes)
    if processed is None:
        return _ocr_error(
            "Image preprocessing failed. The image may be corrupted."
        )

    try:
        # Custom Tesseract config: treat as a block of text, enable OSD
        tess_config = (
            "--oem 3 "          # LSTM engine
            "--psm 6 "          # Assume a uniform block of text
            "-c preserve_interword_spaces=1"
        )

        raw_text = pytesseract.image_to_string(
            processed,
            config=tess_config,
            timeout=30,
        )

        # Get confidence data if possible
        ocr_confidence = None
        confidence_available = False
        try:
            df = pytesseract.image_to_data(
                processed,
                config=tess_config,
                output_type=pytesseract.Output.DICT,
                timeout=30,
            )
            confs = [
                int(c) for c in df["conf"]
                if str(c).strip() not in ("", "-1")
            ]
            if confs:
                ocr_confidence = round(sum(confs) / len(confs), 1)
                confidence_available = True
        except Exception:
            pass

    except RuntimeError as exc:
        return _ocr_error(f"OCR timed out or failed: {exc}")
    except Exception as exc:
        logger.error("Tesseract error: %s", exc)
        return _ocr_error(f"OCR extraction failed: {exc}")

    cleaned = _clean_ocr_text(raw_text)

    if len(cleaned.strip()) < 10:
        return _ocr_error(
            "Could not extract meaningful text from this image. "
            "Please upload a clearer, higher-resolution screenshot."
        )

    return {
        "success": True,
        "raw_text": raw_text,
        "cleaned_text": cleaned,
        "word_count": len(cleaned.split()),
        "char_count": len(cleaned),
        "ocr_confidence": ocr_confidence,
        "confidence_available": confidence_available,
        "error": None,
    }


def _ocr_error(msg: str) -> dict:
    return {
        "success": False,
        "raw_text": "",
        "cleaned_text": "",
        "word_count": 0,
        "char_count": 0,
        "ocr_confidence": None,
        "confidence_available": False,
        "error": msg,
    }


def _clean_ocr_text(text: str) -> str:
    """
    Light normalisation of OCR output.
    Preserves line structure (important for detecting From/Subject/To fields).
    Does NOT do NLP cleaning — that is handled by preprocess.clean_text().
    """
    # Collapse 3+ consecutive blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove trailing whitespace on each line
    lines = [line.rstrip() for line in text.splitlines()]
    # Remove lines that are purely OCR noise (single special chars)
    lines = [ln for ln in lines if not re.match(r"^[^\w\s]{1,2}$", ln)]
    return "\n".join(lines).strip()


# ──────────────────────────────────────────────────────────────────────────────
# Email-field extraction from OCR text
# ──────────────────────────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
_SUBJECT_RE = re.compile(
    r"^(?:subject|subj|re|fwd?)[\s:]+(.+)$", re.IGNORECASE | re.MULTILINE
)
_FROM_RE = re.compile(
    r"^(?:from|sender|de)[\s:]+(.+)$", re.IGNORECASE | re.MULTILINE
)
_TO_RE = re.compile(
    r"^(?:to|recipient|à)[\s:]+(.+)$", re.IGNORECASE | re.MULTILINE
)
_PHONE_RE = re.compile(
    r"(?:\+?\d[\d\s\-().]{7,}\d)"
)
_URL_RE = re.compile(
    r"https?://[^\s<>\"]+|www\.[^\s<>\"]+", re.IGNORECASE
)


def extract_email_fields(text: str) -> dict:
    """
    Attempt to identify email metadata fields from OCR text.
    All fields are optional — missing ones are returned as None.
    Does NOT invent data.
    """
    emails = _EMAIL_RE.findall(text)
    from_match = _FROM_RE.search(text)
    to_match = _TO_RE.search(text)
    subject_match = _SUBJECT_RE.search(text)
    urls = _URL_RE.findall(text)
    phones = _PHONE_RE.findall(text)

    sender = None
    if from_match:
        # Prefer email address inside from-line if present
        from_line = from_match.group(1).strip()
        em = _EMAIL_RE.search(from_line)
        sender = em.group(0) if em else from_line[:80]
    elif emails:
        sender = emails[0]   # fallback: first email found

    recipient = None
    if to_match:
        to_line = to_match.group(1).strip()
        em = _EMAIL_RE.search(to_line)
        recipient = em.group(0) if em else to_line[:80]
    elif len(emails) > 1:
        recipient = emails[1]

    subject = subject_match.group(1).strip()[:200] if subject_match else None

    return {
        "sender": sender,
        "recipient": recipient,
        "subject": subject,
        "emails_found": emails[:10],
        "urls_found": urls[:20],
        "phones_found": [p.strip() for p in phones[:10]],
        "has_metadata": any([sender, recipient, subject]),
    }

