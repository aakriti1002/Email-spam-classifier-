/**
 * image_analysis.js
 * -----------------
 * Handles the Image-Based Email Spam Analysis feature:
 *  - Image drag-and-drop upload zone
 *  - Image preview with remove button
 *  - POST /api/analyze-image
 *  - Left column: OCR-extracted text editor + metadata
 *  - Right column: Compact, organized ML prediction and security result panel
 *  - POST /api/analyze-extracted-text (re-analyse edited OCR)
 *
 * NOTE: Depends on dashboard.js being loaded first for helper utilities:
 *   escHtml(), highlightWords(), buildUrlSection(), showToast(), state.
 */

let _selectedImageFile = null;
let _originalOcrText = "";
let _lastImageAnalysisData = null;

/* ══════════════════════════════════════════════════════════════
   IMAGE SECTION INIT
══════════════════════════════════════════════════════════════ */
function initImageAnalysis() {
  initImgDropZone();
  bindImgAnalyzeBtn();
  bindImgClearBtn();
  checkOcrStatus();
}

/* ══════════════════════════════════════════════════════════════
   OCR AVAILABILITY CHECK
══════════════════════════════════════════════════════════════ */
async function checkOcrStatus() {
  const banner = document.getElementById("ocrStatusBanner");
  if (!banner) return;
  try {
    const res = await fetch("/api/ocr-status");
    const data = await res.json();
    if (data.ready) {
      banner.innerHTML = `
        <span class="ocr-status-badge ocr-success">
          <i class="bi bi-check-circle-fill"></i>
          OCR Engine Active ${data.tesseract_version ? "· v" + data.tesseract_version : ""}
        </span>`;
    } else {
      const missing = [];
      if (!data.pillow) missing.push("Pillow");
      if (!data.pytesseract) missing.push("pytesseract");
      if (!data.tesseract_engine) missing.push("Tesseract binary");
      banner.innerHTML = `
        <span class="ocr-status-badge ocr-warning">
          <i class="bi bi-exclamation-triangle-fill"></i>
          OCR Engine: ${missing.join(", ")} missing
        </span>`;
    }
  } catch {
    banner.innerHTML = `
      <span class="ocr-status-badge ocr-warning">
        <i class="bi bi-question-circle"></i>
        OCR Status: Standalone
      </span>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   IMAGE DROP ZONE & PREVIEW
══════════════════════════════════════════════════════════════ */
function initImgDropZone() {
  const zone      = document.getElementById("imgDropZone");
  const input     = document.getElementById("imgFileInput");
  const removeBtn = document.getElementById("imgRemoveBtn");

  if (!zone || !input) return;

  // Click to browse
  zone.addEventListener("click", (e) => {
    if (e.target === removeBtn || removeBtn?.contains(e.target)) return;
    input.click();
  });

  // Drag-and-drop
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) _loadImageFile(file);
  });

  // File input change
  input.addEventListener("change", () => {
    if (input.files[0]) _loadImageFile(input.files[0]);
  });

  // Remove image
  removeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    _clearImage();
  });
}

function _loadImageFile(file) {
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED.includes(file.type)) {
    showToast("Please upload a JPG, PNG, or WEBP image.", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("Image too large. Maximum size is 5 MB.", "error");
    return;
  }

  _selectedImageFile = file;

  const zone        = document.getElementById("imgDropZone");
  const preview     = document.getElementById("imgPreview");
  const previewW    = document.getElementById("imgPreviewWrap");
  const placeholder = document.getElementById("imgDropPlaceholder");

  const reader = new FileReader();
  reader.onload = (e) => {
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = "block";
    }
    previewW?.classList.remove("d-none");
    placeholder?.classList.add("d-none");
    zone?.classList.add("has-image");
  };
  reader.readAsDataURL(file);

  // Clear previous results when new image loaded
  _clearImageResults();
}

function _clearImage() {
  _selectedImageFile = null;
  _originalOcrText = "";
  _lastImageAnalysisData = null;

  const zone        = document.getElementById("imgDropZone");
  const preview     = document.getElementById("imgPreview");
  const previewW    = document.getElementById("imgPreviewWrap");
  const placeholder = document.getElementById("imgDropPlaceholder");
  const input       = document.getElementById("imgFileInput");

  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }
  previewW?.classList.add("d-none");
  placeholder?.classList.remove("d-none");
  zone?.classList.remove("has-image");
  if (input) input.value = "";

  _clearImageResults();
}

function _clearImageResults() {
  const ocrSection = document.getElementById("ocrResultSection");
  const mlSection  = document.getElementById("imgMlResultSection");
  const placeHolder = document.getElementById("imgResultPlaceholder");

  if (ocrSection) {
    ocrSection.innerHTML = "";
    ocrSection.classList.add("d-none");
  }
  if (mlSection) {
    mlSection.innerHTML = "";
    mlSection.classList.add("d-none");
  }
  if (placeHolder) {
    placeHolder.classList.remove("d-none");
  }
}

function bindImgClearBtn() {
  const btn = document.getElementById("imgClearBtn");
  if (btn) btn.addEventListener("click", _clearImage);
}

/* ══════════════════════════════════════════════════════════════
   ANALYSE IMAGE BUTTON
══════════════════════════════════════════════════════════════ */
function bindImgAnalyzeBtn() {
  const btn = document.getElementById("imgAnalyzeBtn");
  if (btn) btn.addEventListener("click", analyzeImage);
}

async function analyzeImage() {
  if (!_selectedImageFile) {
    showToast("Please select or drop an email screenshot first.", "warning");
    return;
  }

  showSpinner(true, "Processing Email Screenshot…", [
    "Validating image file & headers",
    "Applying grayscale & CLAHE noise reduction",
    "Extracting text via Tesseract OCR",
    "Running NLP text cleaning & TF-IDF",
    "LinearSVC model prediction & risk scoring",
  ]);

  const formData = new FormData();
  formData.append("image", _selectedImageFile);

  try {
    const res = await fetch("/api/analyze-image", {
      method: "POST",
      body: formData,
    });

    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(`Server error (${res.status}): ${text.substring(0, 120)}`);
    }

    if (!res.ok) {
      showToast(data.error || `Analysis failed (${res.status})`, "error");
      showSpinner(false);
      return;
    }

    renderImageResults(data);
    showToast("Email screenshot analysed successfully!", "success");

    // On small screens, scroll down to the results column smoothly
    if (window.innerWidth < 992) {
      document.getElementById("imgMlResultSection")?.scrollIntoView({ behavior: "smooth" });
    }
  } catch (err) {
    showToast(err.message || "Image analysis failed.", "error");
  } finally {
    showSpinner(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   RE-ANALYSE EDITED OCR TEXT
══════════════════════════════════════════════════════════════ */
async function reanalyzeEditedText() {
  const ta = document.getElementById("ocrEditableText");
  if (!ta) return;

  const text = ta.value.trim();
  if (!text) {
    showToast("Extracted text area is empty. Please enter text to analyse.", "warning");
    return;
  }

  showSpinner(true, "Re-analysing Edited Text…", [
    "Running NLP text preprocessing",
    "Extracting 5,000 TF-IDF features",
    "LinearSVC model classification",
    "Phishing pattern & risk score analysis",
  ]);

  try {
    const res = await fetch("/api/analyze-extracted-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "edited" }),
    });

    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      throw new Error(`Server error (${res.status})`);
    }

    if (!res.ok) {
      showToast(data.error || "Re-analysis failed.", "error");
      return;
    }

    // Update ML result in Right Column (keep user's edited text in Left Column)
    renderMlResultForImage(data, text);
    showToast("Classification updated from edited text!", "success");

    if (window.innerWidth < 992) {
      document.getElementById("imgMlResultSection")?.scrollIntoView({ behavior: "smooth" });
    }
  } catch (err) {
    showToast(err.message || "Re-analysis failed.", "error");
  } finally {
    showSpinner(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER ALL RESULTS
══════════════════════════════════════════════════════════════ */
function renderImageResults(data) {
  _originalOcrText = data.ocrText || "";
  _lastImageAnalysisData = data;

  // Hide placeholder in right column
  document.getElementById("imgResultPlaceholder")?.classList.add("d-none");

  // Render OCR Editor in Left Column
  _renderOcrSection(data);

  // Render ML Prediction in Right Column
  renderMlResultForImage(data, data.ocrText || "");
}

/* ── LEFT COLUMN: Render OCR Text Editor ────────────────────── */
function _renderOcrSection(data) {
  const section = document.getElementById("ocrResultSection");
  if (!section) return;

  // OCR confidence bar
  const conf = data.ocrConfidence;
  const confAvail = data.ocrConfidenceAvailable && conf !== null;
  const confColor = conf === null ? "var(--gray-400)"
    : conf >= 75 ? "var(--success)"
    : conf >= 50 ? "var(--warning)"
    : "var(--danger)";

  const confHtml = confAvail
    ? `<div class="ocr-confidence-row">
         <span style="font-weight:600;font-size:.76rem">OCR Quality:</span>
         <div class="ocr-conf-bar-wrap">
           <div class="ocr-conf-bar" style="width:${conf}%;background:${confColor}"></div>
         </div>
         <span style="color:${confColor};font-weight:700;font-size:.78rem">${conf}%</span>
       </div>`
    : "";

  // Detected email metadata tags
  const fields = data.emailFields || {};
  const metaPills = [];
  if (fields.sender) {
    metaPills.push(`<div class="email-meta-chip"><span class="meta-label">From:</span> <span class="meta-val">${escHtml(fields.sender)}</span></div>`);
  }
  if (fields.subject) {
    metaPills.push(`<div class="email-meta-chip"><span class="meta-label">Subject:</span> <span class="meta-val">${escHtml(fields.subject)}</span></div>`);
  }
  if (fields.recipient) {
    metaPills.push(`<div class="email-meta-chip"><span class="meta-label">To:</span> <span class="meta-val">${escHtml(fields.recipient)}</span></div>`);
  }

  const metadataHtml = metaPills.length
    ? `<div class="d-flex flex-column gap-1 mb-2">${metaPills.join("")}</div>`
    : "";

  const words = data.wordCount || (data.ocrText ? data.ocrText.trim().split(/\s+/).length : 0);
  const chars = data.charCount || (data.ocrText ? data.ocrText.length : 0);

  section.innerHTML = `
    <div class="card">
      <div class="card-header-bar">
        <span><i class="bi bi-pencil-square me-2 text-navy"></i>Extracted Text (OCR)</span>
        <span class="text-muted-sm" id="ocrCountsBadge">${words} words · ${chars} chars</span>
      </div>
      <div class="card-body-pad d-flex flex-column gap-2">

        ${confHtml}
        ${metadataHtml}

        <div class="d-flex justify-content-between align-items-center">
          <label for="ocrEditableText" class="fw-600" style="font-size:.8rem;color:var(--gray-700)">
            Editable Text Content:
          </label>
          <span class="text-muted-sm" style="font-size:.72rem">Edit to correct OCR typos</span>
        </div>

        <textarea id="ocrEditableText" class="ocr-textarea" rows="7"
          placeholder="Extracted email text will appear here…">${escHtml(data.ocrText || "")}</textarea>

        <!-- Action buttons row -->
        <div class="d-flex gap-2 mt-1">
          <button class="btn-primary-navy flex-grow-1 justify-content-center" id="reanalyzeBtn" style="font-size:.82rem;padding:.45rem .8rem">
            <i class="bi bi-arrow-repeat"></i>
            Re-analyse Edited Text
          </button>
          <button class="btn-outline-navy" id="resetOcrBtn" title="Reset to original OCR extraction" style="font-size:.82rem;padding:.45rem .75rem">
            <i class="bi bi-arrow-counterclockwise"></i>
            Reset
          </button>
        </div>

        <div class="confidence-note-box mt-1">
          <i class="bi bi-shield-check text-navy me-1"></i>
          <strong>Separate Metrics:</strong> OCR Confidence measures character recognition clarity. ML Confidence measures LinearSVC spam certainty.
        </div>

      </div>
    </div>`;

  section.classList.remove("d-none");

  // Bind actions
  document.getElementById("reanalyzeBtn")?.addEventListener("click", reanalyzeEditedText);
  document.getElementById("resetOcrBtn")?.addEventListener("click", () => {
    const ta = document.getElementById("ocrEditableText");
    if (ta) {
      ta.value = _originalOcrText;
      showToast("Reset to original OCR text.", "info");
    }
  });

  // Dynamic character/word counter on input
  document.getElementById("ocrEditableText")?.addEventListener("input", (e) => {
    const val = e.target.value;
    const w = val.trim() ? val.trim().split(/\s+/).length : 0;
    const c = val.length;
    const badge = document.getElementById("ocrCountsBadge");
    if (badge) badge.textContent = `${w} words · ${c} chars`;
  });
}

/* ── RIGHT COLUMN: Render ML Prediction & Risk Results ─────── */
function renderMlResultForImage(data, rawText) {
  _lastImageAnalysisData = data;
  const section = document.getElementById("imgMlResultSection");
  if (!section) return;

  const isSpam     = data.prediction === "Spam";
  const colorClass = isSpam ? "spam" : "ham";
  const icon       = isSpam ? "bi-shield-x" : "bi-shield-check";
  const riskClass  = data.riskColor || (isSpam ? "danger" : "success");
  const circumference = 2 * Math.PI * 44; // radius 44
  const offset = circumference - ((data.riskScore || 0) / 100) * circumference;

  const highlightedBody = highlightWords(rawText, data.highlightedWords || []);
  const urlSection = buildUrlSection(data.urlAnalysis);

  const phishSection = data.phishingDetected
    ? `<div class="phish-alert mb-3">
        <i class="bi bi-exclamation-triangle-fill flex-shrink-0 fs-5"></i>
        <div>
          <strong style="font-size:.84rem">Phishing Indicators Detected</strong>
          <div class="mt-1" style="font-size:.78rem;line-height:1.6">
            ${(data.phishingPatterns || []).map((p) => `<div>• ${escHtml(p)}</div>`).join("")}
          </div>
        </div>
      </div>`
    : "";

  const reasonsHtml = (data.reasons || []).map((r) => `
    <div class="reason-item ${isSpam ? "" : "ham"}">
      <i class="bi ${isSpam ? "bi-x-circle-fill text-danger" : "bi-check-circle-fill text-success"}"></i>
      <span>${escHtml(r)}</span>
    </div>`).join("");

  const sourceBadge = data.analysisType === "image_edited"
    ? `<span class="badge bg-light text-navy border" style="font-weight:500;font-size:.72rem"><i class="bi bi-pencil me-1"></i>From Edited OCR Text</span>`
    : `<span class="badge bg-light text-navy border" style="font-weight:500;font-size:.72rem"><i class="bi bi-image me-1"></i>From OCR Extraction</span>`;

  section.innerHTML = `
    <div class="result-card">
      <!-- 1. Header Banner -->
      <div class="result-header ${colorClass} d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-3">
          <i class="bi ${icon} fs-2 ${isSpam ? "text-danger" : "text-success"}"></i>
          <div>
            <div class="result-label ${colorClass}">${data.prediction.toUpperCase()}</div>
            <div class="text-muted-sm" style="font-size:.78rem">
              ${isSpam ? "Unsolicited or malicious spam detected" : "Legitimate email content verified"}
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${sourceBadge}
          <div class="confidence-pill" style="font-size:.82rem">${data.confidence}% ML Confidence</div>
        </div>
      </div>

      <!-- 2. Body Grid -->
      <div class="p-3">
        <!-- Top Metrics Row with Risk Ring Gauge -->
        <div class="row g-3 align-items-center mb-3">
          <!-- Risk score gauge -->
          <div class="col-auto">
            <div class="risk-ring-wrap">
              <div class="risk-ring">
                <svg width="100" height="100" viewBox="0 0 110 110">
                  <circle class="risk-ring-bg" cx="55" cy="55" r="44"/>
                  <circle class="risk-ring-fill ${riskClass}"
                    cx="55" cy="55" r="44"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${circumference}"
                    id="imgRiskRingFill"/>
                </svg>
                <div class="risk-ring-text">
                  <span id="imgRiskScoreNum" style="font-size:1.35rem">0</span>
                  <small style="font-size:.65rem">/100</small>
                </div>
              </div>
              <span class="risk-status-label ${riskClass} mt-1">${data.riskStatus || (isSpam ? "High Risk" : "Safe")}</span>
            </div>
          </div>

          <!-- Key metric cards -->
          <div class="col">
            <div class="row g-2">
              <div class="col-6 col-sm-3">
                <div class="p-2 rounded bg-light border text-center">
                  <div class="text-muted-sm" style="font-size:.7rem">Classification</div>
                  <div class="fw-700 ${isSpam ? "text-danger" : "text-success"}" style="font-size:.9rem">${data.prediction}</div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="p-2 rounded bg-light border text-center">
                  <div class="text-muted-sm" style="font-size:.7rem">ML Confidence</div>
                  <div class="fw-700 text-navy" style="font-size:.9rem">${data.confidence}%</div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="p-2 rounded bg-light border text-center">
                  <div class="text-muted-sm" style="font-size:.7rem">Risk Index</div>
                  <div class="fw-700" style="font-size:.9rem">${data.riskScore}/100</div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="p-2 rounded bg-light border text-center">
                  <div class="text-muted-sm" style="font-size:.7rem">URLs Found</div>
                  <div class="fw-700" style="font-size:.9rem">${data.urlAnalysis?.count ?? 0}</div>
                </div>
              </div>
            </div>

            <!-- LinearSVC confidence note -->
            <div class="text-muted-sm mt-2" style="font-size:.72rem;line-height:1.5">
              <i class="bi bi-info-circle me-1"></i>Confidence is estimated from the LinearSVC hyperplane distance via sigmoid transform.
            </div>
          </div>
        </div>

        <!-- Phishing Alert Section (conditional) -->
        ${phishSection}

        <!-- Explainability (XAI) Reasons -->
        <div class="mb-3">
          <div class="fw-600 mb-2 d-flex align-items-center gap-1" style="font-size:.84rem;color:var(--navy-dark)">
            <i class="bi bi-lightbulb text-navy"></i>
            <span>Explainable AI — Classification Factors</span>
          </div>
          <div class="d-flex flex-column gap-1">
            ${reasonsHtml}
          </div>
        </div>

        <!-- URL Analysis (if URLs detected) -->
        ${urlSection ? `<div class="mb-3">${urlSection}</div>` : ""}

        <!-- Highlighted Extracted Content Display -->
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-600" style="font-size:.84rem;color:var(--navy-dark)">
              <i class="bi bi-file-text me-1 text-navy"></i>Analysed Text Content
            </span>
            <span class="text-muted-sm" style="font-size:.72rem">Suspicious terms highlighted</span>
          </div>
          <div class="email-body-display p-2 rounded border"
               style="background:var(--gray-50);font-size:.8rem;line-height:1.7;max-height:160px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">
            ${highlightedBody || escHtml(rawText)}
          </div>
        </div>

        <!-- Action Toolbar -->
        <div class="d-flex justify-content-end gap-2 pt-2 border-top">
          <button class="btn btn-sm btn-outline-secondary" onclick="copyImageAnalysisResult()">
            <i class="bi bi-clipboard me-1"></i>Copy Result
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="printImageAnalysisResult()">
            <i class="bi bi-printer me-1"></i>Print Report
          </button>
        </div>

      </div>
    </div>`;

  section.classList.remove("d-none");

  // Animate risk ring and counter
  requestAnimationFrame(() => {
    setTimeout(() => {
      const ring = document.getElementById("imgRiskRingFill");
      const numEl = document.getElementById("imgRiskScoreNum");
      if (ring) ring.style.strokeDashoffset = offset;
      if (numEl) {
        let cur = 0;
        const target = data.riskScore || 0;
        const step = () => {
          cur = Math.min(cur + 2, target);
          numEl.textContent = cur;
          if (cur < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, 80);
  });
}

/* ══════════════════════════════════════════════════════════════
   TOOLBAR ACTIONS: COPY & PRINT
══════════════════════════════════════════════════════════════ */
function copyImageAnalysisResult() {
  if (!_lastImageAnalysisData) return;
  const d = _lastImageAnalysisData;
  const summary = [
    `=== AI Email Spam Classifier — Image Analysis Report ===`,
    `Prediction: ${d.prediction}`,
    `ML Confidence: ${d.confidence}%`,
    `Risk Score: ${d.riskScore}/100 (${d.riskStatus})`,
    `Phishing Detected: ${d.phishingDetected ? "YES" : "NO"}`,
    `URLs Found: ${d.urlAnalysis?.count || 0}`,
    `Reasons: ${(d.reasons || []).join(" | ")}`,
  ].join("\n");

  navigator.clipboard.writeText(summary).then(() => {
    showToast("Analysis summary copied to clipboard!", "success");
  }).catch(() => {
    showToast("Failed to copy to clipboard.", "warning");
  });
}

function printImageAnalysisResult() {
  window.print();
}

/* ══════════════════════════════════════════════════════════════
   SPINNER OVERRIDE (Animated pipeline step list)
══════════════════════════════════════════════════════════════ */
function showSpinner(visible, title = "Analysing Email…", steps = []) {
  const overlay = document.getElementById("spinnerOverlay");
  if (!overlay) return;

  if (visible) {
    overlay.style.display = "flex";
    const titleEl = overlay.querySelector(".spinner-title");
    if (titleEl) titleEl.textContent = title;

    const stepsEl = document.getElementById("pipelineSteps");
    if (stepsEl && steps.length) {
      stepsEl.innerHTML = `<ul class="ocr-pipeline-steps">
        ${steps.map((s, i) => `
          <li class="${i === 0 ? "step-active" : ""}">
            <i class="bi ${i === 0 ? "bi-arrow-right-circle-fill text-navy" : "bi-circle"}"></i>
            ${s}
          </li>`).join("")}
      </ul>`;

      steps.forEach((_, i) => {
        setTimeout(() => {
          const items = stepsEl.querySelectorAll("li");
          items.forEach((el, j) => {
            el.className = j < i ? "step-done" : j === i ? "step-active" : "";
            const icon = el.querySelector("i");
            if (icon) {
              icon.className = j < i ? "bi bi-check-circle-fill text-success"
                : j === i ? "bi bi-arrow-right-circle-fill text-navy"
                : "bi bi-circle";
            }
          });
        }, i * 500);
      });
    }
  } else {
    overlay.style.display = "none";
  }
}
