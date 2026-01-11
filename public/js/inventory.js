// Inventory Management - Simplified (No Warehouses)

let items = [];
let transactions = [];
let adjustments = [];
let batches = [];
let currentTab = 'overview';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

// Load all data
async function loadData() {
  try {
    await Promise.all([
      loadItems(),
      loadTransactions(),
      loadAdjustments(),
      loadBatches()
    ]);
    updateOverviewStats();
    renderAllTabs();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Load items
async function loadItems() {
  try {
    items = await itemsAPI.getAll();
    populateItemSelects();
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Load transactions
async function loadTransactions() {
  try {
    transactions = await inventoryAPI.getTransactions() || [];
  } catch (error) {
    console.error('Error loading transactions:', error);
    transactions = [];
  }
}

// Load adjustments
async function loadAdjustments() {
  try {
    // Mock data - replace with API
    adjustments = [];
  } catch (error) {
    console.error('Error loading adjustments:', error);
  }
}

// Load batches
async function loadBatches() {
  try {
    // Mock data - replace with API
    batches = [];
  } catch (error) {
    console.error('Error loading batches:', error);
  }
}

// Populate item selects
function populateItemSelects() {
  const selects = ['stockInItem', 'stockOutItem', 'adjustmentItem', 'batchItem'];

  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '<option value="">Select Item</option>' +
        items.map(item => `<option value="${item.id}">${item.name} (Stock: ${item.stock_quantity || 0})</option>`).join('');
    }
  });
}

// Update overview stats
function updateOverviewStats() {
  const totalItems = items.length;
  const totalValue = items.reduce((sum, item) =>
    sum + ((item.stock_quantity || 0) * (item.purchase_cost || 0)), 0);
  const lowStockItems = items.filter(item =>
    (item.stock_quantity || 0) <= (item.reorder_point || 10)).length;
  const totalQuantity = items.reduce((sum, item) => sum + (item.stock_quantity || 0), 0);

  document.getElementById('totalItems').textContent = totalItems;
  document.getElementById('totalStockValue').textContent = formatCurrency(totalValue);
  document.getElementById('lowStockItems').textContent = lowStockItems;
  document.getElementById('totalQuantity').textContent = totalQuantity;
}

// Switch tabs
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  event.target.closest('.tab-button').classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  renderAllTabs();
}

// Render all tabs
function renderAllTabs() {
  if (currentTab === 'adjustments' || !currentTab || currentTab === 'overview') {
    renderAdjustments();
  }
  if (currentTab === 'logs' || !currentTab || currentTab === 'overview') {
    renderLogs();
  }
  if (currentTab === 'batches' || !currentTab || currentTab === 'overview') {
    renderBatches();
  }
}

// Render adjustments
function renderAdjustments() {
  const tbody = document.getElementById('adjustmentsTableBody');
  if (!tbody) return;

  if (adjustments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px;">
          <div style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">⚙️</div>
          <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">No adjustments yet</div>
          <div style="font-size: 14px; color: #868e96; margin-bottom: 24px;">Create your first stock adjustment</div>
          <button class="btn btn-primary" onclick="openAdjustmentModal()">Create Adjustment</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = adjustments.map(adj => `
    <tr>
      <td>${formatDateTime(adj.date)}</td>
      <td>${adj.item_name}</td>
      <td>${adj.previous_qty}</td>
      <td>${adj.new_qty}</td>
      <td><strong>${adj.difference > 0 ? '+' : ''}${adj.difference}</strong></td>
      <td>${adj.reason || '-'}</td>
      <td>${adj.user || 'Admin'}</td>
    </tr>
  `).join('');
}

// Render logs
function renderLogs() {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 48px;">
          <div style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">📋</div>
          <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">No stock movements yet</div>
          <div style="font-size: 14px; color: #868e96;">Stock transactions will appear here</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = transactions.map(tx => {
    const type = (tx.type || 'IN').toUpperCase();
    const badgeClass = type === 'IN' ? 'in' : 'out';

    return `
      <tr>
        <td>${formatDateTime(tx.date || tx.created_at)}</td>
        <td><span class="log-badge ${badgeClass}">${type}</span></td>
        <td>${tx.item_name || 'N/A'}</td>
        <td><strong>${tx.quantity}</strong></td>
        <td>${tx.reference || '-'}</td>
        <td>${tx.notes || '-'}</td>
      </tr>
    `;
  }).join('');
}

// Render batches
function renderBatches() {
  const container = document.getElementById('batchesContainer');
  if (!container) return;

  if (batches.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px;">
        <div style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">🏷️</div>
        <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">No batches yet</div>
        <div style="font-size: 14px; color: #868e96; margin-bottom: 24px;">Create batch/serial numbers for tracking</div>
        <button class="btn btn-primary" onclick="openBatchModal()">Add Batch</button>
      </div>
    `;
    return;
  }

  container.innerHTML = batches.map(batch => `
    <div class="batch-item">
      <div class="batch-info">
        <div class="batch-number">${batch.batch_number}</div>
        <div class="batch-meta">${batch.item_name} • Exp: ${formatDate(batch.expiry_date)}</div>
      </div>
      <div class="batch-qty">${batch.quantity}</div>
      <button class="btn btn-secondary" onclick="editBatch(${batch.id})" style="padding: 6px 12px; font-size: 12px;">Edit</button>
    </div>
  `).join('');
}

// Filter logs
function filterLogs() {
  const type = document.getElementById('logTypeFilter')?.value;
  const fromDate = document.getElementById('logFromDate')?.value;
  const toDate = document.getElementById('logToDate')?.value;

  renderLogs();
}

// Update current stock display
function updateCurrentStock() {
  const itemId = parseInt(document.getElementById('adjustmentItem')?.value);
  const currentStockSpan = document.getElementById('currentStock');

  if (itemId && currentStockSpan) {
    const item = items.find(i => i.id === itemId);
    if (item) {
      currentStockSpan.textContent = item.stock_quantity || 0;
    }
  }
}

// Modal functions
function openStockInModal() {
  const modal = document.getElementById('stockInModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('stockInForm')?.reset();
  }
}

function closeStockInModal() {
  const modal = document.getElementById('stockInModal');
  if (modal) modal.style.display = 'none';
}

function openStockOutModal() {
  const modal = document.getElementById('stockOutModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('stockOutForm')?.reset();
  }
}

function closeStockOutModal() {
  const modal = document.getElementById('stockOutModal');
  if (modal) modal.style.display = 'none';
}

function openAdjustmentModal() {
  const modal = document.getElementById('adjustmentModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('adjustmentForm')?.reset();
  }
}

function closeAdjustmentModal() {
  const modal = document.getElementById('adjustmentModal');
  if (modal) modal.style.display = 'none';
}

function openBatchModal() {
  const modal = document.getElementById('batchModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('batchForm')?.reset();
  }
}

function closeBatchModal() {
  const modal = document.getElementById('batchModal');
  if (modal) modal.style.display = 'none';
}

function editBatch(batchId) {
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return;

  alert(`Edit batch: ${batch.batch_number}`);
}

// Setup event listeners
function setupEventListeners() {
  // Stock In Form
  const stockInForm = document.getElementById('stockInForm');
  if (stockInForm) {
    stockInForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        item_id: parseInt(document.getElementById('stockInItem').value),
        quantity: parseFloat(document.getElementById('stockInQuantity').value),
        reference: document.getElementById('stockInReference').value,
        notes: document.getElementById('stockInNotes').value,
        type: 'IN'
      };

      try {
        await inventoryAPI.stockIn(data);
        showAlert('Stock added successfully! ✅', 'success');
        closeStockInModal();
        loadData();
      } catch (error) {
        showAlert(error.message || 'Failed to add stock', 'error');
      }
    });
  }

  // Stock Out Form
  const stockOutForm = document.getElementById('stockOutForm');
  if (stockOutForm) {
    stockOutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        item_id: parseInt(document.getElementById('stockOutItem').value),
        quantity: parseFloat(document.getElementById('stockOutQuantity').value),
        reference: document.getElementById('stockOutReference').value,
        notes: document.getElementById('stockOutNotes').value,
        type: 'OUT'
      };

      try {
        await inventoryAPI.stockOut(data);
        showAlert('Stock removed successfully! ✅', 'success');
        closeStockOutModal();
        loadData();
      } catch (error) {
        showAlert(error.message || 'Failed to remove stock', 'error');
      }
    });
  }

  // Adjustment Form
  const adjustmentForm = document.getElementById('adjustmentForm');
  if (adjustmentForm) {
    adjustmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const itemId = parseInt(document.getElementById('adjustmentItem').value);
      const newQty = parseFloat(document.getElementById('adjustmentQuantity').value);
      const item = items.find(i => i.id === itemId);

      if (!item) {
        showAlert('Item not found', 'error');
        return;
      }

      const adjustment = {
        id: Date.now(),
        item_id: itemId,
        item_name: item.name,
        previous_qty: item.stock_quantity || 0,
        new_qty: newQty,
        difference: newQty - (item.stock_quantity || 0),
        reason: document.getElementById('adjustmentReason').value,
        reference: document.getElementById('adjustmentReference').value,
        notes: document.getElementById('adjustmentNotes').value,
        user: 'Admin',
        date: new Date().toISOString()
      };

      try {
        // Update item stock
        await itemsAPI.update(itemId, { stock_quantity: newQty });

        // Add to adjustments
        adjustments.unshift(adjustment);

        showAlert('Stock adjusted successfully! ✅', 'success');
        closeAdjustmentModal();
        loadData();
      } catch (error) {
        showAlert(error.message || 'Failed to adjust stock', 'error');
      }
    });
  }

  // Batch Form
  const batchForm = document.getElementById('batchForm');
  if (batchForm) {
    batchForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const batch = {
        id: Date.now(),
        batch_number: document.getElementById('batchNumber').value,
        item_id: parseInt(document.getElementById('batchItem').value),
        item_name: items.find(i => i.id === parseInt(document.getElementById('batchItem').value))?.name,
        manufacturing_date: document.getElementById('batchMfgDate').value,
        expiry_date: document.getElementById('batchExpDate').value,
        quantity: parseFloat(document.getElementById('batchQuantity').value),
        notes: document.getElementById('batchNotes').value
      };

      batches.unshift(batch);

      showAlert('Batch added successfully! ✅', 'success');
      closeBatchModal();
      renderBatches();
    });
  }

  // Item selection change for adjustment
  const adjustmentItemSelect = document.getElementById('adjustmentItem');
  if (adjustmentItemSelect) {
    adjustmentItemSelect.addEventListener('change', updateCurrentStock);
  }

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateString));
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
}
