/**
 * image_analysis.js
 * -----------------
 * Polished Cybersecurity Dashboard for Image-Based Email Spam Detection:
 *  - Left column: Unified Email Input Workspace (upload, preview, OCR status, editable text, word/URL counts, tips)
 *  - Right column: Detection Workspace (Prediction summary, Security indicators, Explainability, Collapsible content, New Analysis)
 *  - Re-analysis & reset workflow
 *  - Keyboard accessibility & responsive layout
 */

let _selectedImageFile = null;
let _originalOcrText = "";
let _lastImageAnalysisData = null;

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
function initImageAnalysis() {
  initImgDropZone();
  bindImgAnalyzeBtn();
  checkOcrStatus();
}

/* ══════════════════════════════════════════════════════════════
   OCR STATUS
══════════════════════════════════════════════════════════════ */
async function checkOcrStatus() {
  const banner = document.getElementById("ocrStatusBanner");
  if (!banner) return;
  try {
    const res = await fetch("/api/ocr-status");
    const data = await res.json();
    const engineEl = document.getElementById("imgDetailEngine");
    if (data.ready) {
      banner.innerHTML = `
        <span class="ocr-status-badge ocr-success">
          <i class="bi bi-shield-check"></i>
          OCR Engine Active ${data.tesseract_version ? "· v" + data.tesseract_version : ""}
        </span>`;
      if (engineEl) engineEl.textContent = `Tesseract v${(data.tesseract_version || "5").split(".")[0] || "5"} (Ready)`;
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
      if (engineEl) engineEl.textContent = "Offline (Missing dependencies)";
    }
  } catch {
    banner.innerHTML = `
      <span class="ocr-status-badge ocr-warning">
        <i class="bi bi-question-circle"></i>
        OCR Engine Standby
      </span>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   DROP ZONE & PREVIEW
══════════════════════════════════════════════════════════════ */
function initImgDropZone() {
  const zone       = document.getElementById("imgDropZone");
  const input      = document.getElementById("imgFileInput");
  const replaceBtn = document.getElementById("imgReplaceBtn");
  const removeBtn  = document.getElementById("imgRemoveBtn");

  if (!zone || !input) return;

  // Click zone to browse (unless clicked on button)
  zone.addEventListener("click", (e) => {
    if (e.target.closest("#imgReplaceBtn") || e.target.closest("#imgRemoveBtn")) return;
    if (!_selectedImageFile) input.click();
  });

  replaceBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    input.click();
  });

  removeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    _clearImageWorkspace();
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

  input.addEventListener("change", () => {
    if (input.files[0]) _loadImageFile(input.files[0]);
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
  const analyzeBtn  = document.getElementById("imgAnalyzeBtn");

  // Populate real image details
  const detailsBox = document.getElementById("imageDetailsBox");
  const nameEl     = document.getElementById("imgDetailName");
  const sizeEl     = document.getElementById("imgDetailSize");
  const dimEl      = document.getElementById("imgDetailDimensions");

  if (nameEl) {
    nameEl.textContent = file.name;
    nameEl.title = file.name;
  }
  if (sizeEl) {
    const kb = (file.size / 1024).toFixed(1);
    const ext = (file.type || "image").replace("image/", "").toUpperCase();
    sizeEl.textContent = `${kb} KB · ${ext}`;
  }
  if (dimEl) dimEl.textContent = "Loading…";
  if (detailsBox) detailsBox.classList.remove("d-none");

  const reader = new FileReader();
  reader.onload = (e) => {
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = "block";
      const tempImg = new Image();
      tempImg.onload = () => {
        if (dimEl) dimEl.textContent = `${tempImg.naturalWidth} × ${tempImg.naturalHeight} px`;
      };
      tempImg.src = e.target.result;
    }
    previewW?.classList.remove("d-none");
    placeholder?.classList.add("d-none");
    zone?.classList.add("has-image");
    if (analyzeBtn) analyzeBtn.disabled = false;
  };
  reader.readAsDataURL(file);

  // Clear previous results when new image loaded
  _clearResultsOnly();
}

function _clearImageWorkspace() {
  _selectedImageFile = null;
  _originalOcrText = "";
  _lastImageAnalysisData = null;

  const zone        = document.getElementById("imgDropZone");
  const preview     = document.getElementById("imgPreview");
  const previewW    = document.getElementById("imgPreviewWrap");
  const placeholder = document.getElementById("imgDropPlaceholder");
  const input       = document.getElementById("imgFileInput");
  const analyzeBtn  = document.getElementById("imgAnalyzeBtn");
  const detailsBox  = document.getElementById("imageDetailsBox");

  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }
  previewW?.classList.add("d-none");
  placeholder?.classList.remove("d-none");
  zone?.classList.remove("has-image");
  if (input) input.value = "";
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (detailsBox) detailsBox.classList.add("d-none");

  _clearResultsOnly();
}

function _clearResultsOnly() {
  const ocrEditor  = document.getElementById("ocrActiveEditor");
  const ocrPrompt  = document.getElementById("ocrEmptyPrompt");
  const mlSection  = document.getElementById("imgMlResultSection");
  const placeHolder = document.getElementById("imgResultPlaceholder");

  if (ocrEditor) {
    ocrEditor.innerHTML = "";
    ocrEditor.classList.add("d-none");
  }
  if (ocrPrompt) {
    ocrPrompt.classList.remove("d-none");
  }
  if (mlSection) {
    mlSection.innerHTML = "";
    mlSection.classList.add("d-none");
  }
  if (placeHolder) {
    placeHolder.classList.remove("d-none");
  }
}

/* ══════════════════════════════════════════════════════════════
   ANALYSE BUTTON
══════════════════════════════════════════════════════════════ */
function bindImgAnalyzeBtn() {
  const btn = document.getElementById("imgAnalyzeBtn");
  if (btn) btn.addEventListener("click", analyzeImage);
}

async function analyzeImage() {
  if (!_selectedImageFile) {
    showToast("Please upload an email screenshot first.", "warning");
    return;
  }

  showSpinner(true, "Scanning Email Screenshot…", [
    "Validating image dimensions & format",
    "Applying OpenCV grayscale & noise reduction",
    "Extracting text via Tesseract OCR engine",
    "Running NLP tokenisation & TF-IDF vectorisation",
    "Executing LinearSVC classification & risk analysis",
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
   RE-ANALYSE EDITED TEXT
══════════════════════════════════════════════════════════════ */
async function reanalyzeEditedText() {
  const ta = document.getElementById("ocrEditableText");
  if (!ta) return;

  const text = ta.value.trim();
  if (!text) {
    showToast("Extracted text is empty. Please enter text to classify.", "warning");
    return;
  }

  showSpinner(true, "Re-analysing Edited Content…", [
    "Preprocessing edited text content",
    "Extracting 5,000 TF-IDF features",
    "Executing LinearSVC model inference",
    "Updating security metrics & risk index",
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

    renderMlResultForImage(data, text);
    _updateCounts(text);
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

  // 1. Hide placeholder in right column
  document.getElementById("imgResultPlaceholder")?.classList.add("d-none");

  // 2. Render Left Column: OCR Editor in place
  _renderOcrEditor(data);

  // 3. Render Right Column: Detection Workspace
  renderMlResultForImage(data, data.ocrText || "");
}

/* ── LEFT COLUMN: Render OCR Text Workspace ────────────────── */
function _renderOcrEditor(data) {
  const prompt = document.getElementById("ocrEmptyPrompt");
  const editor = document.getElementById("ocrActiveEditor");
  if (!editor) return;

  prompt?.classList.add("d-none");
  editor.classList.remove("d-none");

  const words = data.wordCount || (data.ocrText ? data.ocrText.trim().split(/\s+/).length : 0);
  const urls = (data.urlAnalysis?.count) ?? (data.emailFields?.urls_found?.length || 0);

  // Confidence bar
  const conf = data.ocrConfidence;
  const confAvail = data.ocrConfidenceAvailable && conf !== null;
  const confColor = conf === null ? "var(--gray-400)"
    : conf >= 75 ? "var(--success)"
    : conf >= 50 ? "var(--warning)"
    : "var(--danger)";

  const confHtml = confAvail
    ? `<div class="d-flex align-items-center justify-content-between mb-1" style="font-size:.74rem">
         <span class="text-muted-sm fw-600">OCR Recognition Confidence:</span>
         <span style="color:${confColor};font-weight:700">${conf}%</span>
       </div>
       <div class="ocr-conf-bar-wrap mb-2">
         <div class="ocr-conf-bar" style="width:${conf}%;background:${confColor}"></div>
       </div>`
    : "";

  // Metadata pills
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

  editor.innerHTML = `
    <div class="p-2 border rounded bg-white shadow-2xs">
      <div class="d-flex align-items-center justify-content-between pb-2 mb-2 border-bottom">
        <span class="fw-700 text-navy" style="font-size:.8rem">
          <i class="bi bi-file-text me-1"></i>Extracted Text Content
        </span>
        <span class="badge bg-light text-navy border" id="ocrCountsBadge" style="font-size:.7rem;font-weight:600">
          ${words} words · ${urls} URLs
        </span>
      </div>

      ${confHtml}
      ${metadataHtml}

      <textarea id="ocrEditableText" class="ocr-textarea" rows="6"
        placeholder="Extracted email text...">${escHtml(data.ocrText || "")}</textarea>

      <div class="d-flex gap-2 mt-2">
        <button class="btn-primary-navy flex-grow-1 justify-content-center py-1" id="reanalyzeBtn" style="font-size:.8rem">
          <i class="bi bi-arrow-repeat me-1"></i>Re-analyse Edited Text
        </button>
        <button class="btn-outline-navy py-1 px-2" id="resetOcrBtn" title="Reset to initial OCR text" style="font-size:.8rem">
          <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
        </button>
      </div>

      <div class="confidence-note-box mt-2">
        <i class="bi bi-info-circle me-1 text-navy"></i>
        <span><strong>OCR Confidence:</strong> Measures character clarity. <strong>ML Confidence:</strong> Measures LinearSVC spam certainty.</span>
      </div>
    </div>`;

  // Bind actions
  document.getElementById("reanalyzeBtn")?.addEventListener("click", reanalyzeEditedText);
  document.getElementById("resetOcrBtn")?.addEventListener("click", () => {
    const ta = document.getElementById("ocrEditableText");
    if (ta) {
      ta.value = _originalOcrText;
      _updateCounts(_originalOcrText);
      showToast("Reset to original OCR extraction.", "info");
    }
  });

  document.getElementById("ocrEditableText")?.addEventListener("input", (e) => {
    _updateCounts(e.target.value);
  });
}

function _updateCounts(text) {
  const badge = document.getElementById("ocrCountsBadge");
  if (!badge) return;
  const w = text.trim() ? text.trim().split(/\s+/).length : 0;
  const urlMatches = text.match(/https?:\/\/[^\s<>\"]+|www\.[^\s<>\"]+/gi) || [];
  badge.textContent = `${w} words · ${urlMatches.length} URLs`;
}

/* ── RIGHT COLUMN: Render Detection Workspace ──────────────── */
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

  // ── A. Prediction Summary Header & 4-Metric Grid ──
  const sourceLabel = data.analysisType === "image_edited"
    ? "Edited OCR Text"
    : "Direct OCR Extraction";

  const summarySection = `
    <!-- A. Prediction Summary Header -->
    <div class="result-header ${colorClass} d-flex align-items-center justify-content-between flex-wrap gap-2 p-3">
      <div class="d-flex align-items-center gap-3">
        <div class="status-icon-box ${colorClass}">
          <i class="bi ${icon} fs-3"></i>
        </div>
        <div>
          <div class="d-flex align-items-center gap-2">
            <span class="result-label ${colorClass}">${data.prediction.toUpperCase()}</span>
            <span class="badge bg-white text-navy border" style="font-size:.7rem;font-weight:600">
              <i class="bi bi-cpu me-1"></i>${sourceLabel}
            </span>
          </div>
          <div class="text-muted-sm mt-1" style="font-size:.78rem">
            ${isSpam ? "High-probability malicious or promotional spam content detected." : "Legitimate conversational email verified."}
          </div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-navy" id="newAnalysisBtnTop" style="font-size:.78rem">
          <i class="bi bi-plus-circle me-1"></i>New Analysis
        </button>
        <div class="confidence-pill" style="font-size:.82rem">${data.confidence}% ML Confidence</div>
      </div>
    </div>

    <!-- 4 Key Metric Cards & Risk Meter -->
    <div class="row g-2 p-3 border-bottom bg-white align-items-center">
      <!-- Circular Risk Meter -->
      <div class="col-auto">
        <div class="risk-ring-wrap" style="transform:scale(.95)">
          <div class="risk-ring">
            <svg width="90" height="90" viewBox="0 0 110 110">
              <circle class="risk-ring-bg" cx="55" cy="55" r="44"/>
              <circle class="risk-ring-fill ${riskClass}"
                cx="55" cy="55" r="44"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference}"
                id="imgRiskRingFill"/>
            </svg>
            <div class="risk-ring-text">
              <span id="imgRiskScoreNum" style="font-size:1.25rem">0</span>
              <small style="font-size:.65rem">/100</small>
            </div>
          </div>
          <span class="risk-status-label ${riskClass} mt-1">${data.riskStatus || (isSpam ? "High Risk" : "Safe")}</span>
        </div>
      </div>

      <!-- 4 Compact Metric Tiles -->
      <div class="col">
        <div class="row g-2">
          <div class="col-6 col-sm-3">
            <div class="p-2 rounded bg-light border text-center">
              <div class="text-muted-sm" style="font-size:.68rem">Verdict</div>
              <div class="fw-700 ${isSpam ? "text-danger" : "text-success"}" style="font-size:.88rem">${data.prediction}</div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="p-2 rounded bg-light border text-center">
              <div class="text-muted-sm" style="font-size:.68rem">Confidence</div>
              <div class="fw-700 text-navy" style="font-size:.88rem">${data.confidence}%</div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="p-2 rounded bg-light border text-center">
              <div class="text-muted-sm" style="font-size:.68rem">Risk Score</div>
              <div class="fw-700" style="font-size:.88rem">${data.riskScore}/100</div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="p-2 rounded bg-light border text-center">
              <div class="text-muted-sm" style="font-size:.68rem">URLs Found</div>
              <div class="fw-700" style="font-size:.88rem">${data.urlAnalysis?.count ?? 0}</div>
            </div>
          </div>
        </div>
        <div class="text-muted-sm mt-1" style="font-size:.68rem;line-height:1.4">
          <i class="bi bi-info-circle me-1"></i>Confidence calculated from LinearSVC decision margin via sigmoid estimation.
        </div>
      </div>
    </div>`;

  // ── B. Security Indicators (Only Relevant Warnings) ──
  const indicators = _buildSecurityIndicators(data);

  // ── C. Explainability Section ──
  const reasonsHtml = (data.reasons || []).map((r) => `
    <div class="reason-item ${isSpam ? "" : "ham"}">
      <i class="bi ${isSpam ? "bi-x-circle-fill text-danger" : "bi-check-circle-fill text-success"}"></i>
      <span>${escHtml(r)}</span>
    </div>`).join("");

  const explainSection = `
    <div class="mb-3">
      <div class="fw-700 mb-2 d-flex align-items-center gap-1" style="font-size:.82rem;color:var(--navy-dark)">
        <i class="bi bi-lightbulb text-navy"></i>
        <span>Explainability — Classification Factors</span>
      </div>
      <div class="d-flex flex-column gap-1">
        ${reasonsHtml}
      </div>
    </div>`;

  // ── D. Collapsible Extracted Content with Threat Highlights ──
  const collapsibleContent = `
    <details class="extracted-content-accordion mb-3" open>
      <summary class="d-flex justify-content-between align-items-center p-2 rounded bg-light border cursor-pointer">
        <span class="fw-600" style="font-size:.82rem;color:var(--navy-dark)">
          <i class="bi bi-file-earmark-text me-1 text-navy"></i>Extracted Email Content &amp; Threat Highlights
        </span>
        <span class="text-muted-sm d-flex align-items-center gap-1" style="font-size:.7rem">
          <span>Toggle view</span>
          <i class="bi bi-chevron-down"></i>
        </span>
      </summary>
      <div class="mt-2 email-body-display p-2 rounded border"
           style="background:var(--gray-50);font-size:.79rem;line-height:1.65;max-height:150px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">
        ${highlightedBody || escHtml(rawText)}
      </div>
    </details>`;

  // ── E. Action Toolbar ──
  const toolbar = `
    <div class="d-flex justify-content-between align-items-center pt-2 border-top">
      <button class="btn btn-sm btn-outline-navy" id="newAnalysisBtnBottom">
        <i class="bi bi-plus-circle me-1"></i>New Analysis
      </button>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" onclick="copyImageAnalysisResult()">
          <i class="bi bi-clipboard me-1"></i>Copy Report
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.print()">
          <i class="bi bi-printer me-1"></i>Print Report
        </button>
      </div>
    </div>`;

  section.innerHTML = `
    <div class="result-card shadow-sm">
      ${summarySection}
      <div class="p-3">
        ${indicators}
        ${explainSection}
        ${collapsibleContent}
        ${toolbar}
      </div>
    </div>`;

  section.classList.remove("d-none");

  // Bind New Analysis buttons
  document.getElementById("newAnalysisBtnTop")?.addEventListener("click", () => {
    _clearImageWorkspace();
    document.getElementById("imgDropZone")?.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("newAnalysisBtnBottom")?.addEventListener("click", () => {
    _clearImageWorkspace();
    document.getElementById("imgDropZone")?.scrollIntoView({ behavior: "smooth" });
  });

  // Animate risk meter
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

/* ── Build Security Indicators Row (Only relevant flags) ───── */
function _buildSecurityIndicators(data) {
  const flags = [];

  // 1. Phishing Warning
  if (data.phishingDetected) {
    flags.push(`
      <div class="security-flag-card danger">
        <div class="d-flex align-items-start gap-2">
          <i class="bi bi-exclamation-triangle-fill text-danger fs-5 flex-shrink-0"></i>
          <div>
            <div class="fw-700 text-danger" style="font-size:.82rem">Phishing Signatures Detected</div>
            <div class="mt-1" style="font-size:.76rem;color:var(--gray-700)">
              ${(data.phishingPatterns || []).map((p) => `<div>• ${escHtml(p)}</div>`).join("")}
            </div>
          </div>
        </div>
      </div>`);
  }

  // 2. Financial Reward / Money Urgency
  const reasonsStr = (data.reasons || []).join(" ").toLowerCase();
  if (reasonsStr.includes("financial reward")) {
    flags.push(`
      <div class="security-flag-chip warning">
        <i class="bi bi-cash-coin me-1"></i>
        <span>Financial Incentive / Prize Claim Language</span>
      </div>`);
  }
  if (reasonsStr.includes("urgency-related")) {
    flags.push(`
      <div class="security-flag-chip danger">
        <i class="bi bi-alarm me-1"></i>
        <span>High-Pressure Urgency Tactics Detected</span>
      </div>`);
  }
  if (reasonsStr.includes("suspicious security-related") || reasonsStr.includes("obfuscated text")) {
    flags.push(`
      <div class="security-flag-chip danger">
        <i class="bi bi-key me-1"></i>
        <span>Credential / Account Security Deception</span>
      </div>`);
  }

  // 3. URLs Analysis
  const urlData = data.urlAnalysis || {};
  if (urlData.shortened > 0) {
    flags.push(`
      <div class="security-flag-chip danger">
        <i class="bi bi-link-45deg me-1"></i>
        <span>Shortened Link Detected (${urlData.shortened} URL)</span>
      </div>`);
  } else if (urlData.suspicious > 0) {
    flags.push(`
      <div class="security-flag-chip warning">
        <i class="bi bi-globe2 me-1"></i>
        <span>Suspicious Domain Detected</span>
      </div>`);
  }

  // Clean state
  if (flags.length === 0) {
    return `
      <div class="security-flag-card success mb-3">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-shield-check text-success fs-5"></i>
          <div>
            <span class="fw-700 text-success" style="font-size:.82rem">Zero Malicious Indicators Detected</span>
            <span class="text-muted-sm ms-2" style="font-size:.74rem">No deceptive links, phishing patterns, or artificial urgency found.</span>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="mb-3">
      <div class="fw-700 mb-2 d-flex align-items-center gap-1" style="font-size:.82rem;color:var(--navy-dark)">
        <i class="bi bi-shield-exclamation text-navy"></i>
        <span>Active Threat Indicators</span>
      </div>
      <div class="d-flex flex-column gap-2">
        ${flags.join("")}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   TOOLBAR ACTIONS
══════════════════════════════════════════════════════════════ */
function copyImageAnalysisResult() {
  if (!_lastImageAnalysisData) return;
  const d = _lastImageAnalysisData;
  const summary = [
    `=== AI Email Spam Classifier — Security Report ===`,
    `Prediction: ${d.prediction}`,
    `ML Confidence: ${d.confidence}%`,
    `Risk Score: ${d.riskScore}/100 (${d.riskStatus})`,
    `Phishing Detected: ${d.phishingDetected ? "YES" : "NO"}`,
    `URLs Found: ${d.urlAnalysis?.count || 0}`,
    `Factors: ${(d.reasons || []).join(" | ")}`,
  ].join("\n");

  navigator.clipboard.writeText(summary).then(() => {
    showToast("Security summary copied to clipboard!", "success");
  }).catch(() => {
    showToast("Failed to copy report.", "warning");
  });
}

/* ══════════════════════════════════════════════════════════════
   SPINNER WITH PIPELINE STEPS
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
        }, i * 450);
      });
    }
  } else {
    overlay.style.display = "none";
  }
}
