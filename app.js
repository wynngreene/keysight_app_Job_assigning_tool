// =========================
// GLOBAL TRAINING & JOB DATA
// =========================

// operators = [ { name, trainings: { [partNumber]: level } } ]
let operators = [];
let partsByNumber = {}; // optional meta
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

// ====== CSV CONFIG (MATCHES YOUR SHEET) ======
const HEADER_ROW_INDEX = 12;      // row 13 in Excel
const FIRST_DATA_ROW_INDEX = 13;  // first data row
const OPERATOR_COL_START = 16;    // "Eden" column
const OPERATOR_COL_END = 38;      // "Nikki, NPI" column

// ====== TRAINING LEVEL LOGIC ======
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

// Operators summary page
const operatorsSummaryBody = document.getElementById("operatorsSummaryBody");

// Tabs
const mainTabBtn = document.getElementById("mainTab");
const tickTabBtn = document.getElementById("tickTab");
const operatorsTabBtn = document.getElementById("operatorsTab");

// Edit modal elements
const editAssignmentIndexInput = document.getElementById("editAssignmentIndex");
const editJobNumberInput = document.getElementById("editJobNumber");
const editPartNumberInput = document.getElementById("editPartNumber");
const editOperatorSelect = document.getElementById("editOperatorSelect");
const editStatusSelect = document.getElementById("editStatusSelect");
const editInitialsInput = document.getElementById("editInitialsInput");
const editErrorMsg = document.getElementById("editErrorMsg");

// =========================
– CSV LOAD & PARSE
// =========================

csvInput.addEventListener("change", () => {
  const file = csvInput.files[0];
  if (!file) return;

  loadStatus.textContent = "Loading and parsing CSV...";
  parseTrainingCsv(file);
});

function parseTrainingCsv(file) {
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      try {
        buildTrainingData(results.data);
        loadStatus.textContent = "Training sheet loaded. Ready to scan parts.";
      } catch (err) {
        console.error(err);
        loadStatus.textContent = "Error parsing CSV. Check console for details.";
      }
    }
  });
}

function buildTrainingData(rows) {
  operators = [];
  partsByNumber = {};

  const headerRow = rows[HEADER_ROW_INDEX];
  if (!headerRow) {
    throw new Error("Header row not found at index " + HEADER_ROW_INDEX);
  }

  // operator names from header row
  const operatorNames = headerRow
    .slice(OPERATOR_COL_START, OPERATOR_COL_END + 1)
    .map(name => (name || "").toString().trim())
    .filter(name => name !== "");

  const operatorsMap = {}; // name -> { name, trainings: {} }

  for (let r = FIRST_DATA_ROW_INDEX; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const partNumber = (row[2] || "").toString().trim(); // Col 2 = Part Number
    if (!partNumber) continue;

    // Optional meta
    const family = (row[1] || "").toString().trim();
    const commonName = (row[3] || "").toString().trim();
    const description = (row[4] || "").toString().trim();
    const status = (row[7] || "").toString().trim();

    if (!partsByNumber[partNumber]) {
      partsByNumber[partNumber] = {
        partNumber,
        family,
        commonName,
        description,
        status
      };
    }

    operatorNames.forEach((opName, idx) => {
      const colIndex = OPERATOR_COL_START + idx;
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
  console.log("Loaded operators:", operators);

  // Update operator summary in case that tab is open
  renderOperatorSummary();
}

// =========================
// PAGE SWITCHING (TABS)
// =========================

function showPage(page) {
  const mainPage = document.getElementById("mainPage");
  const tickPage = document.getElementById("tickPage");
  const operatorsPage = document.getElementById("operatorsPage");
  if (!mainPage || !tickPage || !operatorsPage) return;

  // Hide all
  mainPage.classList.add("d-none");
  tickPage.classList.add("d-none");
  operatorsPage.classList.add("d-none");

  mainTabBtn.classList.remove("active");
  tickTabBtn.classList.remove("active");
  operatorsTabBtn.classList.remove("active");

  if (page === "tick") {
    tickPage.classList.remove("d-none");
    tickTabBtn.classList.add("active");
    renderAssignments();
  } else if (page === "operators") {
    operatorsPage.classList.remove("d-none");
    operatorsTabBtn.classList.add("active");
    renderOperatorSummary();
  } else {
    // default to main
    mainPage.classList.remove("d-none");
    mainTabBtn.classList.add("active");
  }
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

  // Use shared helper
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

  // Success – update UI
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

  // Enable only if: part scanned, operator selected, job number entered
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
  console.log("New assignment:", assignment);

  // Log into today's daily log
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) {
    DATA.dailyLogs[dateKey] = [];
  }

  DATA.dailyLogs[dateKey].push(
    `${timeStr} — Assigned job ${jobNumber} (part ${partNumber}) to ${operator}`
  );
  renderDailyLog();

  // Refresh assignment list view and operator summary
  renderAssignments();
  renderOperatorSummary();

  // Feedback
  operatorInfo.textContent =
    `Assigned job ${jobNumber} (part ${partNumber}) to ${operator}.`;

  // Clear job number for next assignment
  jobNumberInput.value = "";
  updateAssignButtonState();
}

// =========================
// JOB ASSIGNMENTS TABLES (TICK PAGE)
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
// OPERATORS SUMMARY PAGE
// =========================

function renderOperatorSummary() {
  if (!operatorsSummaryBody) return;

  operatorsSummaryBody.innerHTML = "";

  if (operators.length === 0) {
    operatorsSummaryBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">
        No operators loaded. Upload a training sheet to see operators.
      </td></tr>`;
    return;
  }

  // Initialize stats from operators list (so they show even with 0 jobs)
  const stats = {};
  operators.forEach(op => {
    stats[op.name] = {
      assigned: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0
    };
  });

  // Count from assignments
  assignments.forEach(a => {
    const name = a.operator || "";
    if (!name) return;

    if (!stats[name]) {
      stats[name] = {
        assigned: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0
      };
    }

    switch (a.status) {
      case "Assigned":
        stats[name].assigned++;
        break;
      case "In Progress":
        stats[name].inProgress++;
        break;
      case "Completed":
        stats[name].completed++;
        break;
      case "Cancelled":
        stats[name].cancelled++;
        break;
    }
  });

  const names = Object.keys(stats).sort((a, b) => a.localeCompare(b));

  names.forEach(name => {
    const s = stats[name];
    const total = s.assigned + s.inProgress + s.completed + s.cancelled;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${s.assigned}</td>
      <td>${s.inProgress}</td>
      <td>${s.completed}</td>
      <td>${s.cancelled}</td>
      <td>${total}</td>
    `;
    operatorsSummaryBody.appendChild(tr);
  });
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
    // Show only trained operators for this part
    trainedOperators.forEach(op => {
      const opt = document.createElement("option");
      opt.value = op.name;
      opt.textContent = `${op.name} (${op.level})`;
      editOperatorSelect.appendChild(opt);
    });

    // Ensure current operator is selectable even if not in trained list
    const isCurrentInList = trainedOperators.some(op => op.name === assignment.operator);
    if (!isCurrentInList && assignment.operator) {
      const opt = document.createElement("option");
      opt.value = assignment.operator;
      opt.textContent = `${assignment.operator} (not in trained list)`;
      editOperatorSelect.appendChild(opt);
    }
  } else {
    // Fallback: no trained operators found for this part
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

  // If no changes, just close.
  if (newOperator === oldOperator && newStatus === oldStatus) {
    editErrorMsg.textContent = "";
    if (editAssignmentModal) editAssignmentModal.hide();
    return;
  }

  assignment.operator = newOperator;
  assignment.status = newStatus;

  // Log change to daily log
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
  renderOperatorSummary();

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

  // Remove assignment
  assignments.splice(index, 1);

  renderDailyLog();
  renderAssignments();
  renderOperatorSummary();

  editErrorMsg.textContent = "";
  if (editAssignmentModal) editAssignmentModal.hide();
}

// =========================
// SIMPLE DAILY LOG VIEWER
// =========================

const DATA = {
  dailyLogs: {
    // Example seed data:
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

let currentLogDate = new Date();

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
  renderAssignments();       // show empty states initially
  renderOperatorSummary();   // show empty operator summary
  updateAssignButtonState();

  editAssignmentModal = new bootstrap.Modal(
    document.getElementById("editAssignmentModal")
  );

  // Ensure Main tab/page is visible on load
  showPage("main");
});
