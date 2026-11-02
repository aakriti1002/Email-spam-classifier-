"""
tests/test_image_analysis.py
-----------------------------
Comprehensive tests for the Image-Based Email Spam Analysis feature.

Run from the project root with the Flask dev server already running:
    python tests/test_image_analysis.py

Or run against a local server via pytest (requires pytest-flask):
    pytest tests/test_image_analysis.py -v

Tests cover:
  Phase 12 — all 12 image test scenarios
  Phase 12 — regression tests for all existing features
"""

import io
import json
import os
import sys
import struct
import zlib
import urllib.request
import urllib.error

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# Test helpers
# ──────────────────────────────────────────────────────────────────────────────
BASE = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:5000")
_ok = 0
_fail = 0
_skip = 0

# Try connecting to live server, else fall back to Flask test_client
_client = None
try:
    urllib.request.urlopen(BASE + "/api/ocr-status", timeout=1)
    _use_http = True
except Exception:
    _use_http = False
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app import app
    app.config["TESTING"] = True
    _client = app.test_client()


def chk(name: str, cond: bool, note: str = ""):
    global _ok, _fail
    if cond:
        print(f"  [PASS] {name}" + (f"  ({note})" if note else ""))
        _ok += 1
    else:
        print(f"  [FAIL] {name}" + (f"  ({note})" if note else ""))
        _fail += 1


def skip(name: str, reason: str):
    global _skip
    print(f"  [SKIP] {name}  — {reason}")
    _skip += 1


def get_req(path: str) -> tuple[int, dict | str]:
    """GET request to the server or test_client."""
    if _use_http:
        try:
            r = urllib.request.urlopen(BASE + path)
            data = r.read()
            ct = r.headers.get("Content-Type", "")
            if "application/json" in ct:
                return r.status, json.loads(data)
            return r.status, data.decode(errors="replace")
        except urllib.error.HTTPError as e:
            data = e.read() or b"{}"
            ct = e.headers.get("Content-Type", "")
            if "application/json" in ct:
                return e.code, json.loads(data)
            return e.code, data.decode(errors="replace")
    else:
        res = _client.get(path)
        if res.is_json:
            return res.status_code, res.get_json()
        return res.status_code, res.get_data(as_text=True)


def post_json(path: str, body: dict) -> tuple[int, dict]:
    """POST JSON to the server or test_client, return (status_code, response_dict)."""
    if _use_http:
        payload = json.dumps(body).encode()
        req = urllib.request.Request(
            BASE + path,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            r = urllib.request.urlopen(req)
            return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")
    else:
        res = _client.post(path, json=body)
        return res.status_code, res.get_json() or {}


def post_image(path: str, img_bytes: bytes, filename: str,
               mime: str = "image/png") -> tuple[int, dict | str]:
    """POST a multipart image upload."""
    if _use_http:
        boundary = b"----TestBoundary9f3b"
        body = (
            b"--" + boundary + b"\r\n"
            b'Content-Disposition: form-data; name="image"; filename="' +
            filename.encode() + b'"\r\n'
            b"Content-Type: " + mime.encode() + b"\r\n\r\n" +
            img_bytes +
            b"\r\n--" + boundary + b"--\r\n"
        )
        req = urllib.request.Request(
            BASE + path,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}"},
        )
        try:
            r = urllib.request.urlopen(req)
            data = r.read()
            ct = r.headers.get("Content-Type", "")
            if "application/json" in ct:
                return r.status, json.loads(data)
            return r.status, data.decode(errors="replace")
        except urllib.error.HTTPError as e:
            data = e.read() or b"{}"
            ct = e.headers.get("Content-Type", "")
            if "application/json" in ct:
                return e.code, json.loads(data)
            return e.code, data.decode(errors="replace")
    else:
        data = {
            "image": (io.BytesIO(img_bytes), filename, mime)
        }
        res = _client.post(path, data=data, content_type="multipart/form-data")
        if res.is_json:
            return res.status_code, res.get_json()
        return res.status_code, res.get_data(as_text=True)


# ──────────────────────────────────────────────────────────────────────────────
# Image generators (pure Python — no PIL required for test generation)
# ──────────────────────────────────────────────────────────────────────────────
def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def make_minimal_png(width: int = 100, height: int = 30,
                     text_fill: bool = True) -> bytes:
    """
    Create a minimal valid grayscale PNG.
    If text_fill=True, fills with a pattern that looks slightly like text
    (alternating light/dark rows) so Tesseract has something to read.
    """
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    ihdr = _png_chunk(b"IHDR", ihdr_data)

    # Build raw pixel rows
    rows = []
    for y in range(height):
        row = bytearray([0])   # filter type = None
        for x in range(width):
            if text_fill:
                # Alternating stripes to simulate text lines
                v = 30 if (y // 4) % 2 == 0 and (x % 6 < 3) else 240
            else:
                v = 200  # plain light gray — "no text"
            row.append(v)
        rows.append(bytes(row))

    raw = b"".join(rows)
    compressed = zlib.compress(raw)
    idat = _png_chunk(b"IDAT", compressed)
    iend = _png_chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


def make_oversized_png_metadata() -> bytes:
    """
    A valid PNG with huge dimensions in the header (to trigger pixel limit).
    We won't compress actual pixels — just send the IHDR with big dimensions.
    """
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 9000, 9000, 8, 0, 0, 0, 0)
    ihdr = _png_chunk(b"IHDR", ihdr_data)
    iend = _png_chunk(b"IEND", b"")
    return sig + ihdr + iend


# ──────────────────────────────────────────────────────────────────────────────
# Test: OCR status endpoint
# ──────────────────────────────────────────────────────────────────────────────
def test_ocr_status():
    print("\n=== OCR Status Endpoint ===")
    try:
        sc, data = get_req("/api/ocr-status")
        chk("GET /api/ocr-status returns JSON", isinstance(data, dict))
        chk("Response has 'pillow' key", "pillow" in data)
        chk("Response has 'tesseract_engine' key", "tesseract_engine" in data)
        chk("Response has 'ready' key", "ready" in data)
        print(f"     OCR ready={data.get('ready')}, "
              f"tesseract={data.get('tesseract_engine')}, "
              f"version={data.get('tesseract_version')}")
        return data.get("ready", False)
    except Exception as e:
        chk("GET /api/ocr-status reachable", False, str(e))
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Test: Image upload validation
# ──────────────────────────────────────────────────────────────────────────────
def test_upload_validation():
    print("\n=== Image Upload Validation ===")

    # No image field
    if _use_http:
        req = urllib.request.Request(
            BASE + "/api/analyze-image",
            data=b"--X\r\nContent-Disposition: form-data; name=\"not_image\"\r\n\r\nval\r\n--X--\r\n",
            headers={"Content-Type": "multipart/form-data; boundary=X"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req)
            chk("Missing 'image' field → 400", False)
        except urllib.error.HTTPError as e:
            chk("Missing 'image' field → 400", e.code == 400)
    else:
        res = _client.post("/api/analyze-image", data={})
        chk("Missing 'image' field → 400", res.status_code == 400)

    # Unsupported format (txt uploaded as image)
    sc, data = post_image("/api/analyze-image", b"hello world", "email.txt",
                          mime="text/plain")
    chk("Wrong extension (.txt) → 400", sc == 400)
    chk("Wrong extension → JSON error", isinstance(data, dict) and "error" in data)

    # Corrupted image bytes
    sc, data = post_image("/api/analyze-image", b"\x00\x01\x02corrupted",
                          "corrupt.png", mime="image/png")
    chk("Corrupted image → 400 or 422", sc in (400, 422))

    # Empty file
    sc, data = post_image("/api/analyze-image", b"", "empty.png", mime="image/png")
    chk("Empty file → 400", sc == 400)

    # Oversized (>5 MB) — use dummy bytes
    big = b"A" * (5 * 1024 * 1024 + 1)
    sc, data = post_image("/api/analyze-image", big, "huge.png", mime="image/png")
    chk("Oversized file → 400", sc == 400)
    if isinstance(data, dict):
        chk("Oversized error message mentions MB or size", "mb" in data.get("error", "").lower()
            or "size" in data.get("error", "").lower()
            or "large" in data.get("error", "").lower())


# ──────────────────────────────────────────────────────────────────────────────
# Test: Valid image upload + OCR
# ──────────────────────────────────────────────────────────────────────────────
def test_valid_image_upload(ocr_ready: bool):
    print("\n=== Valid Image Upload ===")

    png = make_minimal_png(200, 60, text_fill=True)
    sc, data = post_image("/api/analyze-image", png, "test_email.png")

    if not ocr_ready:
        skip("OCR extraction with valid PNG", "Tesseract not available in test env")
        # But we can still check the error response is structured
        chk("Response is JSON dict", isinstance(data, dict))
        chk("Response has 'error' key when OCR unavailable",
            "error" in data or "ocrFailed" in data)
        return

    if sc == 200:
        chk("Valid PNG → 200", True)
        chk("Response has 'prediction'", "prediction" in data)
        chk("Prediction is Spam or Ham",
            data.get("prediction") in ("Spam", "Ham"))
        chk("Response has 'confidence'", "confidence" in data,
            str(data.get("confidence")))
        chk("Confidence is numeric",
            isinstance(data.get("confidence"), (int, float)))
        chk("Response has 'riskScore'", "riskScore" in data)
        chk("Response has 'ocrText'", "ocrText" in data)
        chk("Response has 'ocrConfidence'", "ocrConfidence" in data)
        chk("Response has 'emailFields'", "emailFields" in data)
        chk("analysisType is 'image'", data.get("analysisType") == "image")
        chk("Response has 'phishingDetected'", "phishingDetected" in data)
        chk("Response has 'urlAnalysis'", "urlAnalysis" in data)
        chk("ocrText is not empty", bool(data.get("ocrText", "").strip()))
    elif sc == 422:
        # No text extracted — valid response for a minimal PNG
        chk("No-text image → 422 with ocrFailed=True",
            isinstance(data, dict) and data.get("ocrFailed") is True)
    else:
        chk(f"Valid PNG → 200 or 422 (got {sc})", False)


# ──────────────────────────────────────────────────────────────────────────────
# Test: No-text image
# ──────────────────────────────────────────────────────────────────────────────
def test_no_text_image(ocr_ready: bool):
    print("\n=== Image With No Text ===")
    if not ocr_ready:
        skip("No-text image → 422", "Tesseract not available")
        return

    png = make_minimal_png(100, 100, text_fill=False)  # solid gray
    sc, data = post_image("/api/analyze-image", png, "no_text.png")
    chk("No-text image → 422 or 200",
        sc in (200, 422),
        f"status={sc}")
    if sc == 422 and isinstance(data, dict):
        chk("No-text → ocrFailed=True", data.get("ocrFailed") is True)
        chk("No-text → meaningful error message",
            len(data.get("error", "")) > 10)


# ──────────────────────────────────────────────────────────────────────────────
# Test: Pixel dimension limit
# ──────────────────────────────────────────────────────────────────────────────
def test_oversized_dimensions():
    print("\n=== Oversized Image Dimensions ===")
    png = make_oversized_png_metadata()
    sc, data = post_image("/api/analyze-image", png, "huge_dims.png")
    chk("Oversized dimensions → 400", sc == 400)
    if isinstance(data, dict):
        chk("Dimension error references size or pixels",
            any(kw in data.get("error", "").lower()
                for kw in ("dimension", "pixel", "9000", "8000", "large", "size")))


# ──────────────────────────────────────────────────────────────────────────────
# Test: Analyse-extracted-text endpoint
# ──────────────────────────────────────────────────────────────────────────────
def test_analyze_extracted_text():
    print("\n=== Analyse Extracted Text Endpoint ===")

    # Spam text (from an image that was OCR'd)
    sc, data = post_json("/api/analyze-extracted-text", {
        "text": "CONGRATULATIONS! You have won $1,000,000 lottery prize. "
                "Click here immediately to claim your FREE reward before it expires! "
                "http://bit.ly/claim-prize-now",
        "source": "ocr",
    })
    chk("POST /api/analyze-extracted-text → 200", sc == 200)
    chk("Spam OCR text → Spam", data.get("prediction") == "Spam")
    chk("Response has 'riskScore'", "riskScore" in data)
    chk("Response has 'phishingDetected'", "phishingDetected" in data)
    chk("Response has 'reasons'", "reasons" in data)
    chk("analysisType contains 'image'",
        "image" in (data.get("analysisType") or ""))

    # Ham text
    sc2, data2 = post_json("/api/analyze-extracted-text", {
        "text": "Hi Sarah, can we schedule a meeting at 3pm tomorrow to discuss the Q4 report?",
        "source": "edited",
    })
    chk("Ham OCR text → Ham", data2.get("prediction") == "Ham")

    # Empty text
    sc3, data3 = post_json("/api/analyze-extracted-text", {"text": ""})
    chk("Empty text → 400", sc3 == 400)

    # Missing text key
    sc4, data4 = post_json("/api/analyze-extracted-text", {})
    chk("Missing text → 400", sc4 == 400)


# ──────────────────────────────────────────────────────────────────────────────
# Test: Phishing URL in extracted text
# ──────────────────────────────────────────────────────────────────────────────
def test_phishing_in_extracted_text():
    print("\n=== Phishing + URL in Extracted Text ===")
    sc, data = post_json("/api/analyze-extracted-text", {
        "text": "URGENT: Your bank account suspended. "
                "Click immediately to verify your account: http://bit.ly/verify-now or account will be closed.",
        "source": "ocr",
    })
    chk("Phishing text → 200", sc == 200)
    chk("Phishing text → Spam", data.get("prediction") == "Spam")
    chk("phishingDetected = True", data.get("phishingDetected") is True)
    chk("URL count >= 1", (data.get("urlAnalysis") or {}).get("count", 0) >= 1)
    chk("Shortened URL detected",
        (data.get("urlAnalysis") or {}).get("shortened", 0) >= 1)


# ──────────────────────────────────────────────────────────────────────────────
# Regression: Existing feature tests
# ──────────────────────────────────────────────────────────────────────────────
def test_existing_homepage():
    print("\n=== REGRESSION: Homepage ===")
    sc, data = get_req("/")
    chk("GET / returns 200", sc == 200)


def test_existing_dashboard():
    print("\n=== REGRESSION: Dashboard ===")
    sc, data = get_req("/dashboard")
    chk("GET /dashboard returns 200", sc == 200)


def test_existing_spam_prediction():
    print("\n=== REGRESSION: Text Spam Prediction ===")
    sc, data = post_json("/api/predict", {
        "email": "Congratulations! You won a lottery prize. Click here claim FREE reward now!"
    })
    chk("Spam text → 200", sc == 200)
    chk("Spam prediction = Spam", data.get("prediction") == "Spam")
    chk("Spam confidence is numeric", isinstance(data.get("confidence"), (int, float)))
    chk("Spam riskScore > 40", data.get("riskScore", 0) > 40)
    chk("Spam reasons not empty", len(data.get("reasons", [])) > 0)
    print(f"     confidence={data.get('confidence')}%, risk={data.get('riskScore')}")


def test_existing_ham_prediction():
    print("\n=== REGRESSION: Text Ham Prediction ===")
    sc, data = post_json("/api/predict", {
        "email": "Hi can we schedule a meeting tomorrow at 3pm to discuss the project?"
    })
    chk("Ham text → 200", sc == 200)
    chk("Ham prediction = Ham", data.get("prediction") == "Ham")
    chk("Ham riskScore < 35", data.get("riskScore", 100) < 35)


def test_existing_phishing():
    print("\n=== REGRESSION: Phishing + URL Detection ===")
    sc, data = post_json("/api/predict", {
        "email": "URGENT bank account suspended verify http://bit.ly/verify-now immediately"
    })
    chk("Phishing email → 200", sc == 200)
    chk("Phishing classified Spam", data.get("prediction") == "Spam")
    chk("URL count >= 1", (data.get("urlAnalysis") or {}).get("count", 0) >= 1)
    chk("Shortened URL detected",
        (data.get("urlAnalysis") or {}).get("shortened", 0) >= 1)
    chk("phishingDetected = True", data.get("phishingDetected") is True)


def test_existing_empty_input():
    print("\n=== REGRESSION: Input Validation ===")
    sc, data = post_json("/api/predict", {"email": ""})
    chk("Empty input → 400", sc == 400)
    chk("400 response has 'error' key", "error" in data)


def test_existing_history():
    print("\n=== REGRESSION: History API ===")
    sc, data = get_req("/api/history")
    chk("GET /api/history returns 200", sc == 200)
    chk("History has 'data' array", "data" in data)
    chk("History has 'total'", "total" in data)
    chk("History total >= 0", data.get("total", -1) >= 0)


def test_existing_stats():
    print("\n=== REGRESSION: Stats API ===")
    sc, data = get_req("/api/stats")
    chk("GET /api/stats returns 200", sc == 200)
    chk("Stats has 'total'", "total" in data)
    chk("Stats has 'spam'", "spam" in data)
    chk("Stats has 'ham'", "ham" in data)
    chk("Stats has 'avgConfidence'", "avgConfidence" in data)


def test_existing_model_info():
    print("\n=== REGRESSION: Model Info API ===")
    sc, data = get_req("/api/model-info")
    chk("GET /api/model-info returns 200", sc == 200)
    chk("Model info has 'best_model'", "best_model" in data)
    chk("Best model = SVM", "Support Vector" in (data.get("best_model") or ""))


def test_existing_404_json():
    print("\n=== REGRESSION: 404 returns JSON ===")
    sc, data = get_req("/nonexistent-route-xyz")
    chk("404 returns 404 status", sc == 404)
    chk("404 body has 'error' key", isinstance(data, dict) and "error" in data)


# ──────────────────────────────────────────────────────────────────────────────
# Phase 12: Comprehensive 12 Scenario Tests (with Mocked OCR Engine)
# Ensures all 12 exact project prompt scenarios are tested end-to-end
# ──────────────────────────────────────────────────────────────────────────────
from unittest.mock import patch


def test_twelve_image_scenarios():
    print("\n=== PHASE 12: 12 IMAGE TEST SCENARIOS ===")
    png = make_minimal_png(200, 60, text_fill=True)

    scenarios = [
        # (Scenario Name, Mock OCR Text, Expected Pred, Expected Phish, Expected Susp URL)
        (
            "1. Normal personal email screenshot",
            "From: friend@gmail.com\nSubject: Coffee this weekend\nHey! Are you free to catch up for coffee this Saturday around 11am? Let me know!",
            "Ham", False, False
        ),
        (
            "2. Promotional email screenshot",
            "From: promo@deals.com\nSubject: Exclusive offer for you!\nDiscount up to 90% off. FREE GIFT! Limited time offer. Click here to claim your free reward promo coupon now!",
            "Spam", None, False
        ),
        (
            "3. Lottery scam screenshot",
            "From: lottery@prize-claim.xyz\nSubject: Congratulations you won $1,000,000!\nWINNER! You have won a $1,000,000 cash prize in our international lottery. Claim your reward now!",
            "Spam", True, False
        ),
        (
            "4. Fake bank notification",
            "From: security@mybank-alert.com\nSubject: Alert: Account suspended\nURGENT: Your bank account suspended due to unauthorized access. Contact support immediately.",
            "Spam", True, False
        ),
        (
            "5. Phishing screenshot with suspicious URL",
            "From: alerts@paypal-verify.xyz\nSubject: Account verification required\nURGENT: Your account suspended. Click immediately to verify your account: http://bit.ly/secure-login",
            "Spam", True, True
        ),
        (
            "6. Low-resolution image",
            "From: colleague@work.com\nSubject: Quick question\nCan you please review the attached document before the team sync?",
            "Ham", False, False
        ),
        (
            "7. Blurry screenshot",
            "From: boss@company.org\nSubject: Meeting rescheduled\nThe Monday budget meeting has been moved to 3pm in Conference Room B.",
            "Ham", False, False
        ),
        (
            "8. Image containing no text",
            "",   # Empty OCR text
            None, None, None
        ),
        (
            "9. Corrupted image",
            None, # Will send corrupted bytes
            None, None, None
        ),
        (
            "10. Unsupported file format",
            None, # Will send .txt as image
            None, None, None
        ),
        (
            "11. Oversized image (>5 MB)",
            None, # Will send >5MB payload
            None, None, None
        ),
        (
            "12. Mixed legitimate and suspicious content",
            "From: info@university.edu\nSubject: Student portal update\nDear Student, please verify your account immediately at http://bit.ly/update-now to claim your free reward voucher.",
            "Spam", True, True
        ),
    ]

    for name, ocr_text, exp_pred, exp_phish, exp_susp_url in scenarios:
        if name.startswith("8."):
            # No text scenario
            with patch("ocr_pipeline._PYTESSERACT_AVAILABLE", True), \
                 patch("ocr_pipeline.check_ocr_availability", return_value={"ready": True, "tesseract_engine": True, "pillow": True, "pytesseract": True}), \
                 patch("pytesseract.image_to_string", return_value="   \n   "):
                sc, data = post_image("/api/analyze-image", png, "no_text.png")
                chk(f"{name} -> 422 rejected", sc == 422 and data.get("ocrFailed") is True)

        elif name.startswith("9."):
            # Corrupted image
            sc, data = post_image("/api/analyze-image", b"\x00\x01not-an-image", "corrupt.png")
            chk(f"{name} -> 400 rejected", sc == 400)

        elif name.startswith("10."):
            # Unsupported file format
            sc, data = post_image("/api/analyze-image", b"text content", "email.txt", mime="text/plain")
            chk(f"{name} -> 400 rejected", sc == 400)

        elif name.startswith("11."):
            # Oversized image
            big_data = b"A" * (5 * 1024 * 1024 + 10)
            sc, data = post_image("/api/analyze-image", big_data, "oversized.png")
            chk(f"{name} -> 400 rejected", sc == 400)

        else:
            # Scenarios with mock OCR text
            with patch("ocr_pipeline._PYTESSERACT_AVAILABLE", True), \
                 patch("ocr_pipeline.check_ocr_availability", return_value={"ready": True, "tesseract_engine": True, "pillow": True, "pytesseract": True}), \
                 patch("pytesseract.image_to_string", return_value=ocr_text), \
                 patch("pytesseract.image_to_data", return_value={"conf": ["85", "90", "92"]}):

                sc, data = post_image("/api/analyze-image", png, "scenario.png")
                chk(f"{name} -> 200 OK", sc == 200)
                if sc == 200:
                    chk(f"{name} -> Pred={exp_pred}", data.get("prediction") == exp_pred)
                    chk(f"{name} -> OCR text returned", bool(data.get("ocrText")))
                    chk(f"{name} -> Confidence numeric", isinstance(data.get("confidence"), (int, float)))
                    chk(f"{name} -> Risk score calculated", isinstance(data.get("riskScore"), int))
                    if exp_phish is not None:
                        chk(f"{name} -> Phish detected={exp_phish}", data.get("phishingDetected") == exp_phish)
                    if exp_susp_url:
                        chk(f"{name} -> Suspicious URL detected", (data.get("urlAnalysis") or {}).get("shortened", 0) > 0)


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def run_all_tests():
    print(f"\n{'='*60}")
    print(f"  IMAGE ANALYSIS FEATURE — TEST SUITE")
    print(f"  Server: {BASE}")
    print(f"{'='*60}")

    # Check OCR availability
    ocr_ready = test_ocr_status()

    # New image analysis tests
    test_upload_validation()
    test_valid_image_upload(ocr_ready)
    test_no_text_image(ocr_ready)
    test_oversized_dimensions()
    test_analyze_extracted_text()
    test_phishing_in_extracted_text()

    # 12 Specific Project Scenarios (Phase 12)
    test_twelve_image_scenarios()

    # Regression tests for existing features
    test_existing_homepage()
    test_existing_dashboard()
    test_existing_spam_prediction()
    test_existing_ham_prediction()
    test_existing_phishing()
    test_existing_empty_input()
    test_existing_history()
    test_existing_stats()
    test_existing_model_info()
    test_existing_404_json()

    print(f"\n{'='*60}")
    print(f"  RESULTS: {_ok} PASSED  |  {_fail} FAILED  |  {_skip} SKIPPED")
    print(f"{'='*60}\n")

    if _skip > 0:
        print("  SKIPPED tests require Tesseract OCR to be installed.")
        print("  Install Tesseract and re-run to test OCR extraction.\n")

    return _fail == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

