// =========================
// GLOBAL TRAINING & JOB DATA
// =========================

// operators = [ { name, trainings: { [partNumber]: level } } ]
let operators = [];
let partsByNumber = {}; // optional meta for parts
let lastScannedPartNumber = null;

// job assignments
// { jobNumber, partNumber, operator, status, assignedAt }
let assignments = [];

// pagination for assignments
const ACTIVE_PAGE_SIZE = 10;
const COMPLETED_PAGE_SIZE = 10;
let activePage = 1;
let completedPage = 1;

// modal instance
let editAssignmentModal = null;

// =========================
/* DAILY LOG DATA CONTAINER */
// =========================

const DATA = {
  // dailyLogs: { "YYYY-MM-DD": [ "entry", ... ] }
  dailyLogs: {
    // seed examples (optional)
    "2025-11-18": [
      "07:30 — John scanned dishwasher rack",
      "08:15 — Sarah picked parts for order #102",
      "09:00 — David logged completed install"
    ],
    "2025-11-19": [
      "06:45 — John checked inventory count",
      "07:20 — Sarah replaced top rack wheel",
      "08:05 — David logged control panel test"
    ]
  }
};

// current date for daily log view
let currentLogDate = new Date();

// =========================
// TRAINING LEVEL LOGIC
// =========================

function isLevelTrained(level) {
  if (!level) return false;
  const v = level.trim().toLowerCase();
  return v === "trained" || v === "trainer 1" || v === "trainer 2";
}

// Shared helper: get trained operators for a part
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

// Edit modal elements
const editAssignmentIndexInput = document.getElementById("editAssignmentIndex");
const editJobNumberInput = document.getElementById("editJobNumber");
const editPartNumberInput = document.getElementById("editPartNumber");
const editOperatorSelect = document.getElementById("editOperatorSelect");
const editStatusSelect = document.getElementById("editStatusSelect");
const editInitialsInput = document.getElementById("editInitialsInput");
const editErrorMsg = document.getElementById("editErrorMsg");

// =========================
// CSV LOAD & PARSE
// =========================

csvInput.addEventListener("change", () => {
  const file = csvInput.files[0];
  if (!file) return;

  // hide badge until success
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

        // SHOW GREEN BADGE
        readyBadge.classList.remove("d-none");
        readyBadge.firstElementChild.textContent = "✔ Ready to Scan Parts";

      } catch (err) {
        console.error(err);

        loadStatus.className = "mt-2 small text-danger fw-bold";
        loadStatus.textContent = `✘ Error parsing CSV — ${err.message}`;

        // HIDE BADGE ON ERROR
        readyBadge.classList.add("d-none");
      }
    }
  });
}

// ---- CSV header detection helpers ----

function normalizeHeader(val) {
  return (val || "").toString().trim().toLowerCase();
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const hasFamily = row.some(c => normalizeHeader(c) === "family");
    const hasPartNumber = row.some(c => normalizeHeader(c) === "part number");

    if (hasFamily && hasPartNumber) {
      return i;
    }
  }
  throw new Error("Could not find header row with 'Family' and 'Part Number'.");
}

function buildTrainingData(rows) {
  // reset globals
  operators = [];
  partsByNumber = {};

  // 1) Find header row dynamically
  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex];

  // 2) Find key column indices by header text
  const colFamily = headerRow.findIndex(c => normalizeHeader(c) === "family");
  const colPart = headerRow.findIndex(c => normalizeHeader(c) === "part number");
  const colCommon = headerRow.findIndex(c => normalizeHeader(c) === "common name");
  const colDesc = headerRow.findIndex(c => normalizeHeader(c) === "description");
  const colStatus = headerRow.findIndex(c => normalizeHeader(c) === "status");

  if (colPart === -1) {
    throw new Error("Could not find 'Part Number' column.");
  }

  // 3) Figure out which columns are operator names (everything after status/etc.)
  const nonOperatorHeaders = new Set([
    "family",
    "part number",
    "common name",
    "description",
    "rohs",
    "yearly demand hours",
    "status",
    "# trained",
    "demand filter",
    "trained hours",
    "hr shortage",
    "shortage filter",
    "single trainer filter",
    "single trained hours",
    "single trained op",
    "trainer 1",
    "trainer 2",
    "total trainers",
    "trained",
    "trainers"
  ]);

  const operatorColumns = [];
  const operatorNames = [];

  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    if (nonOperatorHeaders.has(norm)) return;
    if (colStatus !== -1 && idx <= colStatus) return;

    operatorColumns.push(idx);
    operatorNames.push((cell || "").toString().trim());
  });

  if (operatorColumns.length === 0) {
    throw new Error("No operator columns detected in header row.");
  }

  const operatorsMap = {}; // name -> { name, trainings: {} }
  const firstDataRowIndex = headerRowIndex + 1;

  // 4) Walk all data rows and build parts + training map
  for (let r = firstDataRowIndex; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[colPart] || "").toString().trim();
    if (!partNumber) continue;

    const family = colFamily >= 0 ? (row[colFamily] || "").toString().trim() : "";
    const commonName = colCommon >= 0 ? (row[colCommon] || "").toString().trim() : "";
    const description = colDesc >= 0 ? (row[colDesc] || "").toString().trim() : "";
    const status = colStatus >= 0 ? (row[colStatus] || "").toString().trim() : "";

    if (!partsByNumber[partNumber]) {
      partsByNumber[partNumber] = {
        partNumber,
        family,
        commonName,
        description,
        status
      };
    }

    operatorColumns.forEach((colIndex, idx) => {
      const opName = operatorNames[idx];
      const cell = (row[colIndex] || "").toString().trim();
      if (!cell) return;

      if (!operatorsMap[opName]) {
        operatorsMap[opName] = {
          name: opName,
          trainings: {}
        };
      }

      operatorsMap[opName].trainings[partNumber] = cell;
    });
  }

  operators = Object.values(operatorsMap);

  console.log("Header row index:", headerRowIndex);
  console.log("Operators detected:", operators.map(o => o.name));
  console.log("Parts detected:", Object.keys(partsByNumber).length);
}

// =========================
// SCAN → SHOW TRAINED OPERATORS
// =========================

function processScan() {
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

  const trainedOperators = getTrainedOperatorsForPart(partNumber);

  if (trainedOperators.length === 0) {
    showScanMessage(
      `No trained operators found for part "${partNumber}".`,
      true
    );
    resetOperatorDropdown("No trained operators for this part");
    lastScannedPartNumber = partNumber; // still remember the part
    updateAssignButtonState();
    return;
  }

  lastScannedPartNumber = partNumber;
  showScanMessage(
    `Found ${trainedOperators.length} trained operator(s) for part "${partNumber}".`,
    false
  );
  populateOperatorDropdown(trainedOperators, partNumber);
  updateAssignButtonState();
}

function showScanMessage(message, isError) {
  scanResult.classList.remove("d-none", "alert-secondary", "alert-danger");
  scanResult.classList.add(isError ? "alert-danger" : "alert-secondary");
  scanResult.textContent = message;
}

function resetOperatorDropdown(placeholderText) {
  operatorSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = placeholderText || "Scan a part first";
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

// Allow Enter key to trigger scan
scanInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    processScan();
  }
});

// =========================
// ASSIGN JOB LOGIC
// =========================

function updateAssignButtonState() {
  const operator = operatorSelect.value;
  const jobNumber = jobNumberInput.value.trim();
  const hasPart = !!lastScannedPartNumber;
  assignJobBtn.disabled = !(hasPart && operator && jobNumber);
}

operatorSelect.addEventListener("change", updateAssignButtonState);
jobNumberInput.addEventListener("keyup", updateAssignButtonState);
jobNumberInput.addEventListener("change", updateAssignButtonState);

function assignJob() {
  const operator = operatorSelect.value;
  const jobNumber = jobNumberInput.value.trim();
  const partNumber = lastScannedPartNumber;

  if (!partNumber) {
    operatorInfo.textContent = "Scan a part before assigning a job.";
    return;
  }
  if (!operator) {
    operatorInfo.textContent = "Select an operator before assigning a job.";
    return;
  }
  if (!jobNumber) {
    operatorInfo.textContent = "Enter a job number before assigning.";
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const assignedAt = now.toISOString();

  const assignment = {
    jobNumber,
    partNumber,
    operator,
    status: "Assigned",
    assignedAt
  };

  assignments.push(assignment);

  // Log into current day's daily log
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) {
    DATA.dailyLogs[dateKey] = [];
  }
  DATA.dailyLogs[dateKey].push(
    `${timeStr} — Assigned job ${jobNumber} (part ${partNumber}) to ${operator}`
  );
  renderDailyLog();
  renderAssignments();

  operatorInfo.textContent =
    `Assigned job ${jobNumber} (part ${partNumber}) to ${operator}.`;

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

  const activeList = assignments.filter(a =>
    a.status === "Assigned" || a.status === "In Progress"
  );

  if (activeList.length === 0) {
    activeJobsBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No active jobs.</td></tr>`;
    activePage = 1;
    return;
  }

  const total = activeList.length;
  const totalPages = Math.ceil(total / ACTIVE_PAGE_SIZE);
  activePage = Math.min(Math.max(page, 1), totalPages);

  const start = (activePage - 1) * ACTIVE_PAGE_SIZE;
  const end = Math.min(start + ACTIVE_PAGE_SIZE, total);

  activeList.slice(start, end).forEach(a => {
    const realIndex = assignments.indexOf(a);
    const dt = new Date(a.assignedAt);
    const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = dt.toLocaleDateString();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.jobNumber}</td>
      <td>${a.partNumber}</td>
      <td>${a.operator}</td>
      <td>${a.status}</td>
      <td>${dateStr} ${timeStr}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary"
          onclick="openEditAssignment(${realIndex})">
          Edit
        </button>
      </td>
    `;
    activeJobsBody.appendChild(tr);
  });

  renderPagination(
    activeJobsPagination,
    activePage,
    totalPages,
    (targetPage) => renderActiveAssignments(targetPage)
  );
}

function renderCompletedAssignments(page = completedPage) {
  completedJobsBody.innerHTML = "";
  completedJobsPagination.innerHTML = "";

  const completedList = assignments.filter(a =>
    a.status === "Completed" || a.status === "Cancelled"
  );

  if (completedList.length === 0) {
    completedJobsBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No completed jobs.</td></tr>`;
    completedPage = 1;
    return;
  }

  const total = completedList.length;
  const totalPages = Math.ceil(total / COMPLETED_PAGE_SIZE);
  completedPage = Math.min(Math.max(page, 1), totalPages);

  const start = (completedPage - 1) * COMPLETED_PAGE_SIZE;
  const end = Math.min(start + COMPLETED_PAGE_SIZE, total);

  completedList.slice(start, end).forEach(a => {
    const realIndex = assignments.indexOf(a);
    const dt = new Date(a.assignedAt);
    const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = dt.toLocaleDateString();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.jobNumber}</td>
      <td>${a.partNumber}</td>
      <td>${a.operator}</td>
      <td>${a.status}</td>
      <td>${dateStr} ${timeStr}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary"
          onclick="openEditAssignment(${realIndex})">
          Edit
        </button>
      </td>
    `;
    completedJobsBody.appendChild(tr);
  });

  renderPagination(
    completedJobsPagination,
    completedPage,
    totalPages,
    (targetPage) => renderCompletedAssignments(targetPage)
  );
}

function renderPagination(container, page, totalPages, onChangePage) {
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const row = document.createElement("div");
  row.className = "d-flex justify-content-center";

  const ul = document.createElement("ul");
  ul.className = "pagination pagination-sm mb-0";

  function addPage(label, targetPage, disabled = false, active = false) {
    const li = document.createElement("li");
    li.className = "page-item";
    if (disabled) li.classList.add("disabled");
    if (active) li.classList.add("active");

    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.textContent = label;

    if (!disabled && !active) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        onChangePage(targetPage);
      });
    }

    li.appendChild(a);
    ul.appendChild(li);
  }

  addPage("«", page - 1, page === 1, false);
  for (let p = 1; p <= totalPages; p++) {
    addPage(String(p), p, false, p === page);
  }
  addPage("»", page + 1, page === totalPages, false);

  row.appendChild(ul);
  container.appendChild(row);
}

// =========================
// EDIT ASSIGNMENT MODAL LOGIC
// =========================

function openEditAssignment(index) {
  const assignment = assignments[index];
  if (!assignment) return;

  editAssignmentIndexInput.value = index;
  editJobNumberInput.value = assignment.jobNumber;
  editPartNumberInput.value = assignment.partNumber;

  // Get operators trained on THIS part
  const trainedOperators = getTrainedOperatorsForPart(assignment.partNumber);

  editOperatorSelect.innerHTML = "";
  const baseOpt = document.createElement("option");
  baseOpt.value = "";
  baseOpt.textContent = "(Select operator)";
  editOperatorSelect.appendChild(baseOpt);

  if (trainedOperators.length > 0) {
    trainedOperators.forEach(op => {
      const opt = document.createElement("option");
      opt.value = op.name;
      opt.textContent = `${op.name} (${op.level})`;
      editOperatorSelect.appendChild(opt);
    });

    const isCurrentInList = trainedOperators.some(op => op.name === assignment.operator);
    if (!isCurrentInList && assignment.operator) {
      const opt = document.createElement("option");
      opt.value = assignment.operator;
      opt.textContent = `${assignment.operator} (not in trained list)`;
      editOperatorSelect.appendChild(opt);
    }
  } else {
    const opt = document.createElement("option");
    opt.value = assignment.operator;
    opt.textContent = `${assignment.operator} (no trained list for this part)`;
    editOperatorSelect.appendChild(opt);
  }

  editOperatorSelect.value = assignment.operator;
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

  const newOperator = editOperatorSelect.value || assignment.operator;
  const newStatus = editStatusSelect.value || assignment.status;

  const oldOperator = assignment.operator;
  const oldStatus = assignment.status;

  if (newOperator === oldOperator && newStatus === oldStatus) {
    editErrorMsg.textContent = "";
    if (editAssignmentModal) editAssignmentModal.hide();
    return;
  }

  assignment.operator = newOperator;
  assignment.status = newStatus;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) {
    DATA.dailyLogs[dateKey] = [];
  }

  const changes = [];
  if (oldOperator !== newOperator) {
    changes.push(`operator ${oldOperator} → ${newOperator}`);
  }
  if (oldStatus !== newStatus) {
    changes.push(`status ${oldStatus} → ${newStatus}`);
  }

  const changeSummary = changes.join(", ");

  DATA.dailyLogs[dateKey].push(
    `${timeStr} — [${initials}] updated job ${assignment.jobNumber} (${assignment.partNumber}): ${changeSummary}`
  );

  renderDailyLog();
  renderAssignments();

  editErrorMsg.textContent = "";
  if (editAssignmentModal) editAssignmentModal.hide();
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
  if (!DATA.dailyLogs[dateKey]) {
    DATA.dailyLogs[dateKey] = [];
  }

  DATA.dailyLogs[dateKey].push(
    `${timeStr} — [${initials}] deleted job ${assignment.jobNumber} (part ${assignment.partNumber}) previously assigned to ${assignment.operator} [status: ${assignment.status}]`
  );

  assignments.splice(index, 1);

  renderDailyLog();
  renderAssignments();

  editErrorMsg.textContent = "";
  if (editAssignmentModal) editAssignmentModal.hide();
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
