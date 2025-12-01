// ==============================
// DATA MODEL & STORAGE
// ==============================
// Each record:
// {
//   employeeName,
//   jobNumber,
//   parts: [ { partNumber, qty }, ... ],
//   notes,
//   datePulled,
//   timeRequested,
//   inventoryCount,
//   adjustCount,
//   stockroomInitials,
//   status: "Open" | "Fulfilled",
//   fulfilledTime
// }

const STORAGE_KEY = 'pouRecords';
let records = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

// Temporary parts list while creating a PoU request
let tempParts = [];

// ==============================
// DOM ELEMENTS
// ==============================

// PoU form
const pouForm = document.getElementById('pouForm');
const employeeNameInput = document.getElementById('employeeName');
const jobNumberInput = document.getElementById('jobNumber');
const notesInput = document.getElementById('notes');
const datePulledInput = document.getElementById('datePulled');
const todayBtn = document.getElementById('todayBtn');

// Part row
const partNumberInput = document.getElementById('partNumberInput');
const quantityInput = document.getElementById('quantityInput');
const addPartBtn = document.getElementById('addPartBtn');
const partsList = document.getElementById('partsList');

// Stockroom
const requestSelect = document.getElementById('requestSelect');
const requestSummary = document.getElementById('requestSummary');
const stockroomForm = document.getElementById('stockroomForm');
const inventoryCountInput = document.getElementById('inventoryCount');
const adjustCountInput = document.getElementById('adjustCount');
const stockroomInitialsInput = document.getElementById('stockroomInitials');

// Admin
const exportCsvBtn = document.getElementById('exportCsvBtn');
const adminStats = document.getElementById('adminStats');

// Table
const recordsTbody = document.getElementById('recordsTbody');

// ==============================
// HELPERS
// ==============================

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function formatStatus(status) {
  return status === 'Fulfilled' ? 'Fulfilled' : 'Open';
}

function computeStats() {
  const total = records.length;
  const openCount = records.filter(r => r.status === 'Open').length;
  const fulfilledCount = total - openCount;
  return { total, openCount, fulfilledCount };
}

function formatNotes(notes) {
  const n = (notes ?? '').toString().trim();
  return n === '' ? 'N/A' : n;
}

function formatDateMMDDYYYY(dateStr) {
  if (!dateStr) return '';
  // If it's already MM/DD/YYYY, just return
  if (dateStr.includes('/') && dateStr.split('/').length === 3) {
    return dateStr;
  }
  // If it's YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${m}/${d}/${y}`;
  }
  return dateStr; // fallback
}

// ==============================
// RENDER TEMP PARTS (in PoU form)
// ==============================

function renderTempParts() {
  partsList.innerHTML = '';
  tempParts.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = `${item.partNumber} (${item.qty})`;

    const delBtn = document.createElement('button');
    delBtn.textContent = 'X';
    delBtn.className = 'part-delete-btn';
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => {
      tempParts.splice(index, 1);
      renderTempParts();
    });

    li.appendChild(delBtn);
    partsList.appendChild(li);
  });
}

// ==============================
// RENDER FUNCTIONS
// ==============================

function renderRecordsTable() {
  recordsTbody.innerHTML = '';

  records.forEach((rec, index) => {
    const tr = document.createElement('tr');
    const statusClass = rec.status === 'Fulfilled' ? 'status-fulfilled' : 'status-open';

    const partsString = (rec.parts || [])
      .map(p => `${p.partNumber} (${p.qty})`)
      .join(', ');

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${rec.employeeName || ''}</td>
      <td>${rec.jobNumber || ''}</td>
      <td>${partsString}</td>
      <td>${formatDateMMDDYYYY(rec.datePulled) || ''}</td>
      <td>${rec.timeRequested || ''}</td>
      <td>${formatNotes(rec.notes)}</td>
      <td>${rec.inventoryCount ?? ''}</td>
      <td>${rec.adjustCount ?? ''}</td>
      <td>${rec.stockroomInitials ?? ''}</td>
      <td class="${statusClass}">${formatStatus(rec.status)}</td>
      <td>${rec.fulfilledTime || ''}</td>
    `;

    recordsTbody.appendChild(tr);
  });
}

function renderStockroomSelect() {
  const currentValue = requestSelect.value;
  requestSelect.innerHTML = `
    <option value="" disabled selected>Select a request</option>
  `;

  records.forEach((rec, index) => {
    const labelDate = formatDateMMDDYYYY(rec.datePulled);
    const label =
      `${labelDate} | ${rec.jobNumber || ''} | ${rec.employeeName || ''}`;

    const opt = document.createElement('option');
    opt.value = index.toString();
    opt.textContent = label;
    requestSelect.appendChild(opt);
  });

  if (currentValue && requestSelect.querySelector(`option[value="${currentValue}"]`)) {
    requestSelect.value = currentValue;
    updateRequestSummary();
  } else {
    requestSelect.value = '';
    requestSummary.textContent = '';
  }
}

function renderAdminStats() {
  const { total, openCount, fulfilledCount } = computeStats();
  adminStats.textContent =
    `Total Records: ${total} | Open: ${openCount} | Fulfilled: ${fulfilledCount}`;
}

function renderAll() {
  renderRecordsTable();
  renderStockroomSelect();
  renderAdminStats();
}

// ==============================
// STOCKROOM SUMMARY
// ==============================

function updateRequestSummary() {
  const idxStr = requestSelect.value;
  if (!idxStr) {
    requestSummary.textContent = '';
    return;
  }
  const idx = parseInt(idxStr, 10);
  const rec = records[idx];
  if (!rec) {
    requestSummary.textContent = '';
    return;
  }

  const labelDate = formatDateMMDDYYYY(rec.datePulled);
  const headerLine =
    `${labelDate} | ${rec.jobNumber || ''} | ${rec.employeeName || ''}`;

  const partsBlock = (rec.parts || [])
    .map(p => ` - ${p.partNumber} (Qty: ${p.qty})`)
    .join('\n');

  requestSummary.textContent =
    `${headerLine}\n\n` +
    `Status: ${formatStatus(rec.status)}\n` +
    `Time Requested: ${rec.timeRequested}\n` +
    `Notes: ${formatNotes(rec.notes)}\n\n` +
    `Parts:\n${partsBlock || 'None'}`;
}

// ==============================
// EVENT HANDLERS
// ==============================

// Today button
todayBtn.addEventListener('click', () => {
  const todayStr = new Date().toISOString().split('T')[0];
  datePulledInput.value = todayStr;
});

// Add Part button
addPartBtn.addEventListener('click', () => {
  const part = partNumberInput.value.trim();
  const qty = quantityInput.value.trim();

  if (!part || !qty) {
    alert('Enter both Part Number and Quantity.');
    return;
  }

  tempParts.push({ partNumber: part, qty: qty });
  partNumberInput.value = '';
  quantityInput.value = '';
  renderTempParts();
});

// PoU form submit (Main User)
pouForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const employeeName = employeeNameInput.value.trim();
  const jobNumber = jobNumberInput.value.trim();
  const notesRaw = notesInput.value.trim();
  const notes = notesRaw === '' ? 'N/A' : notesRaw;
  const datePulled = datePulledInput.value;

  if (!employeeName || !jobNumber || !datePulled) {
    alert('Please fill in Employee, Job Number, and Date Pulled.');
    return;
  }

  if (tempParts.length === 0) {
    alert('Please add at least one part with quantity.');
    return;
  }

  const timeRequested = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const newRecord = {
    employeeName,
    jobNumber,
    parts: tempParts.map(p => ({ ...p })), // shallow copy
    notes,
    datePulled,
    timeRequested,
    inventoryCount: '',
    adjustCount: '',
    stockroomInitials: '',
    status: 'Open',
    fulfilledTime: ''
  };

  records.push(newRecord);
  saveRecords();
  renderAll();

  // Reset temp parts + form
  tempParts = [];
  renderTempParts();
  pouForm.reset();
});

// Stockroom dropdown change
requestSelect.addEventListener('change', updateRequestSummary);

// Stockroom form submit
stockroomForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const idxStr = requestSelect.value;
  if (!idxStr) {
    alert('Please select a PoU request to fulfill.');
    return;
  }
  const idx = parseInt(idxStr, 10);
  const rec = records[idx];
  if (!rec) {
    alert('Selected request not found.');
    return;
  }

  const inventoryCount = inventoryCountInput.value;
  const adjustCountRaw = adjustCountInput.value;
  const stockroomInitials = stockroomInitialsInput.value.trim();

  if (!stockroomInitials) {
    alert('Please enter stockroom initials.');
    return;
  }

  const adjustCount = adjustCountRaw === '' ? 'N/A' : adjustCountRaw;

  rec.inventoryCount = inventoryCount || '';
  rec.adjustCount = adjustCount;
  rec.stockroomInitials = stockroomInitials;
  rec.status = 'Fulfilled';
  rec.fulfilledTime = new Date().toLocaleString();

  saveRecords();
  renderAll();

  stockroomForm.reset();
});

// Export CSV
exportCsvBtn.addEventListener('click', () => {
  if (records.length === 0) {
    alert('No records to export.');
    return;
  }

  let csv = 'Index,Employee,Job,Parts,Date Pulled,Time Requested,Notes,Inventory Count,Adjust Count,Stockroom Initials,Status,Fulfilled Time\n';

  records.forEach((rec, idx) => {
    const partsString = (rec.parts || [])
      .map(p => `${p.partNumber} (Qty: ${p.qty})`)
      .join('; ');

    const row = [
      idx + 1,
      rec.employeeName,
      rec.jobNumber,
      partsString,
      formatDateMMDDYYYY(rec.datePulled),
      rec.timeRequested,
      formatNotes(rec.notes),
      rec.inventoryCount ?? '',
      rec.adjustCount ?? '',
      rec.stockroomInitials ?? '',
      formatStatus(rec.status),
      rec.fulfilledTime || ''
    ]
      .map(val => `"${(val ?? '').toString().replace(/"/g, '""')}"`)
      .join(',');

    csv += row + '\n';
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pou_logs.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ==============================
// INITIAL RENDER
// ==============================
renderAll();
