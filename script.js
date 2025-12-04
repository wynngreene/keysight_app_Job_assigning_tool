// =========================
// GLOBAL TRAINING & JOB DATA
// =========================

let operators = [];
let partsByNumber = {};
let lastScannedPartNumber = null;

// job assignments
// { jobNumber, partNumber, operator, status, assignedAt }
let assignments = [];

// pagination
const ACTIVE_PAGE_SIZE = 10;
const COMPLETED_PAGE_SIZE = 10;
let activePage = 1;
let completedPage = 1;

// modal instance
let editAssignmentModal = null;

// =========================
// DAILY LOG DATA
// =========================

const DATA = {
  dailyLogs: {}
};

let currentLogDate = new Date();

// =========================
// TRAINING LEVEL LOGIC
// =========================

function isLevelTrained(level) {
  if (!level) return false;
  const v = level.trim().toLowerCase();
  return v === "trained" || v === "trainer 1" || v === "trainer 2";
}

function getTrainedOperatorsForPart(partNumber) {
  const pn = (partNumber || "").trim();
  if (!pn) return [];

  return operators
    .map(op => {
      const level = op.trainings[pn];
      if (!isLevelTrained(level)) return null;
      return { name: op.name, level };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// =========================
// DOM ELEMENTS
// =========================

const csvInput = document.getElementById("csvInput");
const loadStatus = document.getElementById("loadStatus");
const readyBadge = document.getElementById("readyBadge");

const scanInput = document.getElementById("scanInput");
const scanResult = document.getElementById("scanResult");

const operatorSelect = document.getElementById("operatorSelect");
const jobNumberInput = document.getElementById("jobNumberInput");
const assignJobBtn = document.getElementById("assignJobBtn");
const operatorInfo = document.getElementById("operatorInfo");

const dailyLogDate = document.getElementById("dailyLogDate");
const dailyLogList = document.getElementById("dailyLogList");
const logSearchInput = document.getElementById("logSearchInput");

const activeJobsBody = document.getElementById("activeJobsBody");
const activeJobsPagination = document.getElementById("activeJobsPagination");
const completedJobsBody = document.getElementById("completedJobsBody");
const completedJobsPagination = document.getElementById("completedJobsPagination");

// Edit modal DOM
const editAssignmentIndexInput = document.getElementById("editAssignmentIndex");
const editJobNumberInput = document.getElementById("editJobNumber");
const editPartNumberInput = document.getElementById("editPartNumber");
const editOperatorSelect = document.getElementById("editOperatorSelect");
const editStatusSelect = document.getElementById("editStatusSelect");
const editInitialsInput = document.getElementById("editInitialsInput");
const editErrorMsg = document.getElementById("editErrorMsg");

// =========================
// CSV UPLOAD + PARSER
// =========================

csvInput.addEventListener("change", () => {
  const file = csvInput.files[0];
  if (!file) return;

  readyBadge.classList.add("d-none");

  loadStatus.className = "mt-2 small text-primary fw-bold";
  loadStatus.textContent = `⏳ Loading "${file.name}"...`;

  parseTrainingCsv(file);
});

function parseTrainingCsv(file) {
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      try {
        buildTrainingData(results.data);

        loadStatus.className = "mt-2 small text-success fw-bold";
        loadStatus.textContent =
          `✔ Training sheet loaded — ${operators.length} operator(s) & ${Object.keys(partsByNumber).length} part(s).`;

        readyBadge.classList.remove("d-none");

      } catch (err) {
        console.error(err);

        loadStatus.className = "mt-2 small text-danger fw-bold";
        loadStatus.textContent = `✘ Error parsing CSV — ${err.message}`;

        readyBadge.classList.add("d-none");
      }
    }
  });
}

// ----- header helpers -----

function normalizeHeader(val) {
  return (val || "").toString().trim().toLowerCase();
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const hasFamily = row.some(c => normalizeHeader(c) === "family");
    const hasPartNumber = row.some(c => normalizeHeader(c) === "part number");

    if (hasFamily && hasPartNumber) return i;
  }
  throw new Error("Training CSV header row not found.");
}

function buildTrainingData(rows) {
  operators = [];
  partsByNumber = {};

  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex];

  // find columns by header name
  const colFamily = headerRow.findIndex(c => normalizeHeader(c) === "family");
  const colPart = headerRow.findIndex(c => normalizeHeader(c) === "part number");
  const colCommon = headerRow.findIndex(c => normalizeHeader(c) === "common name");
  const colDesc = headerRow.findIndex(c => normalizeHeader(c) === "description");
  const colStatus = headerRow.findIndex(c => normalizeHeader(c) === "status");

  if (colPart === -1) throw new Error("Part Number column not found.");

  // detect operator columns (anything after known headers)
  const nonOperatorHeaders = new Set([
    "family","part number","common name","description","status",
    "rohs","yearly demand hours","trained hours","demand filter",
    "trainer 1","trainer 2","trained"
  ]);

  const operatorColumns = [];
  const operatorNames = [];

  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    if (nonOperatorHeaders.has(norm)) return;
    if (idx <= colStatus) return;

    operatorColumns.push(idx);
    operatorNames.push((cell || "").toString().trim());
  });

  const operatorsMap = {};
  const firstDataRowIndex = headerRowIndex + 1;

  for (let r = firstDataRowIndex; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[colPart] || "").toString().trim();
    if (!partNumber) continue;

    const family = colFamily >= 0 ? (row[colFamily] || "").toString().trim() : "";
    const commonName = colCommon >= 0 ? (row[colCommon] || "").toString().trim() : "";
    const description = colDesc >= 0 ? (row[colDesc] || "").toString().trim() : "";
    const status = colStatus >= 0 ? (row[colStatus] || "").toString().trim() : "";

    partsByNumber[partNumber] = {
      partNumber, family, commonName, description, status
    };

    operatorColumns.forEach((colIndex, opIdx) => {
      const opName = operatorNames[opIdx];
      const level = (row[colIndex] || "").toString().trim();
      if (!level) return;

      if (!operatorsMap[opName]) {
        operatorsMap[opName] = { name: opName, trainings: {} };
      }
      operatorsMap[opName].trainings[partNumber] = level;
    });
  }

  operators = Object.values(operatorsMap);
}
// =========================
// SCAN → SHOW TRAINED OPERATORS
// =========================

function showScanMessage(msg, error = false) {
  scanResult.classList.remove("d-none", "alert-secondary", "alert-danger");
  scanResult.classList.add(error ? "alert-danger" : "alert-secondary");
  scanResult.textContent = msg;
}

// Reset operator dropdown
function resetOperatorDropdown(message = "Scan a part first") {
  operatorSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = message;
  operatorSelect.appendChild(opt);

  operatorSelect.disabled = true;
  operatorInfo.textContent = "";
}

function populateOperatorDropdown(trainedOperators, partNumber) {
  operatorSelect.innerHTML = "";

  const baseOpt = document.createElement("option");
  baseOpt.value = "";
  baseOpt.textContent = "Select operator";
  operatorSelect.appendChild(baseOpt);

  trainedOperators.forEach(op => {
    const opt = document.createElement("option");
    opt.value = op.name;
    opt.textContent = `${op.name} (${op.level})`;
    operatorSelect.appendChild(opt);
  });

  operatorSelect.disabled = false;
  operatorInfo.textContent =
    `Operators shown are trained on part "${partNumber}".`;
}

// Main scan event
function processScan() {
  scanInput.value = scanInput.value.toUpperCase(); // FINAL enforcement
  const partNumber = scanInput.value.trim();

  if (!partNumber) {
    showScanMessage("Please enter or scan a part number.", true);
    resetOperatorDropdown("Scan a part first");
    lastScannedPartNumber = null;
    updateAssignButtonState();
    return;
  }

  if (operators.length === 0) {
    showScanMessage("Upload a training CSV first.", true);
    resetOperatorDropdown("Upload training sheet first");
    lastScannedPartNumber = null;
    updateAssignButtonState();
    return;
  }

  const trained = getTrainedOperatorsForPart(partNumber);

  if (trained.length === 0) {
    showScanMessage(`No trained operators found for "${partNumber}".`, true);
    resetOperatorDropdown("No trained operators");
    lastScannedPartNumber = partNumber;
    updateAssignButtonState();
    return;
  }

  lastScannedPartNumber = partNumber;
  showScanMessage(`Found ${trained.length} trained operator(s) for "${partNumber}".`);
  populateOperatorDropdown(trained, partNumber);
  updateAssignButtonState();
}

// =========================
// UPPERCASE SCAN INPUT LOGIC (LIVE + SUBMIT)
// =========================

// Live uppercase
scanInput.addEventListener("input", () => {
  scanInput.value = scanInput.value.toUpperCase();
});

// Enter key = scan
scanInput.addEventListener("keyup", (e) => {
  scanInput.value = scanInput.value.toUpperCase(); // enforce again
  if (e.key === "Enter") {
    processScan();
  }
});

// =========================
// ASSIGN JOB LOGIC
// =========================

function updateAssignButtonState() {
  const hasPart = !!lastScannedPartNumber;
  const operator = operatorSelect.value;
  const job = jobNumberInput.value.trim();
  assignJobBtn.disabled = !(hasPart && operator && job);
}

operatorSelect.addEventListener("change", updateAssignButtonState);
jobNumberInput.addEventListener("input", updateAssignButtonState);

function assignJob() {
  const operator = operatorSelect.value;
  const jobNumber = jobNumberInput.value.trim();
  const partNumber = lastScannedPartNumber;

  if (!partNumber || !operator || !jobNumber) return;

  const now = new Date();
  const assignedAt = now.toISOString();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const entry = `${timeStr} — Assigned job ${jobNumber} (part ${partNumber}) to ${operator}`;
  const dateKey = formatDateKey(currentLogDate);

  if (!DATA.dailyLogs[dateKey]) DATA.dailyLogs[dateKey] = [];
  DATA.dailyLogs[dateKey].push(entry);

  assignments.push({
    jobNumber,
    partNumber,
    operator,
    status: "Assigned",
    assignedAt
  });

  renderDailyLog();
  renderAssignments();

  operatorInfo.textContent = `Assigned job ${jobNumber} to ${operator}.`;
  jobNumberInput.value = "";
  updateAssignButtonState();
}

// =========================
// JOB ASSIGNMENTS TABLES
// =========================

function renderAssignments() {
  renderActiveAssignments();
  renderCompletedAssignments();
}

function renderActiveAssignments(page = activePage) {
  activeJobsBody.innerHTML = "";
  activeJobsPagination.innerHTML = "";

  const active = assignments.filter(a =>
    a.status === "Assigned" || a.status === "In Progress"
  );

  if (active.length === 0) {
    activeJobsBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No active jobs.</td></tr>`;
    return;
  }

  const total = active.length;
  const totalPages = Math.ceil(total / ACTIVE_PAGE_SIZE);
  activePage = Math.min(Math.max(page, 1), totalPages);

  const start = (activePage - 1) * ACTIVE_PAGE_SIZE;
  const end = Math.min(start + ACTIVE_PAGE_SIZE, total);

  active.slice(start, end).forEach(a => {
    const idx = assignments.indexOf(a);
    const dt = new Date(a.assignedAt);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.jobNumber}</td>
      <td>${a.partNumber}</td>
      <td>${a.operator}</td>
      <td>${a.status}</td>
      <td>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditAssignment(${idx})">Edit</button>
      </td>
    `;
    activeJobsBody.appendChild(tr);
  });

  renderPagination(activeJobsPagination, activePage, totalPages, renderActiveAssignments);
}

function renderCompletedAssignments(page = completedPage) {
  completedJobsBody.innerHTML = "";
  completedJobsPagination.innerHTML = "";

  const completed = assignments.filter(a =>
    a.status === "Completed" || a.status === "Cancelled"
  );

  if (completed.length === 0) {
    completedJobsBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No completed jobs.</td></tr>`;
    return;
  }

  const total = completed.length;
  const totalPages = Math.ceil(total / COMPLETED_PAGE_SIZE);
  completedPage = Math.min(Math.max(page, 1), totalPages);

  const start = (completedPage - 1) * COMPLETED_PAGE_SIZE;
  const end = Math.min(start + COMPLETED_PAGE_SIZE, total);

  completed.slice(start, end).forEach(a => {
    const idx = assignments.indexOf(a);
    const dt = new Date(a.assignedAt);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.jobNumber}</td>
      <td>${a.partNumber}</td>
      <td>${a.operator}</td>
      <td>${a.status}</td>
      <td>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditAssignment(${idx})">Edit</button>
      </td>
    `;
    completedJobsBody.appendChild(tr);
  });

  renderPagination(completedJobsPagination, completedPage, totalPages, renderCompletedAssignments);
}

// =========================
// PAGINATION LOGIC
// =========================

function renderPagination(container, page, totalPages, callback) {
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const nav = document.createElement("ul");
  nav.className = "pagination pagination-sm mb-0 justify-content-center";

  function addPage(label, target, disabled = false, active = false) {
    const li = document.createElement("li");
    li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;

    const a = document.createElement("a");
    a.href = "#";
    a.className = "page-link";
    a.textContent = label;

    if (!disabled && !active) {
      a.addEventListener("click", e => {
        e.preventDefault();
        callback(target);
      });
    }

    li.appendChild(a);
    nav.appendChild(li);
  }

  addPage("«", page - 1, page === 1);
  for (let p = 1; p <= totalPages; p++) {
    addPage(String(p), p, false, p === page);
  }
  addPage("»", page + 1, page === totalPages);

  container.appendChild(nav);
}
// =========================
// EDIT ASSIGNMENT MODAL
// =========================

function openEditAssignment(index) {
  const assignment = assignments[index];
  if (!assignment) return;

  editAssignmentIndexInput.value = index;
  editJobNumberInput.value = assignment.jobNumber;
  editPartNumberInput.value = assignment.partNumber;

  // Build operator list based on THIS part
  const trained = getTrainedOperatorsForPart(assignment.partNumber);
  editOperatorSelect.innerHTML = "";

  const baseOpt = document.createElement("option");
  baseOpt.value = "";
  baseOpt.textContent = "(Select operator)";
  editOperatorSelect.appendChild(baseOpt);

  if (trained.length > 0) {
    trained.forEach(op => {
      const opt = document.createElement("option");
      opt.value = op.name;
      opt.textContent = `${op.name} (${op.level})`;
      editOperatorSelect.appendChild(opt);
    });

    const isCurrentInList = trained.some(op => op.name === assignment.operator);
    if (!isCurrentInList && assignment.operator) {
      const opt = document.createElement("option");
      opt.value = assignment.operator;
      opt.textContent = `${assignment.operator} (not in trained list)`;
      editOperatorSelect.appendChild(opt);
    }
  } else {
    if (assignment.operator) {
      const opt = document.createElement("option");
      opt.value = assignment.operator;
      opt.textContent = `${assignment.operator} (no trained list for this part)`;
      editOperatorSelect.appendChild(opt);
    }
  }

  editOperatorSelect.value = assignment.operator || "";
  editStatusSelect.value = assignment.status || "Assigned";
  editInitialsInput.value = "";
  editErrorMsg.textContent = "";

  if (!editAssignmentModal) {
    editAssignmentModal = new bootstrap.Modal(
      document.getElementById("editAssignmentModal")
    );
  }
  editAssignmentModal.show();
}

function saveAssignmentChanges() {
  const index = parseInt(editAssignmentIndexInput.value, 10);
  const assignment = assignments[index];
  if (!assignment) return;

  const initials = editInitialsInput.value.trim();
  if (!initials) {
    editErrorMsg.textContent = "Initials are required to save changes.";
    return;
  }

  const newJobNumber = editJobNumberInput.value.trim() || assignment.jobNumber;
  const newOperator = editOperatorSelect.value || assignment.operator;
  const newStatus = editStatusSelect.value || assignment.status;

  const oldJobNumber = assignment.jobNumber;
  const oldOperator = assignment.operator;
  const oldStatus = assignment.status;

  if (
    newJobNumber === oldJobNumber &&
    newOperator === oldOperator &&
    newStatus === oldStatus
  ) {
    editErrorMsg.textContent = "";
    editAssignmentModal.hide();
    return;
  }

  assignment.jobNumber = newJobNumber;
  assignment.operator = newOperator;
  assignment.status = newStatus;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) DATA.dailyLogs[dateKey] = [];

  const changes = [];
  if (oldJobNumber !== newJobNumber) {
    changes.push(`job # ${oldJobNumber} → ${newJobNumber}`);
  }
  if (oldOperator !== newOperator) {
    changes.push(`operator ${oldOperator} → ${newOperator}`);
  }
  if (oldStatus !== newStatus) {
    changes.push(`status ${oldStatus} → ${newStatus}`);
  }

  const summary = changes.join(", ");
  DATA.dailyLogs[dateKey].push(
    `${timeStr} — [${initials}] updated job ${assignment.jobNumber} (part ${assignment.partNumber}): ${summary}`
  );

  renderDailyLog();
  renderAssignments();

  editErrorMsg.textContent = "";
  editAssignmentModal.hide();
}

function deleteAssignment() {
  const index = parseInt(editAssignmentIndexInput.value, 10);
  const assignment = assignments[index];
  if (!assignment) return;

  const initials = editInitialsInput.value.trim();
  if (!initials) {
    editErrorMsg.textContent = "Initials are required to delete a job.";
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) DATA.dailyLogs[dateKey] = [];

  DATA.dailyLogs[dateKey].push(
    `${timeStr} — [${initials}] deleted job ${assignment.jobNumber} (part ${assignment.partNumber}) previously assigned to ${assignment.operator} [status: ${assignment.status}]`
  );

  assignments.splice(index, 1);

  renderDailyLog();
  renderAssignments();

  editErrorMsg.textContent = "";
  editAssignmentModal.hide();
}

// =========================
// DAILY LOG VIEWER
// =========================

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function changeLogDay(offsetDays) {
  currentLogDate.setDate(currentLogDate.getDate() + offsetDays);
  if (logSearchInput) logSearchInput.value = "";
  renderDailyLog();
}

function renderDailyLog() {
  if (!dailyLogDate || !dailyLogList) return;

  const dateKey = formatDateKey(currentLogDate);
  const allEntries = DATA.dailyLogs[dateKey] || [];
  const searchTerm = (logSearchInput?.value || "").trim().toLowerCase();

  dailyLogDate.textContent = formatDateDisplay(currentLogDate);
  dailyLogList.innerHTML = "";

  const entries = searchTerm
    ? allEntries.filter(e => e.toLowerCase().includes(searchTerm))
    : allEntries;

  if (entries.length === 0) {
    dailyLogList.innerHTML = `
      <li class="list-group-item text-muted">
        No log entries for this day.
      </li>
    `;
    return;
  }

  entries.forEach(entry => {
    const li = document.createElement("li");
    li.className = "list-group-item";
    li.textContent = entry;
    dailyLogList.appendChild(li);
  });
}

// =========================
// INIT
// =========================

document.addEventListener("DOMContentLoaded", () => {
  resetOperatorDropdown("Upload training + scan a part");
  renderDailyLog();
  renderAssignments();
  updateAssignButtonState();

  editAssignmentModal = new bootstrap.Modal(
    document.getElementById("editAssignmentModal")
  );
});

// Expose functions used in HTML onclick attributes
window.processScan = processScan;
window.assignJob = assignJob;
window.changeLogDay = changeLogDay;
window.openEditAssignment = openEditAssignment;
window.saveAssignmentChanges = saveAssignmentChanges;
window.deleteAssignment = deleteAssignment;
