"""
app.py
------
Flask application entry point for the AI Email Spam Classifier.
Provides REST APIs and serves HTML templates.
"""

import os
import sys
import json
import sqlite3
import joblib
import threading
from datetime import datetime
from flask import Flask, request, jsonify, render_template, g, send_from_directory
from flask_cors import CORS

from preprocess import (
    clean_text, extract_urls, detect_phishing,
    extract_spam_reasons, get_highlight_words, compute_risk_score,
    ensure_nltk_data,
)

# ──────────────────────────────────────────────
# Application Setup
# ──────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
DB_PATH = os.path.join(BASE_DIR, "database.db")

app = Flask(__name__)
CORS(app)

# ──────────────────────────────────────────────
# Lazy model loading (thread-safe singleton)
# ──────────────────────────────────────────────
_model = None
_vectorizer = None
_metrics = {}
_lock = threading.Lock()


def load_model():
    """Load ML model and TF-IDF vectorizer from disk (lazy, once)."""
    global _model, _vectorizer, _metrics
    with _lock:
        if _model is not None:
            return True
        model_path = os.path.join(MODEL_DIR, "spam_model.pkl")
        vec_path = os.path.join(MODEL_DIR, "tfidf_vectorizer.pkl")
        metrics_path = os.path.join(MODEL_DIR, "model_metrics.json")

        if not os.path.exists(model_path) or not os.path.exists(vec_path):
            return False

        _model = joblib.load(model_path)
        _vectorizer = joblib.load(vec_path)

        if os.path.exists(metrics_path):
            with open(metrics_path, "r") as f:
                _metrics = json.load(f)
        return True


# ──────────────────────────────────────────────
# Database helpers
# ──────────────────────────────────────────────
def get_db():
    """Get per-request SQLite connection."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Initialise the database schema."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prediction_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                email_text  TEXT    NOT NULL,
                prediction  TEXT    NOT NULL,
                confidence  REAL    NOT NULL,
                risk_score  INTEGER NOT NULL,
                reasons     TEXT,
                timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


# ──────────────────────────────────────────────
# Page & Asset routes
# ──────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/favicon.ico")
@app.route("/favicon-32x32.png")
@app.route("/favicon-16x16.png")
@app.route("/apple-touch-icon.png")
@app.route("/logo.png")
def static_root_assets():
    filename = request.path.lstrip("/")
    return send_from_directory(os.path.join(BASE_DIR, "static"), filename)


@app.route("/public/logo.png")
def public_logo():
    return send_from_directory(os.path.join(BASE_DIR, "public"), "logo.png")


# ──────────────────────────────────────────────
# API: Predict
# ──────────────────────────────────────────────
@app.route("/api/predict", methods=["POST"])
def predict():
    """
    POST /api/predict
    Body: { "email": "<email text>" }
    Returns full analysis result.
    """
    if not load_model():
        return jsonify({
            "error": "Model not trained yet. Please run train_model.py first."
        }), 503

    data = request.get_json(silent=True) or {}

    # Support multipart file upload
    if "file" in request.files:
        f = request.files["file"]
        if not f.filename.endswith(".txt"):
            return jsonify({"error": "Only .txt files are supported."}), 400
        email_text = f.read().decode("utf-8", errors="ignore")
    else:
        email_text = data.get("email", "").strip()

    if not email_text:
        return jsonify({"error": "Email content is required."}), 400

    if len(email_text) < 3:
        return jsonify({"error": "Email is too short to analyse."}), 400

    # ── NLP pipeline ──────────────────────────
    cleaned = clean_text(email_text)
    X = _vectorizer.transform([cleaned])

    # Prediction + probability
    label_enc = _model.predict(X)[0]

    if hasattr(_model, "predict_proba"):
        proba = _model.predict_proba(X)[0]
        confidence = round(float(proba[label_enc]) * 100, 2)
    elif hasattr(_model, "decision_function"):
        decision = _model.decision_function(X)[0]
        # Sigmoid approximation
        import math
        sig = 1 / (1 + math.exp(-abs(decision)))
        confidence = round(sig * 100, 2)
    else:
        confidence = 100.0

    prediction = "Spam" if label_enc == 1 else "Ham"

    # ── Feature analysis ──────────────────────
    url_data = extract_urls(email_text)
    phish_data = detect_phishing(email_text)
    reasons = extract_spam_reasons(email_text, prediction, confidence)
    highlight_words = get_highlight_words(email_text, prediction)
    risk_info = compute_risk_score(prediction, confidence, url_data, phish_data)

    # ── Persist to DB ─────────────────────────
    db = get_db()
    db.execute(
        """INSERT INTO prediction_history
           (email_text, prediction, confidence, risk_score, reasons)
           VALUES (?, ?, ?, ?, ?)""",
        (
            email_text[:2000],      # cap stored text
            prediction,
            confidence,
            risk_info["score"],
            json.dumps(reasons),
        ),
    )
    db.commit()

    return jsonify({
        "prediction": prediction,
        "confidence": confidence,
        "riskScore": risk_info["score"],
        "riskStatus": risk_info["status"],
        "riskColor": risk_info["color"],
        "reasons": reasons,
        "highlightedWords": highlight_words,
        "urlAnalysis": {
            "count": url_data["count"],
            "suspicious": len(url_data["suspicious"]),
            "shortened": len(url_data["shortened"]),
            "hasSuspicious": url_data["has_suspicious"],
            "urls": url_data["urls"][:10],
        },
        "phishingDetected": phish_data["is_phishing"],
        "phishingPatterns": phish_data["patterns"],
        "preprocessedText": cleaned,
    })


# ──────────────────────────────────────────────
# API: History
# ──────────────────────────────────────────────
@app.route("/api/history", methods=["GET"])
def get_history():
    """GET /api/history?page=1&limit=20&filter=spam|ham&search=keyword"""
    db = get_db()
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))
    filter_by = request.args.get("filter", "").lower()
    search = request.args.get("search", "").strip()
    offset = (page - 1) * limit

    query = "SELECT * FROM prediction_history WHERE 1=1"
    params = []

    if filter_by in ("spam", "ham"):
        query += " AND LOWER(prediction) = ?"
        params.append(filter_by)

    if search:
        query += " AND email_text LIKE ?"
        params.append(f"%{search}%")

    count_row = db.execute(
        query.replace("SELECT *", "SELECT COUNT(*)"), params
    ).fetchone()
    total = count_row[0]

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params += [limit, offset]

    rows = db.execute(query, params).fetchall()
    records = []
    for row in rows:
        r = dict(row)
        try:
            r["reasons"] = json.loads(r["reasons"] or "[]")
        except Exception:
            r["reasons"] = []
        records.append(r)

    return jsonify({"total": total, "page": page, "limit": limit, "data": records})


@app.route("/api/history/<int:record_id>", methods=["DELETE"])
def delete_history(record_id):
    """DELETE /api/history/:id"""
    db = get_db()
    db.execute("DELETE FROM prediction_history WHERE id = ?", (record_id,))
    db.commit()
    return jsonify({"success": True, "deleted_id": record_id})


@app.route("/api/history/clear", methods=["DELETE"])
def clear_history():
    """DELETE /api/history/clear — wipe all records."""
    db = get_db()
    db.execute("DELETE FROM prediction_history")
    db.commit()
    return jsonify({"success": True, "message": "All history cleared."})


# ──────────────────────────────────────────────
# API: Stats
# ──────────────────────────────────────────────
@app.route("/api/stats", methods=["GET"])
def get_stats():
    """GET /api/stats — aggregate dashboard statistics."""
    db = get_db()

    totals = db.execute("""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN prediction='Spam' THEN 1 ELSE 0 END) AS spam,
          SUM(CASE WHEN prediction='Ham'  THEN 1 ELSE 0 END) AS ham,
          AVG(confidence) AS avg_confidence
        FROM prediction_history
    """).fetchone()

    # Daily counts (last 14 days)
    daily = db.execute("""
        SELECT DATE(timestamp) AS day,
               SUM(CASE WHEN prediction='Spam' THEN 1 ELSE 0 END) AS spam,
               SUM(CASE WHEN prediction='Ham'  THEN 1 ELSE 0 END) AS ham
        FROM prediction_history
        WHERE timestamp >= DATE('now', '-14 days')
        GROUP BY day
        ORDER BY day
    """).fetchall()

    # Confidence buckets
    conf_buckets = db.execute("""
        SELECT
          SUM(CASE WHEN confidence <  50 THEN 1 ELSE 0 END) AS "lt_50",
          SUM(CASE WHEN confidence >= 50 AND confidence < 70 THEN 1 ELSE 0 END) AS "50_70",
          SUM(CASE WHEN confidence >= 70 AND confidence < 90 THEN 1 ELSE 0 END) AS "70_90",
          SUM(CASE WHEN confidence >= 90 THEN 1 ELSE 0 END) AS "gt_90"
        FROM prediction_history
    """).fetchone()

    return jsonify({
        "total": totals["total"] or 0,
        "spam": totals["spam"] or 0,
        "ham": totals["ham"] or 0,
        "avgConfidence": round(totals["avg_confidence"] or 0, 1),
        "daily": [dict(r) for r in daily],
        "confidenceBuckets": {
            "lt50": conf_buckets["lt_50"] or 0,
            "50to70": conf_buckets["50_70"] or 0,
            "70to90": conf_buckets["70_90"] or 0,
            "gt90": conf_buckets["gt_90"] or 0,
        },
    })


# ──────────────────────────────────────────────
# API: Model Info
# ──────────────────────────────────────────────
@app.route("/api/model-info", methods=["GET"])
def model_info():
    """GET /api/model-info — training metrics and model details."""
    if not load_model():
        return jsonify({"error": "Model not trained yet."}), 503
    return jsonify(_metrics)


# ──────────────────────────────────────────────
# API: File upload helper
# ──────────────────────────────────────────────
@app.route("/api/upload", methods=["POST"])
def upload_file():
    """POST /api/upload — read uploaded .txt file content."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    f = request.files["file"]
    if not f.filename.endswith(".txt"):
        return jsonify({"error": "Only .txt files are accepted."}), 400
    content = f.read().decode("utf-8", errors="ignore")
    return jsonify({"content": content})


# ──────────────────────────────────────────────
# Startup
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import logging
    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)          # suppress request logs & reload banner

    ensure_nltk_data()
    init_db()

    if not load_model():
        print("\n[!] Model not found. Running train_model.py automatically...\n")
        import subprocess, sys
        subprocess.run([sys.executable, "train_model.py"], check=True)
        load_model()

    port = int(os.environ.get("PORT", 5000))
    print("\n================================================")
    print("  AI Email Spam Classifier")
    print(f"  URL: http://0.0.0.0:{port}")
    print("  Press CTRL+C to stop")
    print("================================================\n")
    try:
        app.run(debug=False, host="0.0.0.0", port=port)
    except KeyboardInterrupt:
        print("\n[*] Server stopped. Goodbye!")
        sys.exit(0)
