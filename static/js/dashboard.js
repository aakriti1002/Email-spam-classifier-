/**
 * dashboard.js
 * Full dashboard logic: sidebar navigation, email analysis, history,
 * analytics charts, model info, dark mode, PDF export, clipboard copy.
 */

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
const state = {
  currentSection: "analyze",
  historyPage: 1,
  historyFilter: "",
  historySearch: "",
  charts: {},
  lastResult: null,
};

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  initDarkMode();
  initSidebar();
  initHeaderDate();
  initUploadZone();
  bindAnalyzeBtn();
  bindClearBtn();
  bindHistoryControls();
  await loadStats();          // dashboard cards
  showSection("analyze");
});

/* ══════════════════════════════════════════════════════════════
   DARK MODE
══════════════════════════════════════════════════════════════ */
function initDarkMode() {
  const saved = localStorage.getItem("theme") || "light";
  applyTheme(saved);

  document.getElementById("darkToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.querySelector("#darkToggle i");
  if (icon) {
    icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-fill";
  }
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR NAVIGATION
══════════════════════════════════════════════════════════════ */
function initSidebar() {
  document.querySelectorAll(".sidebar-item[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      showSection(section);
    });
  });

  // Mobile hamburger
  const hamburger = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  if (hamburger && sidebar) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
    });
  }
}

function showSection(name) {
  state.currentSection = name;

  // Update sidebar active state
  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });

  // Show/hide sections
  document.querySelectorAll(".dash-section").forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== `section-${name}`);
  });

  // Lazy load section data
  if (name === "history") loadHistory();
  if (name === "analytics") loadAnalytics();
  if (name === "model-info") loadModelInfo();
}

/* ══════════════════════════════════════════════════════════════
   HEADER DATE & TIME
══════════════════════════════════════════════════════════════ */
function initHeaderDate() {
  const el = document.getElementById("headerDate");
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleDateString("en-IN", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  update();
  setInterval(update, 60000);
}

/* ══════════════════════════════════════════════════════════════
   STATS CARDS (dashboard overview)
══════════════════════════════════════════════════════════════ */
async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    setStatCard("statTotal", data.total);
    setStatCard("statSpam", data.spam);
    setStatCard("statHam", data.ham);
    setStatCard("statConf", data.avgConfidence + "%");
  } catch (e) {
    console.warn("Stats unavailable:", e);
  }
}

function setStatCard(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ══════════════════════════════════════════════════════════════
   FILE UPLOAD ZONE
══════════════════════════════════════════════════════════════ */
function initUploadZone() {
  const zone = document.getElementById("uploadZone");
  const input = document.getElementById("fileInput");
  const textarea = document.getElementById("emailTextarea");

  if (!zone || !input || !textarea) return;

  zone.addEventListener("click", () => input.click());

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.style.borderColor = "var(--navy)";
    zone.style.background = "var(--navy-50)";
  });

  zone.addEventListener("dragleave", () => {
    zone.style.borderColor = "";
    zone.style.background = "";
  });

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.style.borderColor = "";
    zone.style.background = "";
    const file = e.dataTransfer.files[0];
    if (file) readTxtFile(file, textarea);
  });

  input.addEventListener("change", () => {
    if (input.files[0]) readTxtFile(input.files[0], textarea);
  });
}

function readTxtFile(file, textarea) {
  if (!file.name.endsWith(".txt")) {
    showToast("Only .txt files are supported.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    textarea.value = e.target.result;
    showToast(`Loaded: ${file.name}`, "success");
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════════════════
   ANALYZE EMAIL
══════════════════════════════════════════════════════════════ */
function bindAnalyzeBtn() {
  const btn = document.getElementById("analyzeBtn");
  if (btn) btn.addEventListener("click", analyzeEmail);

  // Also allow Ctrl+Enter in textarea
  const ta = document.getElementById("emailTextarea");
  if (ta) {
    ta.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") analyzeEmail();
    });
  }
}

async function analyzeEmail() {
  const textarea = document.getElementById("emailTextarea");
  const email = textarea ? textarea.value.trim() : "";

  if (!email) {
    showToast("Please enter or paste email content.", "warning");
    textarea.focus();
    return;
  }

  showSpinner(true);
  clearResult();

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    // Safely parse JSON — server may return HTML on 500 errors
    let data;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(`Server error (${res.status}): ${text.substring(0, 120)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    state.lastResult = data;
    renderResult(data, email);
    await loadStats(); // refresh cards
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    showSpinner(false);
  }
}

/* ── Result Rendering ──────────────────────────────────────── */
function clearResult() {
  const el = document.getElementById("resultArea");
  if (el) el.innerHTML = "";
  document.getElementById("resultArea")?.classList.add("hidden");
  // Restore placeholder
  document.getElementById("resultPlaceholder")?.classList.remove("hidden");
}

function renderResult(data, rawEmail) {
  // Hide placeholder, reveal result panel in-place
  document.getElementById("resultPlaceholder")?.classList.add("hidden");
  const area = document.getElementById("resultArea");
  area.classList.remove("hidden");

  const isSpam = data.prediction === "Spam";
  const colorClass = isSpam ? "spam" : "ham";
  const icon = isSpam ? "bi-shield-x" : "bi-shield-check";
  const riskClass = data.riskColor; // success | warning | danger
  const circumference = 2 * Math.PI * 44; // r=44
  const offset = circumference - (data.riskScore / 100) * circumference;

  // Build highlighted email body
  const highlightedBody = highlightWords(rawEmail, data.highlightedWords || []);

  // URL analysis section
  const urlSection = buildUrlSection(data.urlAnalysis);

  // Phishing warning
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

  // Reasons list
  const reasonsHtml = (data.reasons || [])
    .map(
      (r) =>
        `<div class="reason-item ${isSpam ? "" : "ham"}">
          <i class="bi ${isSpam ? "bi-x-circle-fill" : "bi-check-circle-fill"}"></i>
          <span>${escHtml(r)}</span>
        </div>`
    )
    .join("");

  area.innerHTML = `
    <!-- Result header -->
    <div class="result-card mb-3">
      <div class="result-header ${colorClass}">
        <i class="bi ${icon} fs-3 ${isSpam ? "text-danger" : "text-success"}"></i>
        <div class="flex-grow-1">
          <div class="result-label ${colorClass}">${data.prediction.toUpperCase()}</div>
          <div class="text-muted-sm mt-1">Email classified as ${data.prediction}</div>
        </div>
        <div class="confidence-pill">${data.confidence}% confidence</div>
      </div>

      <!-- Body -->
      <div class="p-3">
        <div class="row g-3 align-items-start">
          <!-- Risk score ring -->
          <div class="col-auto">
            <div class="risk-ring-wrap">
              <div class="risk-ring">
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <circle class="risk-ring-bg" cx="55" cy="55" r="44"/>
                  <circle class="risk-ring-fill ${riskClass}"
                    cx="55" cy="55" r="44"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${circumference}"
                    id="riskRingFill"/>
                </svg>
                <div class="risk-ring-text">
                  <span id="riskScoreNum">0</span>
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
                  <div class="text-muted-sm">Confidence</div>
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
                  <div class="fw-700">${data.urlAnalysis.count}</div>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-outline-secondary" onclick="copyResult()">
                <i class="bi bi-clipboard me-1"></i>Copy Result
              </button>
              <button class="btn btn-sm btn-outline-secondary" onclick="printResult()">
                <i class="bi bi-file-earmark-pdf me-1"></i>Export PDF
              </button>
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

        <!-- Highlighted email body -->
        <div>
          <div class="fw-600 mb-2" style="font-size:.88rem">
            <i class="bi bi-envelope-open me-1 text-navy"></i>Email Content
            <span class="text-muted-sm ms-2">(highlighted spam keywords in red)</span>
          </div>
          <div class="email-body-display p-3 rounded"
               style="background:var(--gray-50);border:1px solid var(--gray-200);font-size:.82rem;
                      line-height:1.8;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">
            ${highlightedBody}
          </div>
        </div>
      </div>
    </div>
  `;

  // Animate risk ring
  animateRiskRing(data.riskScore, data.riskColor, circumference, offset);
}

function animateRiskRing(score, colorClass, circumference, finalOffset) {
  const fill = document.getElementById("riskRingFill");
  const numEl = document.getElementById("riskScoreNum");
  if (!fill || !numEl) return;

  let current = 0;
  const step = score / 60;

  const timer = setInterval(() => {
    current = Math.min(current + step, score);
    const offset = circumference - (current / 100) * circumference;
    fill.style.strokeDashoffset = offset;
    numEl.textContent = Math.round(current);
    if (current >= score) clearInterval(timer);
  }, 16);
}

function buildUrlSection(urlData) {
  if (!urlData || urlData.count === 0) return "";

  const badges = [];
  if (urlData.count > 0) {
    badges.push(`<span class="url-badge neutral"><i class="bi bi-link-45deg"></i>${urlData.count} Link(s)</span>`);
  }
  if (urlData.suspicious > 0) {
    badges.push(`<span class="url-badge suspicious"><i class="bi bi-exclamation-triangle"></i>${urlData.suspicious} Suspicious</span>`);
  }
  if (urlData.shortened > 0) {
    badges.push(`<span class="url-badge suspicious"><i class="bi bi-arrow-left-right"></i>${urlData.shortened} Shortened</span>`);
  }
  if (!urlData.hasSuspicious && urlData.count > 0) {
    badges.push(`<span class="url-badge safe"><i class="bi bi-shield-check"></i>URLs appear safe</span>`);
  }

  return `
    <div class="mb-3">
      <div class="fw-600 mb-2" style="font-size:.88rem">
        <i class="bi bi-globe me-1 text-navy"></i>URL Analysis
      </div>
      <div class="d-flex flex-wrap gap-2">${badges.join("")}</div>
    </div>
    <hr class="divider-soft">
  `;
}

function highlightWords(text, words) {
  if (!words || words.length === 0) return escHtml(text);
  let result = escHtml(text);
  const sorted = [...words].sort((a, b) => b.length - a.length);
  sorted.forEach((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b(${escaped})\\b`, "gi");
    result = result.replace(re, '<mark class="spam-word">$1</mark>');
  });
  return result;
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ══════════════════════════════════════════════════════════════
   COPY & EXPORT
══════════════════════════════════════════════════════════════ */
function copyResult() {
  if (!state.lastResult) return;
  const d = state.lastResult;
  const text = [
    `AI Email Spam Classifier — Result`,
    `Prediction   : ${d.prediction}`,
    `Confidence   : ${d.confidence}%`,
    `Risk Score   : ${d.riskScore}/100 (${d.riskStatus})`,
    `URLs Found   : ${d.urlAnalysis.count}`,
    `Phishing     : ${d.phishingDetected ? "YES" : "No"}`,
    ``,
    `Reasons:`,
    ...(d.reasons || []).map((r) => `  • ${r}`),
  ].join("\n");

  navigator.clipboard.writeText(text).then(() => {
    showToast("Result copied to clipboard!", "success");
  }).catch(() => {
    showToast("Copy failed. Please select manually.", "error");
  });
}

function printResult() {
  window.print();
}

/* ══════════════════════════════════════════════════════════════
   CLEAR
══════════════════════════════════════════════════════════════ */
function bindClearBtn() {
  const btn = document.getElementById("clearBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      const ta = document.getElementById("emailTextarea");
      if (ta) ta.value = "";
      clearResult();
      state.lastResult = null;
      showToast("Cleared.", "info");
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   SPINNER
══════════════════════════════════════════════════════════════ */
function showSpinner(show) {
  const overlay = document.getElementById("spinnerOverlay");
  if (!overlay) return;
  overlay.classList.toggle("show", show);

  if (show) animatePipeline();
}

const PIPELINE_STEPS = [
  "Email Input Received",
  "Text Preprocessing",
  "TF-IDF Vectorization",
  "Naive Bayes Classification",
  "Risk Score Calculation",
  "Result Ready",
];

function animatePipeline() {
  const container = document.getElementById("pipelineSteps");
  if (!container) return;

  container.innerHTML = PIPELINE_STEPS.map(
    (s, i) =>
      `<div class="pipeline-step" id="pstep-${i}">
        <span class="step-dot"></span>${s}
      </div>`
  ).join("");

  let i = 0;
  const interval = setInterval(() => {
    if (i > 0) {
      const prev = document.getElementById(`pstep-${i - 1}`);
      if (prev) { prev.classList.remove("active"); prev.classList.add("done"); }
    }
    const current = document.getElementById(`pstep-${i}`);
    if (current) current.classList.add("active");
    i++;
    if (i >= PIPELINE_STEPS.length) clearInterval(interval);
  }, 350);
}

/* ══════════════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════════════ */
function bindHistoryControls() {
  const searchInput = document.getElementById("historySearch");
  const filterBtns = document.querySelectorAll("[data-history-filter]");
  const clearAllBtn = document.getElementById("clearHistoryBtn");

  if (searchInput) {
    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.historySearch = searchInput.value.trim();
        state.historyPage = 1;
        loadHistory();
      }, 350);
    });
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active", "btn-navy"));
      btn.classList.add("active");
      state.historyFilter = btn.dataset.historyFilter;
      state.historyPage = 1;
      loadHistory();
    });
  });

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", async () => {
      if (!confirm("Delete all prediction history? This cannot be undone.")) return;
      await fetch("/api/history/clear", { method: "DELETE" });
      showToast("History cleared.", "success");
      loadHistory();
      loadStats();
    });
  }
}

async function loadHistory() {
  const params = new URLSearchParams({
    page: state.historyPage,
    limit: 15,
    filter: state.historyFilter,
    search: state.historySearch,
  });

  try {
    const res = await fetch(`/api/history?${params}`);
    const data = await res.json();
    renderHistoryTable(data);
  } catch (e) {
    console.warn("History load error:", e);
  }
}

function renderHistoryTable(data) {
  const tbody = document.getElementById("historyTbody");
  const infoEl = document.getElementById("historyInfo");
  const prevBtn = document.getElementById("historyPrev");
  const nextBtn = document.getElementById("historyNext");

  if (!tbody) return;

  if (data.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted-sm">No records found.</td></tr>`;
  } else {
    tbody.innerHTML = data.data
      .map(
        (row) => `
        <tr>
          <td>${row.id}</td>
          <td class="text-truncate-cell" title="${escHtml(row.email_text)}">${escHtml(row.email_text.substring(0, 80))}…</td>
          <td><span class="badge-${row.prediction.toLowerCase()}">${row.prediction}</span></td>
          <td>${row.confidence.toFixed(1)}%</td>
          <td>${row.risk_score}</td>
          <td>${new Date(row.timestamp).toLocaleString("en-IN")}</td>
          <td>
            <button class="btn btn-sm btn-outline-danger py-0 px-2"
              onclick="deleteRecord(${row.id})">
              <i class="bi bi-trash3"></i>
            </button>
          </td>
        </tr>`
      )
      .join("");
  }

  if (infoEl) {
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(data.page * data.limit, data.total);
    infoEl.textContent = data.total > 0
      ? `Showing ${start}–${end} of ${data.total} records`
      : "No records";
  }

  if (prevBtn) prevBtn.disabled = data.page <= 1;
  if (nextBtn) nextBtn.disabled = data.page * data.limit >= data.total;

  // Bind pagination
  if (prevBtn) prevBtn.onclick = () => { state.historyPage--; loadHistory(); };
  if (nextBtn) nextBtn.onclick = () => { state.historyPage++; loadHistory(); };
}

async function deleteRecord(id) {
  if (!confirm(`Delete record #${id}?`)) return;
  await fetch(`/api/history/${id}`, { method: "DELETE" });
  showToast(`Record #${id} deleted.`, "success");
  loadHistory();
  loadStats();
}

/* ══════════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    renderAnalyticsCharts(data);
  } catch (e) {
    console.warn("Analytics error:", e);
  }
}

function renderAnalyticsCharts(data) {
  // Destroy old charts if they exist
  Object.values(state.charts).forEach((c) => c.destroy());
  state.charts = {};

  const NAVY = "#1B3A6B";
  const DANGER = "#DC3545";
  const SUCCESS = "#198754";
  const GRAY = "#ADB5BD";

  // ── Bar chart: Spam vs Ham
  const barCtx = document.getElementById("barChart");
  if (barCtx) {
    state.charts.bar = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: ["Spam Emails", "Legitimate Emails"],
        datasets: [{
          label: "Count",
          data: [data.spam, data.ham],
          backgroundColor: [DANGER + "CC", SUCCESS + "CC"],
          borderColor: [DANGER, SUCCESS],
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: chartOptions("Email Classification Distribution"),
    });
  }

  // ── Pie chart: Prediction distribution
  const pieCtx = document.getElementById("pieChart");
  if (pieCtx) {
    state.charts.pie = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Spam", "Ham"],
        datasets: [{
          data: [data.spam || 0, data.ham || 0],
          backgroundColor: [DANGER + "CC", SUCCESS + "CC"],
          borderColor: [DANGER, SUCCESS],
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Inter", size: 12 } } },
          title: { display: true, text: "Prediction Distribution", font: { family: "Inter", size: 13, weight: "600" } },
        },
        cutout: "60%",
      },
    });
  }

  // ── Line chart: Daily predictions
  const lineCtx = document.getElementById("lineChart");
  if (lineCtx) {
    const daily = data.daily || [];
    state.charts.line = new Chart(lineCtx, {
      type: "line",
      data: {
        labels: daily.map((d) => d.day),
        datasets: [
          {
            label: "Spam",
            data: daily.map((d) => d.spam),
            borderColor: DANGER,
            backgroundColor: DANGER + "22",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
          },
          {
            label: "Ham",
            data: daily.map((d) => d.ham),
            borderColor: SUCCESS,
            backgroundColor: SUCCESS + "22",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
          },
        ],
      },
      options: chartOptions("Daily Prediction Trend (Last 14 Days)"),
    });
  }

  // ── Bar chart: Confidence distribution
  const confCtx = document.getElementById("confChart");
  if (confCtx) {
    const buckets = data.confidenceBuckets || {};
    state.charts.conf = new Chart(confCtx, {
      type: "bar",
      data: {
        labels: ["< 50%", "50–70%", "70–90%", "> 90%"],
        datasets: [{
          label: "Predictions",
          data: [buckets.lt50 || 0, buckets["50to70"] || 0, buckets["70to90"] || 0, buckets.gt90 || 0],
          backgroundColor: [GRAY + "CC", "#FFC107CC", "#FD7E14CC", NAVY + "CC"],
          borderColor: [GRAY, "#FFC107", "#FD7E14", NAVY],
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: chartOptions("Confidence Score Distribution"),
    });
  }
}

function chartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { position: "bottom", labels: { font: { family: "Inter", size: 12 } } },
      title: {
        display: true,
        text: title,
        font: { family: "Inter", size: 13, weight: "600" },
        padding: { bottom: 12 },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11 } } },
      y: { beginAtZero: true, ticks: { font: { family: "Inter", size: 11 } } },
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   MODEL INFO
══════════════════════════════════════════════════════════════ */
async function loadModelInfo() {
  const container = document.getElementById("modelInfoContent");
  if (!container) return;

  try {
    const res = await fetch("/api/model-info");
    if (!res.ok) throw new Error("Model not trained.");
    const data = await res.json();
    renderModelInfo(data, container);
  } catch (e) {
    container.innerHTML = `<div class="text-muted-sm p-3">
      Model not trained yet. Run <code>python train_model.py</code> first.
    </div>`;
  }
}

function renderModelInfo(data, container) {
  const results = data.model_results || {};
  const best = data.best_model;

  const tableRows = Object.entries(results)
    .sort((a, b) => b[1].f1_score - a[1].f1_score)
    .map(([name, m]) => `
      <tr class="${name === best ? "best-row" : ""}">
        <td>${name} ${name === best ? '<span class="badge bg-primary ms-1" style="font-size:.65rem">Best</span>' : ""}</td>
        <td>${m.accuracy}%</td>
        <td>${m.precision}%</td>
        <td>${m.recall}%</td>
        <td>${m.f1_score}%</td>
      </tr>`
    ).join("");

  const topFeatures = (data.top_spam_features || [])
    .slice(0, 15)
    .map((f) => `<span class="badge me-1 mb-1" style="background:var(--navy-50);color:var(--navy);border:1px solid #C7D8F0">${f}</span>`)
    .join("");

  container.innerHTML = `
    <div class="row g-3">
      <!-- Dataset info -->
      <div class="col-12">
        <div class="card">
          <div class="card-header-bar">
            <span><i class="bi bi-database me-2 text-navy"></i>Dataset</span>
          </div>
          <div class="card-body-pad">
            <div class="row g-3">
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="stat-card-icon sc-navy"><i class="bi bi-collection"></i></div>
                  <div>
                    <div class="stat-card-value">${(data.dataset_size || 0).toLocaleString()}</div>
                    <div class="stat-card-label">Total Emails</div>
                  </div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="stat-card-icon sc-danger"><i class="bi bi-shield-x"></i></div>
                  <div>
                    <div class="stat-card-value">${((data.class_distribution || {}).spam || 0).toLocaleString()}</div>
                    <div class="stat-card-label">Spam Emails</div>
                  </div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="stat-card-icon sc-success"><i class="bi bi-shield-check"></i></div>
                  <div>
                    <div class="stat-card-value">${((data.class_distribution || {}).ham || 0).toLocaleString()}</div>
                    <div class="stat-card-label">Ham Emails</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TF-IDF formula -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header-bar"><span><i class="bi bi-calculator me-2 text-navy"></i>TF-IDF Formula</span></div>
          <div class="card-body-pad">
            <div class="formula-box">
              <span class="formula-label">Term Frequency × Inverse Document Frequency</span>
              TF-IDF(t, d) = TF(t,d) × log(N / df(t))
            </div>
            <div style="font-size:.82rem;color:var(--gray-700);line-height:1.8">
              <strong>TF(t,d)</strong> — How often term <em>t</em> appears in document <em>d</em>.<br>
              <strong>N</strong> — Total number of documents in corpus.<br>
              <strong>df(t)</strong> — Number of documents containing term <em>t</em>.<br>
              <br>
              Words frequent in spam but rare overall (like "lottery", "winner") receive high TF-IDF scores.
            </div>
          </div>
        </div>
      </div>

      <!-- Naive Bayes formula -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header-bar"><span><i class="bi bi-diagram-3 me-2 text-navy"></i>Bayes Theorem</span></div>
          <div class="card-body-pad">
            <div class="formula-box">
              <span class="formula-label">Posterior = Likelihood × Prior / Evidence</span>
              P(Spam | Email) = P(Email | Spam) × P(Spam) / P(Email)
            </div>
            <div style="font-size:.82rem;color:var(--gray-700);line-height:1.8">
              <strong>P(Spam)</strong> — Prior: proportion of spam in training data.<br>
              <strong>P(Email|Spam)</strong> — Likelihood: how probable this email is if spam.<br>
              <strong>P(Spam|Email)</strong> — Posterior: our final spam probability.
            </div>
          </div>
        </div>
      </div>

      <!-- Model comparison -->
      <div class="col-12">
        <div class="card">
          <div class="card-header-bar">
            <span><i class="bi bi-table me-2 text-navy"></i>Model Performance Comparison</span>
          </div>
          <div class="card-body-pad">
            <div class="table-responsive">
              <table class="model-compare-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Accuracy</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1 Score</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Top features -->
      <div class="col-12">
        <div class="card">
          <div class="card-header-bar">
            <span><i class="bi bi-star me-2 text-navy"></i>Top Spam-Indicative Features (TF-IDF)</span>
          </div>
          <div class="card-body-pad">
            ${topFeatures || "<span class='text-muted-sm'>No feature data available.</span>"}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════════════════════ */
function showToast(message, type = "info") {
  const icons = {
    success: "bi-check-circle-fill text-success",
    error: "bi-x-circle-fill text-danger",
    warning: "bi-exclamation-triangle-fill text-warning",
    info: "bi-info-circle-fill text-primary",
  };

  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-msg ${type}`;
  toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = ".3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Expose for inline onclick
window.deleteRecord = deleteRecord;
window.copyResult = copyResult;
window.printResult = printResult;
window.showSection = showSection;
