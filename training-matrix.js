// training-matrix.js

// Global storage so we can re-render on filter
let TM_HEADERS = [];
let TM_ALL_ROWS = [];
let TM_OPERATOR_START = -1;
let TM_OPERATOR_END = -1;

async function loadTrainingMatrix() {
  try {
    const response = await fetch("training_data.csv");
    const csvText = await response.text();

    // Parse full CSV (keep empty lines so we can detect header row properly)
    const parsed = Papa.parse(csvText, {
      skipEmptyLines: false
    });

    const rows = parsed.data;
    if (!rows || !rows.length) {
      console.error("No rows found in CSV.");
      return;
    }

    // -------------------------------------------------
    // 1. Find the real header row dynamically
    //    Known pattern:
    //    - Column 1 = "Family"
    //    - Column 2 = "Part Number"
    // -------------------------------------------------
    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const c1 = (row[1] || "").trim();
      const c2 = (row[2] || "").trim();

      if (c1 === "Family" && c2 === "Part Number") {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      console.error("Header row not found. Check CSV layout.");
      return;
    }

    const headerRow = rows[headerIndex];

    // -------------------------------------------------
    // 2. Drop the first blank column (index 0)
    // -------------------------------------------------
    TM_HEADERS = headerRow.slice(1); // from column 1 onward

    // -------------------------------------------------
    // 3. Data rows = all rows after headerIndex
    //    We only keep rows with a non-empty "Family" column (col 1).
    // -------------------------------------------------
    TM_ALL_ROWS = rows
      .slice(headerIndex + 1)
      .filter(row => {
        return row.length > 2 && (row[1] || "").trim() !== "";
      })
      .map(row => row.slice(1)); // also drop first blank column

    // -------------------------------------------------
    // 4. Detect operator column range (Eden → Nikki, NPI)
    // -------------------------------------------------
    detectOperatorRange(TM_HEADERS);

    // -------------------------------------------------
    // 5. Populate dropdown with operator names
    // -------------------------------------------------
    populateOperatorDropdown();

    // -------------------------------------------------
    // 6. Initial render (all rows)
    // -------------------------------------------------
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);
  } catch (err) {
    console.error("Error loading training_data.csv:", err);
  }
}

function detectOperatorRange(headers) {
  // We want columns from "Eden" (start) to "Nikki, NPI" (end), inclusive
  TM_OPERATOR_START = -1;
  TM_OPERATOR_END = -1;

  for (let i = 0; i < headers.length; i++) {
    const name = (headers[i] || "").trim();
    if (name === "Eden" && TM_OPERATOR_START === -1) {
      TM_OPERATOR_START = i;
    }
    if (name === "Nikki, NPI") {
      TM_OPERATOR_END = i;
    }
  }

  if (TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1) {
    console.warn("Could not detect full operator range (Eden → Nikki, NPI). Check header spellings.");
  }
}

function populateOperatorDropdown() {
  const select = document.getElementById("operatorSelect");
  if (!select) return;

  // Clear everything except the first "All Operators" option
  while (select.options.length > 1) {
    select.remove(1);
  }

  if (TM_OPERATOR_START === -1 || TM_OPERATOR_END === -1) {
    // Can't find operators, just bail quietly.
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

  // Hook up change listener once
  select.addEventListener("change", handleOperatorFilterChange);
}

function handleOperatorFilterChange() {
  const select = document.getElementById("operatorSelect");
  if (!select) return;

  const selectedName = select.value;
  if (!selectedName) {
    // "All Operators" selected
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);
    return;
  }

  // Find the column index for this operator
  const colIndex = TM_HEADERS.findIndex(h => (h || "").trim() === selectedName);
  if (colIndex === -1) {
    renderTrainingTable(TM_HEADERS, TM_ALL_ROWS);
    return;
  }

  // Filter rows where this operator has a non-empty value in their column
  const filteredRows = TM_ALL_ROWS.filter(row => {
    const cell = row[colIndex];
    const text = (cell || "").trim();
    return text !== "" && text !== "#REF!"; // basic cleanup
  });

  renderTrainingTable(TM_HEADERS, filteredRows);
}

function renderTrainingTable(headers, dataRows) {
  const table = document.getElementById("trainingTable");
  if (!table) return;

  // Clear previous content
  table.innerHTML = "";

  // THEAD
  const thead = document.createElement("thead");
  const headerTr = document.createElement("tr");

  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = (h || "").trim();
    headerTr.appendChild(th);
  });

  thead.appendChild(headerTr);
  table.appendChild(thead);

  // TBODY
  const tbody = document.createElement("tbody");

  dataRows.forEach(row => {
    const tr = document.createElement("tr");
    headers.forEach((_, colIndex) => {
      const td = document.createElement("td");
      const cellValue = row[colIndex] != null ? row[colIndex] : "";
      td.textContent = cellValue;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

// Run when the page loads
document.addEventListener("DOMContentLoaded", loadTrainingMatrix);
