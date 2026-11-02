"""
nltk_setup.py
-------------
Downloads all required NLTK corpora.
Run during Render build step BEFORE starting Gunicorn.

Uses ~/nltk_data (home directory) which is:
  1. Always writable on every platform
  2. NLTK's own default search path (no extra config needed)
  3. NOT blocked by Render's group-writable security check
     (the project dir /opt/render/project/src/ is blocked)
"""

import os
import nltk

# Home directory — NLTK's default, always writable on Render
NLTK_DATA_DIR = os.path.expanduser("~/nltk_data")
os.makedirs(NLTK_DATA_DIR, exist_ok=True)

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
