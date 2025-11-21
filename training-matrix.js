// training-matrix.js

let TM_HEADERS = [];
let TM_ALL_ROWS = [];
let TM_OPERATOR_START = -1;
let TM_OPERATOR_END = -1;
let TM_TRAINERS_COLUMN = -1;
let TM_STATUS_COLUMN = -1; // last visible column (we show up to this one)

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

    // 4) Detect operator block and Status column
    detectColumns(TM_HEADERS);

    // 5) Populate operator dropdown
    populateOperatorDropdown();

    // 6) Initial render (all rows visible, but only columns up to Status)
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
 */
function detectColumns(headers) {
  TM_OPERATOR_START = headers.findIndex(h => (h || "").trim() === "Eden");
  TM_OPERATOR_END = headers.findIndex(h => (h || "").trim() === "Nikki, NPI");
  TM_TRAINERS_COLUMN = headers.findIndex(h => (h || "").trim() === "Trainers");
  TM_STATUS_COLUMN = headers.findIndex(h => (h || "").trim() === "Status");

  if (TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1 || TM_TRAINERS_COLUMN === -1) {
    console.warn("Operator block incomplete: Eden → Nikki, NPI → Trainers");
  }
  if (TM_STATUS_COLUMN === -1) {
    console.warn("Could not find 'Status' column. All columns will be shown.");
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
 * Filter rows when an operator is selected
 * (even though operator columns are hidden in the display)
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
