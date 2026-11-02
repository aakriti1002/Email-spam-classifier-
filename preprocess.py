"""
preprocess.py
-------------
NLP preprocessing utilities for the Email Spam Classifier.
Handles text cleaning, tokenization, stemming, URL/phishing analysis,
risk scoring, and XAI feature extraction.
"""

import re
import os
import nltk

# ~/nltk_data is NLTK's own default search path and always writable.
# Render blocks downloads to world/group-writable project dirs,
# so we MUST use the home directory.
_NLTK_HOME = os.path.expanduser("~/nltk_data")
if _NLTK_HOME not in nltk.data.path:
    nltk.data.path.insert(0, _NLTK_HOME)

# Also check for bundled nltk_data in the project directory
_LOCAL_NLTK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nltk_data")
if os.path.exists(_LOCAL_NLTK) and _LOCAL_NLTK not in nltk.data.path:
    nltk.data.path.append(_LOCAL_NLTK)

from nltk.corpus import stopwords
from nltk.stem import PorterStemmer, WordNetLemmatizer
from nltk.tokenize import word_tokenize

# ──────────────────────────────────────────────
# NLTK resource bootstrap (run once)
# ──────────────────────────────────────────────
def ensure_nltk_data():
    """Download required NLTK corpora to ~/nltk_data if missing."""
    _dl_dir = os.path.expanduser("~/nltk_data")
    os.makedirs(_dl_dir, exist_ok=True)
    resources = [
        ("tokenizers/punkt",     "punkt"),
        ("tokenizers/punkt_tab", "punkt_tab"),
        ("corpora/stopwords",    "stopwords"),
        ("corpora/wordnet",      "wordnet"),
        ("corpora/omw-1.4",      "omw-1.4"),
    ]
    for path, name in resources:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(name, download_dir=_dl_dir, quiet=True)

ensure_nltk_data()

# ──────────────────────────────────────────────
# Singleton tools
# ──────────────────────────────────────────────
_stemmer = PorterStemmer()
_lemmatizer = WordNetLemmatizer()
_stop_words = set(stopwords.words("english"))

# ──────────────────────────────────────────────
# Keyword libraries
# ──────────────────────────────────────────────
SPAM_KEYWORDS = {
    "financial": [
        "free", "win", "winner", "won", "prize", "cash", "money", "dollar",
        "reward", "bonus", "credit", "loan", "million", "billion", "profit",
        "income", "earn", "rich", "wealth", "lottery", "jackpot", "claim",
        "collect", "cheque", "check", "investment", "refund", "discount",
        "offer", "deal", "savings", "bank", "account",
    ],
    "urgency": [
        "urgent", "immediately", "now", "today", "limited", "expires",
        "deadline", "hurry", "asap", "instant", "quick", "fast", "rush",
        "act now", "dont wait", "last chance", "final", "expire", "ending",
    ],
    "promotional": [
        "congratulations", "selected", "exclusive", "special", "guaranteed",
        "approved", "confirm", "subscribe", "unsubscribe", "opt", "click",
        "visit", "buy", "order", "purchase", "shop", "sale", "promo",
        "coupon", "voucher", "redeem", "activate",
    ],
    "suspicious": [
        "password", "username", "login", "verify", "validation", "suspend",
        "suspended", "blocked", "alert", "security", "unauthorized",
        "breach", "hack", "scam", "phish", "malware", "virus",
    ],
}

PHISHING_PATTERNS = [
    r"verify\s+(your\s+)?account",
    r"click\s+(here|immediately|now|below|link)",
    r"urgent\s+action\s+(required|needed)",
    r"account\s+(suspended|blocked|limited|disabled)",
    r"free\s+(reward|gift|prize|money|cash)",
    r"lottery\s+(win|winner|prize|ticket)",
    r"confirm\s+(your\s+)?(identity|details|information|account)",
    r"update\s+(your\s+)?(payment|billing|card|bank)",
    r"you\s+have\s+been\s+selected",
    r"congratulations.{0,30}(won|winner|prize)",
    r"(limited|exclusive)\s+offer",
    r"act\s+now",
    r"100\s*%\s*(free|guaranteed)",
    r"(earn|make)\s+\$?\d+",
    r"(no\s+risk|risk\s*free)",
]

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "ow.ly", "t.co", "buff.ly",
    "adf.ly", "bc.vc", "is.gd", "cli.gs", "q.gs", "prettylinkpro.com",
    "shorte.st", "sh.st", "linkbucks.com",
}

SUSPICIOUS_TLD = {".xyz", ".tk", ".ml", ".ga", ".cf", ".gq", ".ru", ".cn", ".pw"}


# ──────────────────────────────────────────────
# Core text cleaning
# ──────────────────────────────────────────────
def clean_text(text: str) -> str:
    """
    Full NLP preprocessing pipeline:
    1. Lowercase
    2. Remove URLs
    3. Remove punctuation & special characters
    4. Remove digits
    5. Tokenize
    6. Remove stopwords
    7. Lemmatize
    """
    text = text.lower()
    text = re.sub(r"http\S+|www\.\S+", " url ", text)   # replace URLs with token
    text = re.sub(r"[^a-z\s]", " ", text)               # remove non-alpha
    text = re.sub(r"\s+", " ", text).strip()             # normalise whitespace
    tokens = word_tokenize(text)
    tokens = [t for t in tokens if t not in _stop_words and len(t) > 1]
    tokens = [_lemmatizer.lemmatize(t) for t in tokens]
    return " ".join(tokens)


def stem_text(text: str) -> str:
    """Stemming variant (used internally for comparison)."""
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    tokens = word_tokenize(text)
    tokens = [_stemmer.stem(t) for t in tokens if t not in _stop_words and len(t) > 1]
    return " ".join(tokens)


# ──────────────────────────────────────────────
# URL extraction & analysis
# ──────────────────────────────────────────────
def extract_urls(text: str) -> dict:
    """Extract and analyse URLs from raw email text."""
    url_pattern = re.compile(
        r"(https?://[^\s<>\"]+|www\.[^\s<>\"]+)", re.IGNORECASE
    )
    urls = url_pattern.findall(text)

    suspicious_urls = []
    shortened_urls = []
    safe_urls = []

    for url in urls:
        url_lower = url.lower()
        domain = re.sub(r"https?://", "", url_lower).split("/")[0]
        is_shortened = any(s in domain for s in URL_SHORTENERS)
        has_suspicious_tld = any(domain.endswith(tld) for tld in SUSPICIOUS_TLD)
        has_ip = bool(re.search(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", domain))
        has_at = "@" in url
        is_long = len(url) > 100

        if is_shortened:
            shortened_urls.append(url)
            suspicious_urls.append(url)
        elif has_suspicious_tld or has_ip or has_at or is_long:
            suspicious_urls.append(url)
        else:
            safe_urls.append(url)

    return {
        "count": len(urls),
        "urls": urls,
        "safe": safe_urls,
        "suspicious": suspicious_urls,
        "shortened": shortened_urls,
        "has_suspicious": len(suspicious_urls) > 0,
    }


# ──────────────────────────────────────────────
# Phishing pattern detection
# ──────────────────────────────────────────────
def detect_phishing(text: str) -> dict:
    """Scan raw email text for known phishing patterns."""
    text_lower = text.lower()
    detected_patterns = []

    pattern_labels = {
        r"verify\s+(your\s+)?account": "Verify account request",
        r"click\s+(here|immediately|now|below|link)": "Click bait link",
        r"urgent\s+action\s+(required|needed)": "Urgent action demand",
        r"account\s+(suspended|blocked|limited|disabled)": "Account suspension threat",
        r"free\s+(reward|gift|prize|money|cash)": "Free reward offer",
        r"lottery\s+(win|winner|prize|ticket)": "Lottery claim",
        r"confirm\s+(your\s+)?(identity|details|information|account)": "Identity confirmation request",
        r"update\s+(your\s+)?(payment|billing|card|bank)": "Payment update request",
        r"you\s+have\s+been\s+selected": "Selected notification",
        r"congratulations.{0,30}(won|winner|prize)": "Prize congratulations",
        r"(limited|exclusive)\s+offer": "Limited/exclusive offer",
        r"act\s+now": "Urgency trigger",
        r"100\s*%\s*(free|guaranteed)": "100% free/guaranteed claim",
        r"(earn|make)\s+\$?\d+": "Earnings promise",
        r"(no\s+risk|risk\s*free)": "Risk-free claim",
    }

    for pattern, label in pattern_labels.items():
        if re.search(pattern, text_lower):
            detected_patterns.append(label)

    return {
        "is_phishing": len(detected_patterns) > 0,
        "patterns": detected_patterns,
        "count": len(detected_patterns),
    }


# ──────────────────────────────────────────────
# Spam keyword matching & reasons
# ──────────────────────────────────────────────
def extract_spam_reasons(text: str, prediction: str, confidence: float) -> list:
    """
    Generate human-readable reasons explaining a spam/ham prediction.
    Returns a list of reason strings.
    """
    reasons = []
    text_lower = text.lower()
    words = set(re.findall(r"\b[a-z]+\b", text_lower))

    # Check keyword categories
    category_hits = {}
    for category, keywords in SPAM_KEYWORDS.items():
        hits = [kw for kw in keywords if kw in text_lower]
        if hits:
            category_hits[category] = hits

    if "financial" in category_hits:
        reasons.append(f"Financial reward keywords detected: {', '.join(category_hits['financial'][:4])}")
    if "urgency" in category_hits:
        reasons.append(f"Urgency-related language found: {', '.join(category_hits['urgency'][:3])}")
    if "promotional" in category_hits:
        reasons.append(f"Promotional/marketing language present: {', '.join(category_hits['promotional'][:3])}")
    if "suspicious" in category_hits:
        reasons.append(f"Suspicious security-related terms: {', '.join(category_hits['suspicious'][:3])}")

    # URL signals
    url_data = extract_urls(text)
    if url_data["count"] > 3:
        reasons.append(f"Excessive number of links found ({url_data['count']} URLs)")
    if url_data["shortened"]:
        reasons.append("URL shorteners detected (common in spam/phishing)")
    if url_data["has_suspicious"]:
        reasons.append("Suspicious or unusual domain URLs detected")

    # Phishing patterns
    phish = detect_phishing(text)
    if phish["is_phishing"]:
        reasons.append(f"Phishing pattern match: {phish['patterns'][0]}")

    # Confidence signal
    if prediction == "Spam" and confidence > 90:
        reasons.append("High TF-IDF weight for spam-associated terms")

    # Obfuscation detection
    obfuscated = re.findall(r"[a-z][€£$@!0-9]+[a-z]", text_lower)
    if obfuscated:
        reasons.append("Obfuscated text patterns detected (e.g., Fr€€, M0n€y)")

    # Ham reasons
    if prediction == "Ham":
        if not category_hits:
            reasons.append("No suspicious or promotional keywords found")
        reasons.append("Natural conversational language pattern detected")
        if confidence > 85:
            reasons.append("Low TF-IDF weight for spam-associated terms")

    return reasons if reasons else ["Pattern analysis indicates this email category"]


# ──────────────────────────────────────────────
# Word highlighting
# ──────────────────────────────────────────────
def get_highlight_words(text: str, prediction: str) -> list:
    """Return list of words to highlight in the UI based on spam keywords."""
    if prediction == "Ham":
        return []

    text_lower = text.lower()
    highlight = set()
    all_keywords = [kw for kws in SPAM_KEYWORDS.values() for kw in kws]

    for kw in all_keywords:
        if kw in text_lower:
            highlight.add(kw)

    # Also highlight obfuscated-looking tokens
    tokens = re.findall(r"\b\S{3,}\b", text)
    for tok in tokens:
        if re.search(r"[€£$@!]", tok):
            highlight.add(tok.lower())

    return list(highlight)


# ──────────────────────────────────────────────
# Risk score calculation
# ──────────────────────────────────────────────
def compute_risk_score(prediction: str, confidence: float, url_data: dict, phish_data: dict) -> dict:
    """
    Calculate a 0–100 risk score and status label.
    Combines: model confidence, URL analysis, phishing patterns.
    """
    if prediction == "Ham":
        base = (1 - confidence / 100) * 30   # ham with high confidence → near 0
    else:
        base = confidence * 0.7              # spam confidence drives score

    # URL penalties
    url_score = 0
    url_score += min(url_data["count"] * 3, 15)
    url_score += len(url_data["shortened"]) * 5
    url_score += len(url_data["suspicious"]) * 5

    # Phishing penalty
    phish_score = min(phish_data["count"] * 5, 20)

    raw_score = base + url_score + phish_score
    risk_score = max(0, min(100, round(raw_score)))

    if risk_score <= 30:
        status = "Safe"
        color = "success"
    elif risk_score <= 70:
        status = "Suspicious"
        color = "warning"
    else:
        status = "High Risk"
        color = "danger"

    return {"score": risk_score, "status": status, "color": color}
