/**
 * image_analysis.js
 * -----------------
 * Handles the Image-Based Email Spam Analysis feature:
 *  - Image drag-and-drop upload zone
 *  - Image preview with remove button
 *  - POST /api/analyze-image
 *  - OCR text display (editable textarea)
 *  - POST /api/analyze-extracted-text (re-analyse edited OCR)
 *  - Results rendering (reuses existing CSS classes)
 *
 * NOTE: This file depends on dashboard.js being loaded first.
 * It reads showSpinner(), showToast(), escHtml(), highlightWords(),
 * buildUrlSection(), renderResult(), state from dashboard.js.
 */

/* ══════════════════════════════════════════════════════════════
   IMAGE SECTION INIT
══════════════════════════════════════════════════════════════ */
function initImageAnalysis() {
  initImgDropZone();
  bindImgAnalyzeBtn();
  bindReanalyzeBtn();
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
          OCR Ready — Tesseract ${data.tesseract_version || ""}
        </span>`;
    } else {
      const missing = [];
      if (!data.pillow) missing.push("Pillow");
      if (!data.pytesseract) missing.push("pytesseract");
      if (!data.tesseract_engine) missing.push("Tesseract engine");
      banner.innerHTML = `
        <span class="ocr-status-badge ocr-warning">
          <i class="bi bi-exclamation-triangle-fill"></i>
          OCR components missing: ${missing.join(", ")}
        </span>
        <span class="text-muted-sm ms-2" style="font-size:.72rem">
          Image analysis may not work until these are installed.
        </span>`;
    }
  } catch {
    banner.innerHTML = `
      <span class="ocr-status-badge ocr-warning">
        <i class="bi bi-question-circle"></i>
        OCR status unknown
      </span>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   IMAGE DROP ZONE
══════════════════════════════════════════════════════════════ */
let _selectedImageFile = null;

function initImgDropZone() {
  const zone     = document.getElementById("imgDropZone");
  const input    = document.getElementById("imgFileInput");
  const preview  = document.getElementById("imgPreview");
  const previewW = document.getElementById("imgPreviewWrap");
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

  const zone     = document.getElementById("imgDropZone");
  const preview  = document.getElementById("imgPreview");
  const previewW = document.getElementById("imgPreviewWrap");
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

  // Reset any previous results
  _clearImageResults();
}

function _clearImage() {
  _selectedImageFile = null;
  const zone      = document.getElementById("imgDropZone");
  const preview   = document.getElementById("imgPreview");
  const previewW  = document.getElementById("imgPreviewWrap");
  const placeholder = document.getElementById("imgDropPlaceholder");
  const input     = document.getElementById("imgFileInput");

  if (preview) { preview.src = ""; preview.style.display = "none"; }
  previewW?.classList.add("d-none");
  placeholder?.classList.remove("d-none");
  zone?.classList.remove("has-image");
  if (input) input.value = "";
  _clearImageResults();
}

function _clearImageResults() {
  const ocrSection = document.getElementById("ocrResultSection");
  const mlSection  = document.getElementById("imgMlResultSection");
  if (ocrSection) ocrSection.classList.add("d-none");
  if (mlSection)  mlSection.classList.add("d-none");
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
    showToast("Please select or drop an image first.", "warning");
    return;
  }

  showSpinner(true, "Processing Image…", [
    "Validating image file",
    "Preprocessing for OCR",
    "Extracting text (Tesseract)",
    "Running NLP pipeline",
    "Computing risk score",
  ]);
  _clearImageResults();

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
  } catch (err) {
    showToast(err.message || "Analysis failed.", "error");
  } finally {
    showSpinner(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   RE-ANALYSE EDITED TEXT
══════════════════════════════════════════════════════════════ */
function bindReanalyzeBtn() {
  const btn = document.getElementById("reanalyzeBtn");
  if (btn) btn.addEventListener("click", reanalyzeEditedText);
}

async function reanalyzeEditedText() {
  const ta = document.getElementById("ocrEditableText");
  if (!ta) return;

  const text = ta.value.trim();
  if (!text) {
    showToast("The text area is empty. Please enter or correct the OCR text.", "warning");
    return;
  }

  showSpinner(true, "Re-analysing Text…", [
    "Running NLP preprocessing",
    "TF-IDF vectorisation",
    "Linear SVC classification",
    "Risk score calculation",
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

    // Render ML result (reuse existing renderResult helper from dashboard.js)
    renderMlResultForImage(data, text);
    showToast("Re-analysis complete (edited text).", "success");
  } catch (err) {
    showToast(err.message || "Re-analysis failed.", "error");
  } finally {
    showSpinner(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER IMAGE ANALYSIS RESULTS
══════════════════════════════════════════════════════════════ */
function renderImageResults(data) {
  _renderOcrSection(data);
  renderMlResultForImage(data, data.ocrText || "");
}

function _renderOcrSection(data) {
  const section = document.getElementById("ocrResultSection");
  if (!section) return;

  // OCR confidence bar color
  const conf = data.ocrConfidence;
  const confAvail = data.ocrConfidenceAvailable;
  const confColor = conf === null ? "#94A3B8"
    : conf >= 75 ? "#16A34A"
    : conf >= 50 ? "#D97706"
    : "#DC2626";

  const confHtml = confAvail && conf !== null
    ? `<div class="ocr-confidence-row">
         <span>OCR Confidence</span>
         <div class="ocr-conf-bar-wrap">
           <div class="ocr-conf-bar" style="width:${conf}%;background:${confColor}"></div>
         </div>
         <span style="color:${confColor};font-weight:600">${conf}%</span>
       </div>
       <div style="font-size:.72rem;color:var(--gray-500);margin-top:.2rem">
         This is Tesseract character recognition confidence, separate from spam classification confidence.
       </div>`
    : `<div style="font-size:.75rem;color:var(--gray-500)">
         OCR character confidence data not available for this image.
       </div>`;

  // Email fields
  const fields = data.emailFields || {};
  const fieldRows = [
    ["Sender",    fields.sender],
    ["Recipient", fields.recipient],
    ["Subject",   fields.subject],
  ].filter(([, v]) => v)
   .map(([label, val]) => `
    <div class="email-field-row">
      <span class="email-field-label">${label}</span>
      <span class="email-field-value">${escHtml(val)}</span>
    </div>`).join("");

  const metadataHtml = fieldRows
    ? `<div class="mb-2">${fieldRows}</div>`
    : `<div class="text-muted-sm mb-2">No sender/subject metadata detected in image.</div>`;

  section.innerHTML = `
    <div class="card mb-3">
      <div class="card-header-bar">
        <span><i class="bi bi-file-text me-2 text-navy"></i>OCR Extraction Result</span>
        <span class="text-muted-sm">${data.wordCount || 0} words extracted</span>
      </div>
      <div class="card-body-pad">

        ${confHtml}

        <hr class="divider-soft my-2">

        <div class="fw-600 mb-1" style="font-size:.84rem">
          <i class="bi bi-envelope me-1 text-navy"></i>Detected Email Fields
        </div>
        ${metadataHtml}

        <div class="fw-600 mb-1 mt-2" style="font-size:.84rem">
          <i class="bi bi-pencil me-1 text-navy"></i>Extracted Text
          <span class="text-muted-sm ms-2" style="font-weight:400">
            — Edit and click "Re-analyse" to correct OCR mistakes
          </span>
        </div>
        <textarea id="ocrEditableText" class="ocr-textarea">${escHtml(data.ocrText || "")}</textarea>

        <div class="confidence-note-box mt-2">
          <strong>Note:</strong>
          <strong>OCR confidence</strong> (Tesseract character recognition quality) and
          <strong>ML confidence</strong> (spam classification certainty) are separate measurements
          and are never combined.
        </div>

        <div class="d-flex gap-2 mt-2">
          <button class="btn-primary-navy" id="reanalyzeBtn" style="font-size:.82rem">
            <i class="bi bi-arrow-repeat"></i> Re-analyse Edited Text
          </button>
          <button class="btn btn-sm btn-outline-secondary"
                  onclick="document.getElementById('ocrEditableText').value = ${JSON.stringify(data.ocrText || "")}"
                  style="font-size:.78rem">
            <i class="bi bi-arrow-counterclockwise"></i> Reset
          </button>
        </div>
      </div>
    </div>`;

  section.classList.remove("d-none");

  // Re-bind the reanalyze button (it was just re-created in the DOM)
  const btn = document.getElementById("reanalyzeBtn");
  if (btn) btn.addEventListener("click", reanalyzeEditedText);
}

function renderMlResultForImage(data, rawText) {
  const section = document.getElementById("imgMlResultSection");
  if (!section) return;

  // Reuse the existing renderResult HTML builder from dashboard.js
  // by temporarily pointing it at imgMlResultSection
  const isSpam    = data.prediction === "Spam";
  const colorClass = isSpam ? "spam" : "ham";
  const icon       = isSpam ? "bi-shield-x" : "bi-shield-check";
  const riskClass  = data.riskColor;
  const circumference = 2 * Math.PI * 44;
  const offset = circumference - (data.riskScore / 100) * circumference;

  const highlightedBody = highlightWords(rawText, data.highlightedWords || []);
  const urlSection = buildUrlSection(data.urlAnalysis);

  const phishSection = data.phishingDetected
    ? `<div class="phish-alert mt-3">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div>
          <strong>Phishing Warning Detected</strong>
          <div class="mt-1" style="color:var(--gray-700)">
            ${data.phishingPatterns.map((p) => `<span class="d-block">• ${p}</span>`).join("")}
          </div>
        </div>
      </div>`
    : "";

  const reasonsHtml = (data.reasons || [])
    .map((r) => `
      <div class="reason-item ${isSpam ? "" : "ham"}">
        <i class="bi ${isSpam ? "bi-x-circle-fill" : "bi-check-circle-fill"}"></i>
        <span>${escHtml(r)}</span>
      </div>`).join("");

  // Analysis type banner
  const typeLabel = data.analysisType === "image_edited"
    ? "Re-analysed from edited OCR text"
    : "Analysed from OCR-extracted text";

  section.innerHTML = `
    <div class="result-header-img-strip">
      <i class="bi bi-image text-navy"></i>
      <span>${typeLabel}</span>
    </div>
    <div class="result-card">
      <div class="result-header ${colorClass}">
        <i class="bi ${icon} fs-3 ${isSpam ? "text-danger" : "text-success"}"></i>
        <div class="flex-grow-1">
          <div class="result-label ${colorClass}">${data.prediction.toUpperCase()}</div>
          <div class="text-muted-sm mt-1">Email classified as ${data.prediction}</div>
        </div>
        <div class="confidence-pill">${data.confidence}% ML confidence</div>
      </div>

      <div class="p-3">
        <div class="row g-3 align-items-start">
          <!-- Risk ring -->
          <div class="col-auto">
            <div class="risk-ring-wrap">
              <div class="risk-ring">
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <circle class="risk-ring-bg" cx="55" cy="55" r="44"/>
                  <circle class="risk-ring-fill ${riskClass}"
                    cx="55" cy="55" r="44"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${circumference}"
                    id="imgRiskRingFill"/>
                </svg>
                <div class="risk-ring-text">
                  <span id="imgRiskScoreNum">0</span>
                  <small>/100</small>
                </div>
              </div>
              <span class="risk-status-label ${riskClass}">${data.riskStatus}</span>
            </div>
          </div>

          <!-- Metrics -->
          <div class="col">
            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="p-2 rounded" style="background:var(--gray-50);border:1px solid var(--gray-200)">
                  <div class="text-muted-sm">Prediction</div>
                  <div class="fw-700 ${isSpam ? "text-danger" : "text-success"}">${data.prediction}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-2 rounded" style="background:var(--gray-50);border:1px solid var(--gray-200)">
                  <div class="text-muted-sm">ML Confidence</div>
                  <div class="fw-700">${data.confidence}%</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-2 rounded" style="background:var(--gray-50);border:1px solid var(--gray-200)">
                  <div class="text-muted-sm">Risk Score</div>
                  <div class="fw-700">${data.riskScore} / 100</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-2 rounded" style="background:var(--gray-50);border:1px solid var(--gray-200)">
                  <div class="text-muted-sm">URLs Found</div>
                  <div class="fw-700">${data.urlAnalysis?.count ?? 0}</div>
                </div>
              </div>
            </div>

            <!-- ML confidence note -->
            <div class="confidence-note-box">
              <strong>ML confidence note:</strong>
              The ${data.confidence}% figure is derived from the LinearSVC decision function
              via a sigmoid transform — it is a relative certainty estimate, not a calibrated
              probability.
            </div>
          </div>
        </div>

        ${phishSection}
        <hr class="divider-soft">

        <!-- Reasons (XAI) -->
        <div class="mb-3">
          <div class="fw-600 mb-2" style="font-size:.88rem">
            <i class="bi bi-lightbulb me-1 text-navy"></i>Explainability — Why this result?
          </div>
          ${reasonsHtml}
        </div>

        ${urlSection}

        <!-- Highlighted extracted text -->
        <div>
          <div class="fw-600 mb-2" style="font-size:.88rem">
            <i class="bi bi-file-text me-1 text-navy"></i>OCR Extracted Content
            <span class="text-muted-sm ms-2">(spam keywords highlighted in red)</span>
          </div>
          <div class="email-body-display p-3 rounded"
               style="background:var(--gray-50);border:1px solid var(--gray-200);font-size:.82rem;
                      line-height:1.8;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">
            ${highlightedBody}
          </div>
        </div>
      </div>
    </div>`;

  section.classList.remove("d-none");

  // Animate risk ring
  requestAnimationFrame(() => {
    setTimeout(() => {
      const ring = document.getElementById("imgRiskRingFill");
      const numEl = document.getElementById("imgRiskScoreNum");
      if (ring) ring.style.strokeDashoffset = offset;
      if (numEl) {
        let cur = 0;
        const target = data.riskScore;
        const step = () => {
          cur = Math.min(cur + 2, target);
          numEl.textContent = cur;
          if (cur < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, 100);
  });
}

/* ══════════════════════════════════════════════════════════════
   SPINNER OVERRIDE
   Override showSpinner to show OCR-specific steps
══════════════════════════════════════════════════════════════ */
const _origShowSpinner = typeof showSpinner === "function" ? showSpinner : null;

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
            <i class="bi ${i === 0 ? "bi-arrow-right-circle-fill" : "bi-circle"}"></i>
            ${s}
          </li>`).join("")}
      </ul>`;

      // Animate steps
      steps.forEach((_, i) => {
        setTimeout(() => {
          const items = stepsEl.querySelectorAll("li");
          items.forEach((el, j) => {
            el.className = j < i ? "step-done"
              : j === i ? "step-active"
              : "";
            const icon = el.querySelector("i");
            if (icon) {
              icon.className = j < i ? "bi bi-check-circle-fill"
                : j === i ? "bi bi-arrow-right-circle-fill"
                : "bi bi-circle";
            }
          });
        }, i * 600);
      });
    }
  } else {
    overlay.style.display = "none";
  }
}

