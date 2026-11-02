"""
nltk_setup.py
-------------
Downloads all required NLTK corpora to a predictable local directory.
Run this as part of the Render build command BEFORE starting Gunicorn.

Usage:
    python nltk_setup.py

This ensures NLTK data is available when Gunicorn workers start,
preventing the silent hang that occurs when downloads happen
inside worker subprocesses.
"""

import os
import nltk

# Store NLTK data inside the project directory so it is predictable
# on all platforms and does not depend on the user's home directory.
NLTK_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nltk_data")
os.makedirs(NLTK_DATA_DIR, exist_ok=True)

# Tell NLTK to look here first
if NLTK_DATA_DIR not in nltk.data.path:
    nltk.data.path.insert(0, NLTK_DATA_DIR)

REQUIRED = [
    ("tokenizers/punkt",     "punkt"),
    ("tokenizers/punkt_tab", "punkt_tab"),
    ("corpora/stopwords",    "stopwords"),
    ("corpora/wordnet",      "wordnet"),
    ("corpora/omw-1.4",      "omw-1.4"),
]

print(f"[nltk_setup] Downloading NLTK resources to: {NLTK_DATA_DIR}")
for path, name in REQUIRED:
    try:
        nltk.data.find(path)
        print(f"  [OK]  {name} already present")
    except LookupError:
        print(f"  [DL]  Downloading {name}...")
        nltk.download(name, download_dir=NLTK_DATA_DIR, quiet=False)
        print(f"  [OK]  {name} downloaded")

print("[nltk_setup] All NLTK resources ready.")
