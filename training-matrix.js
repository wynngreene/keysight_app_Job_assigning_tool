// training-matrix.js

let TM_HEADERS = [];
let TM_ALL_ROWS = [];
let TM_OPERATOR_START = -1;
let TM_OPERATOR_END = -1;
let TM_TRAINERS_COLUMN = -1;
let TM_STATUS_COLUMN = -1;      // last visible column in table
let TM_PARTNUMBER_COLUMN = -1;  // part number column index

/**
 * Load and parse the CSV, detect structure, and render
 */
async function loadTrainingMatrix() {
  try {
    const response = await fetch("training_data.csv");
    const csvText = await response.text();

    const parsed = Papa.parse(csvText, { skipEmptyLines: false });
    const rows = parsed.data;

    if (!rows || !rows.length) {
      console.error("No rows found in CSV.");
      return;
    }

    // 1) Find the real header row
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if ((row[1] || "").trim() === "Family" && (row[2] || "").trim() === "Part Number") {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      console.error("Header row not found.");
      return;
    }

    const headerRow = rows[headerIndex];

    // 2) Drop the first blank column (index 0)
    TM_HEADERS = headerRow.slice(1);

    // 3) Collect data rows (non-empty Family column)
    TM_ALL_ROWS = rows
      .slice(headerIndex + 1)
      .filter(r => r.length > 2 && (r[1] || "").trim() !== "")
      .map(r => r.slice(1));

    // 4) Detect operator block, Status column, and Part Number column
    detectColumns(TM_HEADERS);

    // 5) Populate dropdowns
    populateOperatorDropdown();
    populatePartDropdown();

    // 6) Initial render (all rows visible, only up to Status)
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);

  } catch (err) {
    console.error("Error loading training_data.csv:", err);
  }
}

/**
 * Detect:
 *  - Operator range: Eden → Nikki, NPI
 *  - Trainers block end: "Trainers"
 *  - Status column (last visible column)
 *  - Part Number column
 */
function detectColumns(headers) {
  TM_OPERATOR_START = headers.findIndex(h => (h || "").trim() === "Eden");
  TM_OPERATOR_END = headers.findIndex(h => (h || "").trim() === "Nikki, NPI");
  TM_TRAINERS_COLUMN = headers.findIndex(h => (h || "").trim() === "Trainers");
  TM_STATUS_COLUMN = headers.findIndex(h => (h || "").trim() === "Status");
  TM_PARTNUMBER_COLUMN = headers.findIndex(h => (h || "").trim() === "Part Number");

  if (TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1 || TM_TRAINERS_COLUMN === -1) {
    console.warn("Operator block incomplete: Eden → Nikki, NPI → Trainers");
  }
  if (TM_STATUS_COLUMN === -1) {
    console.warn("Could not find 'Status' column. All columns will be shown.");
  }
  if (TM_PARTNUMBER_COLUMN === -1) {
    console.warn("Could not find 'Part Number' column. Part dropdown will be empty.");
  }
}

/**
 * Populate operator dropdown using headers Eden → Nikki, NPI
 */
function populateOperatorDropdown() {
  const select = document.getElementById("operatorSelect");
  if (!select) return;

  while (select.options.length > 1) select.remove(1);

  if (TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1) {
    // Can't find operators; leave dropdown with just "All"
    return;
  }

  for (let i = TM_OPERATOR_START; i <= TM_OPERATOR_END; i++) {
    const name = (TM_HEADERS[i] || "").trim();
    if (!name) continue;

    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  select.addEventListener("change", handleOperatorFilterChange);
}

/**
 * Populate part-number dropdown from the Part Number column
 */
function populatePartDropdown() {
  const select = document.getElementById("partSelect");
  if (!select) return;

  while (select.options.length > 1) select.remove(1);

  if (TM_PARTNUMBER_COLUMN === -1) {
    return;
  }

  const partSet = new Set();

  TM_ALL_ROWS.forEach(row => {
    const pn = (row[TM_PARTNUMBER_COLUMN] || "").trim();
    if (pn) partSet.add(pn);
  });

  const partList = Array.from(partSet).sort();

  partList.forEach(pn => {
    const opt = document.createElement("option");
    opt.value = pn;
    opt.textContent = pn;
    select.appendChild(opt);
  });

  // When dropdown changes, show part results
  select.addEventListener("change", () => {
    const pn = select.value;
    const input = document.getElementById("partInput");
    if (input) input.value = pn; // sync input for clarity
    showPartResults(pn);
  });
}

/**
 * Filter rows when an operator is selected (matrix display)
 */
function handleOperatorFilterChange() {
  const select = document.getElementById("operatorSelect");
  if (!select) return;

  const selectedName = select.value;

  if (!selectedName) {
    // "All Operators"
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);
    return;
  }

  const colIndex = TM_HEADERS.findIndex(h => (h || "").trim() === selectedName);
  if (colIndex === -1) {
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);
    return;
  }

  const filteredRows = TM_ALL_ROWS.filter(row => {
    const cell = (row[colIndex] || "").trim();
    return cell !== "" && cell !== "#REF!";
  });

  renderTrainingTable(TM_HEADERS, filteredRows);
}

/**
 * Handle the Go button / scan input for part number
 */
function handlePartInput() {
  const input = document.getElementById("partInput");
  const select = document.getElementById("partSelect");
  if (!input) return;

  const raw = input.value.trim();
  const partNumber = raw;

  if (!partNumber) {
    showPartResults(""); // clears result
    if (select) select.value = "";
    return;
  }

  // Try to sync dropdown if exact match exists (case-insensitive)
  if (select) {
    let matchedValue = "";
    for (let i = 0; i < select.options.length; i++) {
      const optVal = select.options[i].value;
      if (optVal && optVal.toUpperCase() === partNumber.toUpperCase()) {
        matchedValue = optVal;
        break;
      }
    }
    select.value = matchedValue || "";
  }

  showPartResults(partNumber);
}

/**
 * Shared logic: given a partNumber string, show which operators are trained on it.
 */
function showPartResults(partNumber) {
  const resultDiv = document.getElementById("partResult");
  if (!resultDiv) return;

  resultDiv.innerHTML = "";

  if (!partNumber) {
    // Nothing selected/typed
    return;
  }

  if (TM_PARTNUMBER_COLUMN === -1 || TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1) {
    resultDiv.textContent = "Configuration error: cannot evaluate operators for this part.";
    return;
  }

  const searchPN = partNumber.trim().toUpperCase();

  // 1) Find all rows that match the selected Part Number (case-insensitive)
  const matchingRows = TM_ALL_ROWS.filter(row => {
    const pn = (row[TM_PARTNUMBER_COLUMN] || "").trim().toUpperCase();
    return pn === searchPN;
  });

  if (!matchingRows.length) {
    resultDiv.innerHTML = `
      <div class="alert alert-warning mb-0">
        No rows found for part <code>${partNumber}</code>.
      </div>
    `;
    return;
  }

  // 2) For each operator, check if they have any non-empty status across those rows
  const trainedOperators = [];

  for (let i = TM_OPERATOR_START; i <= TM_OPERATOR_END; i++) {
    const name = (TM_HEADERS[i] || "").trim();
    if (!name) continue;

    let hasStatus = false;
    const statusSet = new Set();

    matchingRows.forEach(row => {
      const raw = (row[i] || "").trim();
      if (raw && raw !== "#REF!") {
        hasStatus = true;
        statusSet.add(raw);
      }
    });

    if (hasStatus) {
      trainedOperators.push({
        name,
        statuses: Array.from(statusSet)
      });
    }
  }

  // 3) Render results
  if (!trainedOperators.length) {
    resultDiv.innerHTML = `
      <div class="alert alert-warning mb-0">
        No operators are trained on part <code>${partNumber}</code>.
      </div>
    `;
    return;
  }

  let html = `
    <h6 class="mb-2">
      Operators trained / involved for part <code>${partNumber}</code>:
    </h6>
    <ul class="list-group">
  `;

  trainedOperators.forEach(op => {
    const statusText = op.statuses.join(", ");
    html += `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${op.name}</span>
        <span class="badge bg-success">${statusText}</span>
      </li>
    `;
  });

  html += `</ul>`;
  resultDiv.innerHTML = html;
}

/**
 * Decide which column indices should be visible in the table
 * We show:
 *  - If we have a Status column: columns 0..Status
 *  - If not: we show all non-operator/non-trainer columns (fallback)
 */
function getVisibleColumnIndices() {
  const indices = [];

  if (TM_STATUS_COLUMN !== -1) {
    for (let i = 0; i < TM_HEADERS.length; i++) {
      if (i <= TM_STATUS_COLUMN) {
        indices.push(i);
      }
    }
  } else {
    // Fallback: hide operator block, show everything else
    for (let i = 0; i < TM_HEADERS.length; i++) {
      if (i >= TM_OPERATOR_START && i <= TM_TRAINERS_COLUMN) continue;
      indices.push(i);
    }
  }

  return indices;
}

/**
 * Render the matrix with only the chosen visible columns.
 */
function renderTrainingTable(headers, dataRows) {
  const table = document.getElementById("trainingTable");
  if (!table) return;

  table.innerHTML = "";

  const visibleCols = getVisibleColumnIndices();

  // THEAD
  const thead = document.createElement("thead");
  const headerTr = document.createElement("tr");

  visibleCols.forEach(colIndex => {
    const th = document.createElement("th");
    th.textContent = (headers[colIndex] || "").trim();
    headerTr.appendChild(th);
  });

  thead.appendChild(headerTr);
  table.appendChild(thead);

  // TBODY
  const tbody = document.createElement("tbody");

  dataRows.forEach(row => {
    const tr = document.createElement("tr");

    visibleCols.forEach(colIndex => {
      const td = document.createElement("td");
      td.textContent = row[colIndex] != null ? row[colIndex] : "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

// Init
document.addEventListener("DOMContentLoaded", loadTrainingMatrix);
