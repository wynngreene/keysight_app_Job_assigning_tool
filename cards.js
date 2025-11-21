// =========================
// CONFIG / DATA
// =========================
const DATA = {
  employees: ["Leo Nardo", "Raph Ael", "Donny Tello", "Mikey Angelo"],
  jobData: {
    "Leo Nardo": [
      "JOB: LN8643248 | P/N: SWORD19-FG",
      "JOB: LN8643248 | P/N: KATANA1-TANA2",
      "JOB: LN8643248 | P/N: BLUE087-LD"
    ],
    "Raph Ael": [
      "JOB: LN8643248 | P/N: SAI20-FG",
      "JOB: LN8643248 | P/N: RED0706-MS"
    ],
    "Donny Tello": [
      "JOB: LN8643248 | P/N: STAFF21-FG",
      "JOB: LN8643248 | P/N: ROKUSHAKUBO-540",
      "JOB: LN8643248 | P/N: PURPLE94-BR"
    ],
    "Mikey Angelo": [
      "JOB: LN8643248 | P/N: NUNCHAKU22-FG",
      "JOB: LN8643248 | P/N: CHAIN75-FG",
      "JOB: LN8643248 | P/N: ORANGE2-PT"
    ]
  },
  dailyLogs: {
    "2025-11-18": [
      "07:30 — Leo scanned dishwasher rack",
      "08:15 — Raph picked parts for order #102",
      "09:00 — Donny logged completed install"
    ],
    "2025-11-19": [
      "06:45 — Leo checked inventory count",
      "07:20 — Raph replaced top rack wheel",
      "08:05 — Mikey logged control panel test"
    ]
  }
};

// =========================
// SCAN CARD LOGIC
// =========================
function processScan() {
  const input = document.getElementById("scanInput").value.trim();
  const resultBox = document.getElementById("scanResult");

  if (!input) {
    resultBox.classList.remove("d-none", "alert-secondary");
    resultBox.classList.add("alert-danger");
    resultBox.innerText = "Please enter a value to scan.";
    return;
  }

  resultBox.classList.remove("d-none", "alert-danger");
  resultBox.classList.add("alert-secondary");
  resultBox.innerText = "Scan Result: " + input;
}

// =========================
// PICK OPERATOR LOGIC
// =========================
function populateEmployees() {
  const select = document.getElementById("employeeSelect");
  if (!select) return;

  // Clear existing dynamic options (keep placeholder)
  while (select.options.length > 1) select.remove(1);

  DATA.employees.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function loadJobs() {
  const employee = document.getElementById("employeeSelect").value;
  const container = document.getElementById("jobListContainer");
  const jobList = document.getElementById("jobList");

  jobList.innerHTML = "";

  if (!employee) {
    jobList.innerHTML = `
      <li class="list-group-item list-group-item-danger">
        Please select an employee.
      </li>
    `;
    container.classList.remove("d-none");
    return;
  }

  const jobs = DATA.jobData[employee] || [];

  if (!jobs.length) {
    jobList.innerHTML = `
      <li class="list-group-item">
        No jobs assigned today.
      </li>
    `;
  } else {
    jobs.forEach(job => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.textContent = job;
      jobList.appendChild(li);
    });
  }

  container.classList.remove("d-none");
}

// =========================
// DAILY LOG LOGIC
// =========================
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

function changeLogDay(offset) {
  currentLogDate.setDate(currentLogDate.getDate() + offset);
  const searchInput = document.getElementById("logSearchInput");
  if (searchInput) searchInput.value = "";
  renderDailyLog();
}

function renderDailyLog() {
  const dateLabel = document.getElementById("dailyLogDate");
  const list = document.getElementById("dailyLogList");
  const searchInput = document.getElementById("logSearchInput");

  if (!dateLabel || !list) return;

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const key = formatDateKey(currentLogDate);
  const allEntries = DATA.dailyLogs[key] || [];

  dateLabel.textContent = formatDateDisplay(currentLogDate);
  list.innerHTML = "";

  const entries = searchTerm
    ? allEntries.filter(e => e.toLowerCase().includes(searchTerm))
    : allEntries;

  if (!entries.length) {
    list.innerHTML = `
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
    list.appendChild(li);
  });
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
  populateEmployees();
  renderDailyLog();
});
