// ======================================================
// GLOBAL DATA
// ======================================================
let partsByNumber = {};       // partNumber -> part object (if you want later)
let operators = [];           // { name, trainings: { [partNumber]: level } }
let assignments = [];         // { jobNumber, partNumber, operator, status, assignedAt }

let lastScannedPartNumber = null;

let activePage = 1;
let completedPage = 1;

const ACTIVE_PAGE_SIZE = 10;
const COMPLETED_PAGE_SIZE = 10;

let editAssignmentModal = null;


// ======================================================
// DOM SHORTCUTS
// ======================================================

// CSV
const csvInput = document.getElementById("csvInput");
const loadStatus = document.getElementById("loadStatus");
const readyBadge = document.getElementById("readyBadge");

// Scan
const scanInput = document.getElementById("scanInput");
const scanResult = document.getElementById("scanResult");

// Operator + job assign
const operatorSelect = document.getElementById("operatorSelect");
const jobNumberInput = document.getElementById("jobNumberInput");
const assignJobBtn = document.getElementById("assignJobBtn");
const operatorInfo = document.getElementById("operatorInfo");

// Daily log
const dailyLogDate = document.getElementById("dailyLogDate");
const dailyLogList = document.getElementById("dailyLogList");
const logSearchInput = document.getElementById("logSearchInput");

// Jobs tables
const activeJobsBody = document.getElementById("activeJobsBody");
const activeJobsPagination = document.getElementById("activeJobsPagination");
const completedJobsBody = document.getElementById("completedJobsBody");
const completedJobsPagination = document.getElementById("completedJobsPagination");

// Edit Modal Elements
const editAssignmentIndexInput = document.getElementById("editAssignmentIndex");
const editJobNumber = document.getElementById("editJobNumber");
const editPartNumber = document.getElementById("editPartNumber");
const editOperatorSelect = document.getElementById("editOperatorSelect");
const editStatusSelect = document.getElementById("editStatusSelect");
const editInitialsInput = document.getElementById("editInitialsInput");
const editErrorMsg = document.getElementById("editErrorMsg");

// ======================================================
// TRAINING MATRIX CONFIG (from your original code)
// ======================================================

// These match the training_data.csv layout you shared earlier.
const HEADER_ROW_INDEX = 12;      // row with Eden, Lourdes, etc.
const FIRST_DATA_ROW_INDEX = 13;  // first row of part data
const OPERATOR_COL_START = 16;    // "Eden" column index
const OPERATOR_COL_END   = 38;    // "Nikki, NPI" column index

// "Trained", "Trainer 1", "Trainer 2" = trained; "In Process" = not trained.
function isLevelTrained(level) {
  if (!level) return false;
  const v = level.trim().toLowerCase();
  return v === "trained" || v === "trainer 1" || v === "trainer 2";
}


// ======================================================
// CSV LOADING
// ======================================================

csvInput.addEventListener("change", () => {
  const file = csvInput.files[0];
  if (!file) return;

  readyBadge.classList.add("d-none");
  loadStatus.textContent = "Loading CSV…";

  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      try {
        buildDataFromCsv(results.data);
        loadStatus.textContent = "CSV loaded. Training data ready.";
        readyBadge.classList.remove("d-none");
      } catch (err) {
        console.error(err);
        loadStatus.textContent = "Error reading CSV. Check console.";
      }
    }
  });
});

function buildDataFromCsv(rows) {
  partsByNumber = {};
  operators = [];

  const headerRow = rows[HEADER_ROW_INDEX];
  if (!headerRow) {
    throw new Error("Header row not found at index " + HEADER_ROW_INDEX);
  }

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

    const family      = (row[1] || "").toString().trim();
    const commonName  = (row[3] || "").toString().trim();
    const description = (row[4] || "").toString().trim();
    const status      = (row[7] || "").toString().trim();

    if (!partsByNumber[partNumber]) {
      partsByNumber[partNumber] = {
        partNumber, family, commonName, description, status
      };
    }

    operatorNames.forEach((opName, idx) => {
      const colIndex = OPERATOR_COL_START + idx;
      const cell = (row[colIndex] || "").toString().trim();
      if (!cell) return;

      if (!operatorsMap[opName]) {
        operatorsMap[opName] = { name: opName, trainings: {} };
      }

      operatorsMap[opName].trainings[partNumber] = cell;
    });
  }

  operators = Object.values(operatorsMap);
}


// ======================================================
// UPPERCASE ENFORCEMENT (Scan + Job #)
// ======================================================

// Scan input live uppercase
scanInput.addEventListener("input", () => {
  scanInput.value = scanInput.value.toUpperCase();
});

// Enter key triggers scan
scanInput.addEventListener("keyup", (e) => {
  scanInput.value = scanInput.value.toUpperCase();
  if (e.key === "Enter") processScan();
});

// Job number uppercase
jobNumberInput.addEventListener("input", () => {
  jobNumberInput.value = jobNumberInput.value.toUpperCase();
});

jobNumberInput.addEventListener("keyup", () => {
  jobNumberInput.value = jobNumberInput.value.toUpperCase();
});


// ======================================================
// SCAN LOGIC
// ======================================================

function showScanMessage(msg, error = false) {
  scanResult.classList.remove("d-none", "alert-secondary", "alert-danger");
  scanResult.classList.add(error ? "alert-danger" : "alert-secondary");
  scanResult.textContent = msg;
}

function resetOperatorDropdown(message = "Scan a part first") {
  operatorSelect.innerHTML = `<option value="">${message}</option>`;
  operatorSelect.disabled = true;
  operatorInfo.textContent = "";
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

function populateOperatorDropdown(trained, partNumber) {
  operatorSelect.innerHTML = `<option value="">Select operator</option>`;
  trained.forEach(op => {
    const opt = document.createElement("option");
    opt.value = op.name;
    opt.textContent = `${op.name} (${op.level})`;
    operatorSelect.appendChild(opt);
  });

  operatorSelect.disabled = false;
  operatorInfo.textContent = `Operators shown are trained on part "${partNumber}".`;
}

function processScan() {
  scanInput.value = scanInput.value.toUpperCase();
  const partNumber = scanInput.value.trim();

  if (!partNumber) {
    showScanMessage("Please scan or enter a part number.", true);
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


// ======================================================
// ASSIGN JOB
// ======================================================

function updateAssignButtonState() {
  const hasPart = !!lastScannedPartNumber;
  const operator = operatorSelect.value;
  const job = jobNumberInput.value.trim();
  assignJobBtn.disabled = !(hasPart && operator && job);
}

operatorSelect.addEventListener("change", updateAssignButtonState);
jobNumberInput.addEventListener("input", updateAssignButtonState);

function assignJob() {
  jobNumberInput.value = jobNumberInput.value.toUpperCase();

  const operator = operatorSelect.value;
  const jobNumber = jobNumberInput.value.trim();
  const partNumber = lastScannedPartNumber;

  if (!partNumber || !operator || !jobNumber) return;

  const now = new Date();
  const assignedAt = now.toISOString();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  assignments.push({
    jobNumber,
    partNumber,
    operator,
    status: "Assigned",
    assignedAt
  });

  // Log
  const dateKey = formatDateKey(currentLogDate);
  if (!DATA.dailyLogs[dateKey]) DATA.dailyLogs[dateKey] = [];
  DATA.dailyLogs[dateKey].push(
    `${timeStr} — Assigned job ${jobNumber} (part ${partNumber}) to ${operator}`
  );

  renderDailyLog();
  renderAssignments();

  operatorInfo.textContent = `Assigned job ${jobNumber} to ${operator}.`;
  jobNumberInput.value = "";
  updateAssignButtonState();
}


// ======================================================
// DAILY LOG
// ======================================================

const DATA = {
  dailyLogs: {}
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


// ======================================================
// RENDER ASSIGNMENTS (ACTIVE & COMPLETED)
// ======================================================

function renderAssignments() {
  renderActiveAssignments();
  renderCompletedAssignments();
}

function renderActiveAssignments(page = activePage) {
  const active = assignments.filter(a =>
    a.status === "Assigned" || a.status === "In Progress"
  );

  activeJobsBody.innerHTML = "";
  activeJobsPagination.innerHTML = "";

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
      <td>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit"})}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditAssignment(${idx})">
          Edit
        </button>
      </td>
    `;
    activeJobsBody.appendChild(tr);
  });

  renderPagination(activeJobsPagination, activePage, totalPages, renderActiveAssignments);
}

function renderCompletedAssignments(page = completedPage) {
  const completed = assignments.filter(a =>
    a.status === "Completed" || a.status === "Cancelled"
  );

  completedJobsBody.innerHTML = "";
  completedJobsPagination.innerHTML = "";

  if (completed.length === 0) {
    completedJobsBody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No completed or cancelled jobs.</td></tr>`;
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
      <td>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit"})}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditAssignment(${idx})">
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
    renderCompletedAssignments
  );
}

function renderPagination(container, currentPage, totalPages, callback) {
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const ul = document.createElement("ul");
  ul.className = "pagination pagination-sm justify-content-center mb-0";

  function add(label, page, disabled = false, active = false) {
    const li = document.createElement("li");
    li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;

    const a = document.createElement("a");
    a.href = "#";
    a.className = "page-link";
    a.textContent = label;

    if (!disabled && !active) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        callback(page);
      });
    }

    li.appendChild(a);
    ul.appendChild(li);
  }

  add("«", currentPage - 1, currentPage === 1);
  for (let p = 1; p <= totalPages; p++) {
    add(String(p), p, false, p === currentPage);
  }
  add("»", currentPage + 1, currentPage === totalPages);

  container.appendChild(ul);
}


// ======================================================
// EDIT MODAL
// ======================================================

function openEditAssignment(index) {
  const assignment = assignments[index];
  if (!assignment) return;

  editAssignmentIndexInput.value = index;
  editJobNumber.value = assignment.jobNumber;
  editPartNumber.value = assignment.partNumber;

  // Build operator list based on THIS part
  const trained = getTrainedOperatorsForPart(assignment.partNumber);
  editOperatorSelect.innerHTML = `<option value="">(Select operator)</option>`;

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

  const newJobNumber = editJobNumber.value.trim().toUpperCase() || assignment.jobNumber;
  const newOperator  = editOperatorSelect.value || assignment.operator;
  const newStatus    = editStatusSelect.value || assignment.status;

  const oldJobNumber = assignment.jobNumber;
  const oldOperator  = assignment.operator;
  const oldStatus    = assignment.status;

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
  if (oldJobNumber !== newJobNumber) changes.push(`job ${oldJobNumber} → ${newJobNumber}`);
  if (oldOperator  !== newOperator)  changes.push(`operator ${oldOperator} → ${newOperator}`);
  if (oldStatus    !== newStatus)    changes.push(`status ${oldStatus} → ${newStatus}`);

  if (changes.length > 0) {
    DATA.dailyLogs[dateKey].push(
      `${timeStr} — [${initials}] updated job ${newJobNumber} (part ${assignment.partNumber}): ${changes.join(", ")}`
    );
  }

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


// ======================================================
// INIT
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
  resetOperatorDropdown("Upload training + scan a part");
  renderDailyLog();
  renderAssignments();
  updateAssignButtonState();

  editAssignmentModal = new bootstrap.Modal(
    document.getElementById("editAssignmentModal")
  );
});


// ======================================================
// EXPOSE PUBLIC FUNCTIONS (for HTML onclick)
// ======================================================
window.processScan = processScan;
window.assignJob = assignJob;
window.changeLogDay = changeLogDay;
window.openEditAssignment = openEditAssignment;
window.saveAssignmentChanges = saveAssignmentChanges;
window.deleteAssignment = deleteAssignment;
