# AI Email Spam Classification System

> A full-stack web application that classifies email text as **Spam** or **Ham (Legitimate)** using Machine Learning and Natural Language Processing, with an interactive browser-based dashboard.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-46E3B7?logo=render)](https://email-spam-classifier-he7t.onrender.com)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0%2B-lightgrey)](https://flask.palletsprojects.com/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.6.1-orange)](https://scikit-learn.org/)

🌐 **Live App:** https://email-spam-classifier-he7t.onrender.com

> **Note:** Hosted on Render free tier — may take 30–60 seconds to wake up after inactivity.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [System Requirements](#system-requirements)
- [Installation and Setup](#installation-and-setup)
- [How to Run the Project](#how-to-run-the-project)
- [Example Usage](#example-usage)
- [REST API Reference](#rest-api-reference)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Contributing](#contributing)

---

## Overview

This system accepts raw email text through a web dashboard and classifies it as **Spam** or **Ham** using a trained Machine Learning model. The backend is a Python Flask REST API. The frontend is a responsive HTML/CSS/JavaScript single-page dashboard served by Flask.

The ML pipeline consists of:

1. NLP text preprocessing (lowercase → URL removal → tokenisation → stopword removal → lemmatisation)
2. TF-IDF feature vectorisation (5,000 features, unigrams + bigrams)
3. Classification using the best-performing model selected from four candidates trained on the SMS Spam Collection dataset (5,572 emails)

The deployed model is a **Linear Support Vector Machine** (Accuracy: **98.3%**, F1: **93.33%** on the test set).

---

## Features

All features listed below are implemented and verified in the source code.

| Feature | Description |
|---|---|
| **Spam / Ham Classification** | Classifies pasted or uploaded email text in real time |
| **Image-Based Spam Detection** | Analyses screenshots of emails (JPG, PNG, WEBP) using Tesseract OCR and LinearSVC ML |
| **Interactive OCR Workspace** | Inspects OCR character clarity, allows inline text editing, and re-analyses edited text |
| **Confidence Score** | Returns a percentage confidence for each prediction |
| **Risk Score (0–100)** | Composite security score combining ML confidence, URL analysis, and phishing patterns |
| **Phishing Detection** | 15 regex-based phishing pattern checks (click bait, account suspension, prize claims, etc.) |
| **URL Analysis** | Detects suspicious domains, shortened URLs, and excessive link counts |
| **Explainable AI (XAI)** | Human-readable reasons explaining why an email was classified as spam or ham |
| **Keyword Highlighting** | Spam keywords highlighted in red in the email preview |
| **Prediction History** | All predictions stored in a local SQLite database with search, filter, and pagination |
| **Analytics Dashboard** | Chart.js visualisations: spam vs ham bar chart, distribution pie, daily trend, confidence buckets |
| **Model Info Page** | Shows training metrics, model comparison table, and top spam-indicative features |
| **File Upload** | Drag-and-drop or click-to-browse `.txt` file upload |
| **Copy Result / Export PDF** | One-click clipboard copy and browser print/PDF export |
| **Dark Mode** | Toggle dark/light theme, persisted to `localStorage` |
| **Quick Test Samples** | Three built-in sample emails (spam, ham, phishing) for instant demo |
| **One-Click Launcher** | `run.bat` script automates venv creation, dependency install, and app launch on Windows |

---

## Technology Stack

### Backend
| Component | Technology |
|---|---|
| Web framework | Flask 3.0+ |
| CORS handling | flask-cors 4.0+ |
| ML library | scikit-learn 1.5+ |
| NLP preprocessing | NLTK 3.8+ (punkt, wordnet, stopwords, omw-1.4) |
| Model serialisation | joblib 1.4+ |
| Data processing | pandas 2.2+, numpy 1.26+ |
| OCR Engine | Tesseract OCR 5.x (`pytesseract 0.3.13`) |
| Computer Vision & Preprocessing | OpenCV (`opencv-python-headless`), Pillow (`PIL 10+`) |
| Database | SQLite (via Python `sqlite3`, built-in) |
| HTTP server | Werkzeug 3.0+ (Flask's built-in dev server) |

### Frontend
| Component | Technology |
|---|---|
| Markup | HTML5 (Jinja2 templates) |
| Styling | Vanilla CSS (custom design system) |
| JavaScript | Vanilla JS (ES2020+) |
| Charts | Chart.js 4.4 (CDN) |
| UI components | Bootstrap 5.3 (CDN) + Bootstrap Icons 1.11 (CDN) |

### ML Pipeline
| Stage | Detail |
|---|---|
| Dataset | SMS Spam Collection — UCI ML Repository (5,572 emails) |
| Vectoriser | TF-IDF (5,000 features, ngram range 1–2, sublinear TF) |
| Models trained | Multinomial Naive Bayes, Logistic Regression, Linear SVC, Random Forest |
| Deployed model | **Linear SVC** (best F1 score on test set) |
| Phishing detection | 15 hand-crafted regex patterns |

---

## Project Structure

```
email-spam-classifier/
│
├── app.py                      # Flask app entry point — REST API routes + server startup
├── preprocess.py               # NLP pipeline: cleaning, URL/phishing analysis, risk scoring, XAI
├── train_model.py              # Model training script — trains 4 models, saves best
├── requirements.txt            # Python package dependencies
├── run.bat                     # Windows one-click launcher (venv + install + run)
│
├── model/
│   ├── spam_model.pkl          # Trained Linear SVC model (serialised with joblib)
│   ├── tfidf_vectorizer.pkl    # Fitted TF-IDF vectoriser (serialised with joblib)
│   └── model_metrics.json      # Training metrics and model comparison results
│
├── dataset/
│   ├── emails.csv              # SMS Spam Collection dataset (processed CSV, 5,572 rows)
│   ├── SMSSpamCollection       # Raw UCI dataset file (tab-separated)
│   └── readme                  # UCI dataset readme
│
├── templates/
│   ├── index.html              # Landing page
│   └── dashboard.html          # Main analysis dashboard (SPA-style)
│
├── static/
│   ├── css/
│   │   └── style.css           # Full custom stylesheet
│   ├── js/
│   │   ├── dashboard.js        # Dashboard logic: analysis, history, charts, dark mode
│   │   └── main.js             # Landing page JavaScript
│   ├── img/
│   │   └── logo.png            # Application logo
│   ├── favicon.ico
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   └── apple-touch-icon.png
│
├── database.db                 # SQLite database — auto-created on first run
└── public/                     # Public static assets folder
```

> **Note:** `venv/`, `__pycache__/`, and `database.db` are excluded from the repository via `.gitignore`. The `database.db` file is created automatically when the application starts.

---

## System Requirements

| Requirement | Minimum |
|---|---|
| Operating System | Windows 10/11, macOS 12+, Ubuntu 20.04+ |
| Python | 3.10 or later |
| pip | Bundled with Python 3.10+ |
| RAM | 512 MB free (model loading is lightweight) |
| Disk space | ~50 MB (code + dependencies) |
| Internet access | Required on first run for NLTK data downloads (punkt, wordnet, stopwords) |
| Browser | Any modern browser (Chrome, Firefox, Edge, Safari) |

No Node.js, Docker, or external database server is required.

---

## Installation and Setup

### Step 1 — Install Python

Download and install Python **3.10 or later** from [python.org](https://www.python.org/downloads/).

During installation on Windows, check **"Add Python to PATH"**.

Verify your installation:

```bash
python --version
# Expected: Python 3.10.x or later
```

### Step 2 — Clone the repository

```bash
git clone https://github.com/Adityagupta-mits/Email-spam-classifier-
cd Email-spam-classifier-
```

> **Note:** Replace the URL above with your actual GitHub repository URL if it differs.

### Step 3 — Create a virtual environment

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` at the start of your terminal prompt.

### Step 4 — Install dependencies

```bash
pip install -r requirements.txt
```

This installs: Flask, flask-cors, scikit-learn, pandas, numpy, nltk, joblib, Werkzeug, requests.

> NLTK corpora (`punkt`, `wordnet`, `stopwords`, `omw-1.4`) are downloaded automatically on first run if not already present. An internet connection is required for this step.

### Step 5 — Train the model (if model files are not included)

If the `model/` directory does not contain `spam_model.pkl` and `tfidf_vectorizer.pkl`, run the training script:

```bash
python train_model.py
```

This will:
1. Load (or download) the SMS Spam Collection dataset into `dataset/emails.csv`
2. Preprocess all 5,572 emails using the NLP pipeline
3. Train and evaluate four ML models (Naive Bayes, Logistic Regression, Linear SVC, Random Forest)
4. Save the best-performing model and TF-IDF vectoriser to `model/`

> **Offline mode:** If the dataset download fails, a built-in 140-email fallback dataset is used automatically. The trained model will be less accurate but fully functional.

Expected output:
```
============================================================
  AI EMAIL SPAM CLASSIFIER - MODEL TRAINING
============================================================

[1/5] Loading dataset...
[2/5] Preprocessing text...
[3/5] Fitting TF-IDF vectorizer...
[4/5] Training all models...
[5/5] Saving model and vectorizer...
  Training complete!
```

---

## How to Run the Project

### Option A — Windows one-click launcher (recommended)

Double-click `run.bat` or run it from PowerShell:

```powershell
.\run.bat
```

This script automatically:
1. Creates the virtual environment if it does not exist
2. Installs all dependencies
3. Checks for the trained model and trains it if missing
4. Starts the Flask server

### Option B — Manual start

Activate your virtual environment first, then:

```bash
python app.py
```

### Expected terminal output

```
================================================
  AI Email Spam Classifier
  URL: http://127.0.0.1:5000
  Press CTRL+C to stop
================================================

 * Serving Flask app 'app'
 * Debug mode: off
```

### Accessing the application

Open your browser and navigate to:

| Page | URL |
|---|---|
| Landing page | http://127.0.0.1:5000 |
| Analysis dashboard | http://127.0.0.1:5000/dashboard |

### Using the dashboard

1. Navigate to **http://127.0.0.1:5000/dashboard**
2. Paste email text into the input area on the left, or upload a `.txt` file
3. Click **Analyse Email** (or press `Ctrl + Enter`)
4. The result panel on the right displays:
   - Spam / Ham classification label
   - Confidence percentage
   - Risk score (0–100) with animated ring indicator
   - Phishing patterns detected (if any)
   - URL analysis
   - Explainability reasons
   - Email content with spam keywords highlighted in red
5. Use the sidebar to switch between **Analyse Email**, **Prediction History**, **Analytics**, **Model Information**, and **About Algorithm**

### Stopping the server

Press `Ctrl + C` in the terminal.

---

## Example Usage

> **Note:** These are illustrative examples. Actual predictions depend on the trained model.

### Spam example

**Input:**
```
Congratulations! You have won a prize. Click here immediately to claim your reward.
Free gift card worth $200. Act now before the offer expires!
```

**Expected result:**

| Field | Value |
|---|---|
| Prediction | **SPAM** |
| Confidence | ~95–98% |
| Risk Score | 70–95 / 100 (High Risk) |
| Phishing patterns | Click bait link, Prize congratulations, Limited/exclusive offer |

---

### Ham (legitimate) example

**Input:**
```
Hi, can we schedule a meeting tomorrow at 3pm to discuss the project timeline?
Please let me know your availability.
```

**Expected result:**

| Field | Value |
|---|---|
| Prediction | **HAM** |
| Confidence | ~90–97% |
| Risk Score | 0–15 / 100 (Safe) |
| Phishing patterns | None |

---

## REST API Reference

The backend exposes the following JSON endpoints:

### `POST /api/predict`
Classify an email.

**Request body:**
```json
{ "email": "Your email text here" }
```

**Response:**
```json
{
  "prediction": "Spam",
  "confidence": 97.2,
  "riskScore": 88,
  "riskStatus": "High Risk",
  "reasons": ["Financial reward keywords detected: prize, claim"],
  "highlightedWords": ["prize", "claim", "free"],
  "urlAnalysis": { "count": 0, "suspicious": 0, "shortened": 0 },
  "phishingDetected": true,
  "phishingPatterns": ["Click bait link"]
}
```

### `GET /api/history`
Retrieve prediction history. Supports `page`, `limit`, `filter` (spam|ham), and `search` query parameters.

### `DELETE /api/history/<id>`
Delete a specific history record.

### `DELETE /api/history/clear`
Clear all history records.

### `GET /api/stats`
Aggregate statistics for the analytics dashboard.

### `GET /api/model-info`
Training metrics, model comparison, and top spam features.

### `POST /api/upload`
Upload a `.txt` file; returns its text content.

### `POST /api/analyze-image`
Upload an email screenshot (JPG, PNG, WEBP $\le 5$ MB). Preprocesses with OpenCV, extracts text via Tesseract OCR, extracts email headers, and classifies using the LinearSVC model.

**Request:** `multipart/form-data` with `image` file field.

**Response:**
```json
{
  "prediction": "Spam",
  "confidence": 74.35,
  "riskScore": 68,
  "riskStatus": "High Risk",
  "ocrText": "Congratulations! You won $1,000,000...",
  "ocrConfidence": 89.2,
  "ocrConfidenceAvailable": true,
  "emailFields": { "sender": "lottery@promo.com", "subject": "Claim Prize" },
  "wordCount": 42,
  "analysisType": "image",
  "reasons": ["Financial reward keywords detected: prize, won"],
  "highlightedWords": ["prize", "won"],
  "phishingDetected": true,
  "urlAnalysis": { "count": 1, "suspicious": 0, "shortened": 1 }
}
```

### `POST /api/analyze-extracted-text`
Re-analyse corrected or edited OCR text through the ML classification pipeline.

**Request body:**
```json
{ "text": "Corrected email text...", "source": "edited" }
```

### `GET /api/ocr-status`
Inspect OCR readiness, binary availability, and Tesseract engine version.


---

## Troubleshooting

### `python` is not recognised
Ensure Python is installed and added to PATH. On macOS/Linux use `python3` instead of `python`.

### `pip install` fails or packages cannot be installed
- Ensure your virtual environment is activated (`(venv)` appears in the prompt)
- Try upgrading pip: `python -m pip install --upgrade pip`
- If on a restricted network, install packages individually

### `Model not found` error on startup
The model files are missing. Run the training script:
```bash
python train_model.py
```
If the model is included in the repository, ensure the `model/` directory is present and contains `spam_model.pkl` and `tfidf_vectorizer.pkl`.

### NLTK `LookupError` or resource not found
The application automatically downloads required NLTK corpora on startup. If the download fails (e.g., no internet access), the error will appear. Connect to the internet and restart.

### Port 5000 already in use
Another process is using port 5000. Either stop that process, or change the port in `app.py`:
```python
app.run(debug=False, host="0.0.0.0", port=5001)
```
Then access the app at `http://127.0.0.1:5001`.

### Dataset download fails during training
The fallback 140-email dataset is used automatically. Training will complete, but model accuracy will be lower than reported above. For best results, place the SMS Spam Collection `emails.csv` manually in the `dataset/` folder.

### `ModuleNotFoundError` for any package
Your virtual environment may not be activated. Run:
```powershell
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```
Then re-run `pip install -r requirements.txt`.

### `run.bat` fails with "Operation cancelled by user"
Do not press `Ctrl+C` while `run.bat` is installing dependencies. Re-run `.\run.bat` from scratch.

---

## Limitations

- **Training data scope:** The model is trained on the [SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection) dataset (5,572 short SMS messages). Performance on long-form emails, non-English text, or modern AI-generated spam may vary.
- **Language:** The model supports English only. Non-English emails may produce unpredictable results.
- **False positives/negatives:** No spam classifier is perfect. Legitimate emails containing financial or urgency language may be misclassified as spam, and novel spam not represented in the training data may be missed.
- **Static model:** The model is not retrained automatically. It does not learn from new predictions made through the dashboard.
- **Development server:** The application uses Flask's built-in Werkzeug development server. It is not suitable for production deployment. Use a WSGI server such as Gunicorn for production.
- **Local storage:** All prediction history is stored in a local SQLite file (`database.db`). There is no user authentication, multi-user support, or remote database.
- **No email fetching:** The system does not connect to email servers (IMAP/SMTP). It only analyses text that is pasted or uploaded manually.

---

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a Pull Request against the `main` branch

To report a bug or suggest an improvement, open an [Issue](https://github.com/Adityagupta-mits/Email-spam-classifier-/issues) on GitHub and describe the problem or request clearly.

---

---

*Built with Python, Flask, scikit-learn, and NLTK.*
