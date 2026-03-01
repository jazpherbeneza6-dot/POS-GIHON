// Items management with enhanced features

let items = [];
let itemGroups = [];
let selectedItemId = null;
let filters = {
  category: '',
  stock: '',
  sort: 'name',
  search: ''
};
let poItems = [];
let poSelectedItemId = null;

// POS Cart State
let cart = [];
let currentView = 'list'; // 'list' or 'grid'
let currentDetailItemId = null; // Currently viewed item in detail view
let selectedItems = []; // Array of selected item IDs for bulk actions
let currentItemsFilter = 'active'; // Current filter for items list
let salesFilteredItemIds = null;
let purchaseFilteredItemIds = null;
let sortDirection = 'asc'; // Current sort direction

// Grid view render (stub - grid view uses same data as table)
function renderItemsGrid() {
  // Grid view re-render handled by renderItemsTable's grid mode
}

// ========== ITEM TYPE TOGGLE (Goods vs Service) ==========
function onItemTypeChange() {
  const isService = document.querySelector('input[name="itemType"]:checked')?.value === 'service';
  const goodsOnlyElements = [
    'returnableRow',
    'goodsOnlyDivider',
    'dimensionsWeightRow',
    'manufacturerBrandRow'
  ];
  goodsOnlyElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isService ? 'none' : '';
  });
  // When service mode hides rows, the form gets shorter and the absolutely-positioned
  // image upload area overlaps with UPC/MPN. Add a spacer to prevent this.
  const upcRow = document.getElementById('upcMpnRow');
  if (upcRow) {
    upcRow.style.marginTop = isService ? '80px' : '';
  }
}

// ========== SKU DUPLICATE CHECK FUNCTION ==========
// Check if SKU already exists and show inline error
function checkSkuDuplicate(skuValue) {
  const skuInput = document.getElementById('itemSku');
  const errorNote = document.getElementById('skuErrorNote');
  const currentItemId = document.getElementById('itemId')?.value || '';

  if (!skuValue || skuValue.trim() === '') {
    // No SKU entered, hide error
    if (errorNote) errorNote.style.display = 'none';
    if (skuInput) skuInput.classList.remove('sku-error');
    return;
  }

  // Check if SKU exists in items array
  const skuLower = skuValue.toLowerCase().trim();
  const existingItem = items.find(item => {
    // Skip current item if editing
    if (currentItemId && item.id.toString() === currentItemId.toString()) {
      return false;
    }
    return item.sku && item.sku.toLowerCase() === skuLower;
  });

  if (existingItem) {
    // Show error note
    if (errorNote) errorNote.style.display = 'flex';
    if (skuInput) skuInput.classList.add('sku-error');
  } else {
    // Hide error note
    if (errorNote) errorNote.style.display = 'none';
    if (skuInput) skuInput.classList.remove('sku-error');
  }
}

// ========== ITEMS FILTER DROPDOWN FUNCTIONS ==========
function toggleItemsFilter(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('itemsFilterDropdown');
  const menu = document.getElementById('itemsFilterMenu');

  if (menu.classList.contains('show')) {
    menu.classList.remove('show');
    dropdown.classList.remove('open');
  } else {
    menu.classList.add('show');
    dropdown.classList.add('open');
    document.getElementById('itemsFilterSearch').focus();
  }
}

function closeItemsFilter() {
  const dropdown = document.getElementById('itemsFilterDropdown');
  const menu = document.getElementById('itemsFilterMenu');
  if (menu) menu.classList.remove('show');
  if (dropdown) dropdown.classList.remove('open');
}

function filterItemsOptions() {
  const searchValue = document.getElementById('itemsFilterSearch').value.toLowerCase();
  const options = document.querySelectorAll('.items-filter-option');

  options.forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = text.includes(searchValue) ? 'flex' : 'none';
  });
}

function selectItemsFilter(filterKey, filterLabel) {
  event.stopPropagation();
  currentItemsFilter = filterKey;

  // Clear advanced search when changing filters
  isAdvancedSearchActive = false;
  advancedSearchResults = null;

  // Update title
  document.getElementById('itemsFilterTitle').textContent = filterLabel;

  // Update selected state
  document.querySelectorAll('.items-filter-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  document.querySelector(`[data-filter="${filterKey}"]`)?.classList.add('selected');

  // Close dropdown
  closeItemsFilter();

  // Apply filter and re-render
  applyItemsFilter();
}

async function applyItemsFilter() {
  // For most filters, just re-render - the filtering is done in renderItemsTable
  // Special handling for sales and purchases which need async API calls

  switch (currentItemsFilter) {
    case 'sales':
      // Show items that have been part of sales orders or invoices
      try {
        const salesRes = await fetch('/api/items/filter/sales-item-ids');
        if (!salesRes.ok) {
          console.error('Sales filter API returned:', salesRes.status);
          showToast('No items found in sales transactions', 'info');
          renderItemsTable();
          renderItemsGrid();
          return;
        }
        const soldIds = await salesRes.json();
        const soldIdSet = new Set(soldIds.map(id => parseInt(id)));
        // Filter the items array
        salesFilteredItemIds = soldIdSet;
        renderItemsTable();
        renderItemsGrid();
        salesFilteredItemIds = null;
      } catch (error) {
        console.error('Error fetching sales items:', error);
        showToast('Error loading sales items', 'error');
        renderItemsTable();
        renderItemsGrid();
      }
      return;

    case 'purchases':
      // Show items that have been part of purchase orders
      try {
        const purchaseRes = await fetch('/api/items/filter/purchase-item-ids');
        if (!purchaseRes.ok) {
          console.error('Purchase filter API returned:', purchaseRes.status);
          showToast('No items found in purchase transactions', 'info');
          renderItemsTable();
          renderItemsGrid();
          return;
        }
        const purchasedIds = await purchaseRes.json();
        const purchasedIdSet = new Set(purchasedIds.map(id => parseInt(id)));
        purchaseFilteredItemIds = purchasedIdSet;
        renderItemsTable();
        renderItemsGrid();
        purchaseFilteredItemIds = null;
      } catch (error) {
        console.error('Error fetching purchase items:', error);
        showToast('Error loading purchase items', 'error');
        renderItemsTable();
        renderItemsGrid();
      }
      return;

    default:
      // For all other filters (all, active, inactive, ungrouped, lowstock, inventory)
      // the filtering is handled inside renderItemsTable
      break;
  }

  // Re-render with current filter
  renderItemsTable();
  renderItemsGrid();
}

function createNewCustomView() {
  event.stopPropagation();
  closeItemsFilter();
  showToast('Custom View feature coming soon', 'info');
}

// Close filter dropdown when clicking outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.items-filter-dropdown')) {
    closeItemsFilter();
  }
});

// ========== ITEM DETAIL TAB FUNCTIONS ==========
let itemTransactions = [];

function switchItemDetailTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.item-detail-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  if (tabName === 'overview') {
    document.getElementById('overviewPane')?.classList.add('active');
  } else if (tabName === 'transactions') {
    document.getElementById('transactionsPane')?.classList.add('active');
    loadItemTransactions(currentDetailItemId);
  } else if (tabName === 'history') {
    document.getElementById('historyPane')?.classList.add('active');
    loadItemHistory(currentDetailItemId);
  }
}

async function loadItemTransactions(itemId) {
  if (!itemId) return;

  itemTransactions = [];

  try {
    const response = await fetch(`/api/items/${itemId}/transactions?type=all`);
    if (response.ok) {
      const transactions = await response.json();
      itemTransactions = transactions.map(t => ({
        type: t.type,
        date: t.date,
        reference: t.reference || '-',
        party_name: t.party_name || '-',
        quantity: parseFloat(t.quantity) || 0,
        price: parseFloat(t.price) || 0,
        total: parseFloat(t.total) || 0,
        status: t.status || 'unknown',
        payment_status: t.payment_status || t.status || 'unknown'
      }));
    }

    renderTransactionsTable();
  } catch (error) {
    console.error('Error loading transactions:', error);
    renderTransactionsTable();
  }
}

function toggleTxnFilterDropdown() {
  document.getElementById('txnStatusDropdown')?.classList.remove('open');
  document.getElementById('txnFilterDropdown')?.classList.toggle('open');
}

function toggleTxnStatusDropdown() {
  document.getElementById('txnFilterDropdown')?.classList.remove('open');
  document.getElementById('txnStatusDropdown')?.classList.toggle('open');
}

function selectTxnFilter(el) {
  const value = el.dataset.value;
  const label = el.textContent.trim();
  document.getElementById('transactionFilterType').value = value;
  document.getElementById('txnFilterBtnText').textContent = label;
  // Update checkmarks
  el.closest('.txn-filter-dropdown').querySelectorAll('.check').forEach(c => c.textContent = '');
  el.querySelector('.check').textContent = '✓';
  document.getElementById('txnFilterDropdown').classList.remove('open');
  filterTransactions();
}

function selectTxnStatus(el) {
  const value = el.dataset.value;
  const label = el.textContent.trim();
  document.getElementById('transactionStatusFilter').value = value;
  document.getElementById('txnStatusBtnText').textContent = label;
  el.closest('.txn-filter-dropdown').querySelectorAll('.check').forEach(c => c.textContent = '');
  el.querySelector('.check').textContent = '✓';
  document.getElementById('txnStatusDropdown').classList.remove('open');
  filterTransactions();
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.filter-select-wrapper')) {
    document.querySelectorAll('.txn-filter-dropdown').forEach(d => d.classList.remove('open'));
  }
});

function filterTransactions() {
  renderTransactionsTable();
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transactionsTableBody');
  const thead = document.getElementById('transactionsTableHead');
  if (!tbody) return;

  const typeFilter = document.getElementById('transactionFilterType')?.value || 'sales';
  const statusFilter = document.getElementById('transactionStatusFilter')?.value || 'all';

  // Update table headers based on selected filter type
  const headerConfig = {
    sales: { order: 'SALES ORDER#', party: 'CUSTOMER NAME', qty: 'QUANTITY SOLD' },
    invoices: { order: 'INVOICE#', party: 'CUSTOMER NAME', qty: 'QUANTITY' },
    credit_notes: { order: 'CREDIT NOTE#', party: 'CUSTOMER NAME', qty: 'QUANTITY' },
    sales_receipts: { order: 'RECEIPT#', party: 'CUSTOMER NAME', qty: 'QUANTITY' },
    purchases: { order: 'PURCHASE ORDER#', party: 'VENDOR NAME', qty: 'QUANTITY ORDERED' },
    bills: { order: 'BILL#', party: 'VENDOR NAME', qty: 'QUANTITY' },
    vendor_credits: { order: 'VENDOR CREDIT#', party: 'VENDOR NAME', qty: 'QUANTITY' },
    transfer_orders: { order: 'TRANSFER#', party: 'DESTINATION', qty: 'QUANTITY' },
    adjustments: { order: 'REFERENCE#', party: 'REASON', qty: 'QUANTITY ADJUSTED' }
  };

  const headers = headerConfig[typeFilter] || headerConfig.sales;

  if (thead) {
    thead.innerHTML = `
      <tr>
        <th class="sortable">DATE <span class="sort-icon">↓</span></th>
        <th>${headers.order}</th>
        <th>${headers.party}</th>
        <th>${headers.qty}</th>
        <th>PRICE</th>
        <th>TOTAL</th>
        <th>STATUS</th>
      </tr>
    `;
  }

  let filteredTransactions = [...itemTransactions];

  // Map API type values to filter type values
  const typeMapping = {
    'sales': ['Sales Order'],
    'invoices': ['Invoice'],
    'credit_notes': ['Credit Note'],
    'sales_receipts': ['Sales Receipt'],
    'purchases': ['Purchase Order'],
    'bills': ['Bill'],
    'vendor_credits': ['Vendor Credit'],
    'transfer_orders': ['Transfer Order'],
    'adjustments': ['Inventory Adjustment']
  };

  // Apply type filter
  const matchTypes = typeMapping[typeFilter] || [];
  filteredTransactions = filteredTransactions.filter(t => matchTypes.includes(t.type));

  // Apply status filter
  if (statusFilter !== 'all') {
    filteredTransactions = filteredTransactions.filter(t =>
      t.status.toLowerCase() === statusFilter.toLowerCase()
    );
  }

  if (filteredTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="transactions-empty">No transactions found for this item</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredTransactions.map(t => {
    const date = new Date(t.date);
    const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const price = parseFloat(t.price) || 0;
    const qty = parseFloat(t.quantity) || 0;
    const total = parseFloat(t.total) || 0;

    // Clean quantity display (no trailing zeros)
    const qtyDisplay = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2);

    // Status styling - include PAID
    const statusUpper = (t.payment_status || t.status || '').toUpperCase();
    let statusStyle = '';
    let statusText = '';
    if (statusUpper === 'PAID') {
      statusStyle = 'color:#166534;background:#dcfce7';
      statusText = 'Paid';
    } else if (statusUpper === 'CONFIRMED' || statusUpper === 'COMPLETED' || statusUpper === 'RECEIVED' || statusUpper === 'ADJUSTED') {
      statusStyle = 'color:#166534;background:#dcfce7';
      statusText = statusUpper.charAt(0) + statusUpper.slice(1).toLowerCase();
    } else if (statusUpper === 'DRAFT') {
      statusStyle = 'color:#6b7280;background:#f3f4f6';
      statusText = 'Draft';
    } else if (statusUpper === 'ORDERED' || statusUpper === 'PENDING' || statusUpper === 'CLOSED') {
      statusStyle = 'color:#92400e;background:#fef3c7';
      statusText = statusUpper.charAt(0) + statusUpper.slice(1).toLowerCase();
    } else if (statusUpper === 'CANCELLED') {
      statusStyle = 'color:#991b1b;background:#fee2e2';
      statusText = 'Cancelled';
    } else {
      statusText = t.status ? t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase() : '-';
    }

    return `
      <tr>
        <td>${dateStr}</td>
        <td style="color:#3b82f6;font-weight:500;">${t.reference}</td>
        <td>${t.party_name}</td>
        <td>${qtyDisplay}</td>
        <td>${price > 0 ? 'PHP' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td>${total > 0 ? 'PHP' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td><span style="padding:2px 10px;border-radius:4px;font-size:12px;${statusStyle}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

// ========== ITEM HISTORY FUNCTIONS ==========
let itemHistory = [];

async function loadItemHistory(itemId) {
  if (!itemId) return;

  try {
    const res = await fetch(`/api/items/${itemId}/history`);
    if (res.ok) {
      itemHistory = await res.json();
    } else {
      // Fallback: build from item data
      const item = items.find(i => i.id == itemId);
      itemHistory = [];
      if (item) {
        if (item.created_at) {
          itemHistory.push({ date: item.created_at, action: 'created', details: `Item "${item.name}" was created`, user: 'System', type: 'system' });
        }
        if (item.updated_at && item.updated_at !== item.created_at) {
          itemHistory.push({ date: item.updated_at, action: 'updated', details: `Item "${item.name}" was updated`, user: 'System', type: 'system' });
        }
      }
    }

    renderHistoryTable();
  } catch (error) {
    console.error('Error loading history:', error);
    itemHistory = [];
    renderHistoryTable();
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (itemHistory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="transactions-empty">No history found for this item</td>
      </tr>
    `;
    return;
  }

  const actionIcons = {
    'created': '➕',
    'updated': '✏️',
    'stock_adjusted': '📦',
    'deleted': '🗑️',
    'status_change': '🔄'
  };

  const actionColors = {
    'created': '#10b981',
    'updated': '#3b82f6',
    'stock_adjusted': '#f59e0b',
    'deleted': '#ef4444',
    'status_change': '#8b5cf6'
  };

  tbody.innerHTML = itemHistory.map(h => {
    const date = new Date(h.date);
    const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const icon = actionIcons[h.action] || 'ℹ️';
    const color = actionColors[h.action] || '#6b7280';
    const typeBadge = h.type === 'adjustment' ? '<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:6px;">Adjustment</span>' :
      h.type === 'activity' ? '<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:6px;">Activity</span>' : '';

    return `
      <tr>
        <td class="history-date" style="white-space:nowrap;color:#3b82f6;">${dateStr} ${timeStr}</td>
        <td class="history-details">
          <span style="margin-right:4px;">${icon}</span>
          <span class="change-highlight">${h.details}</span>${typeBadge}
          <span class="user-name" style="margin-left:4px;"> - ${h.user}</span>
        </td>
      </tr>
    `;
  }).join('');
}

// ========== ADJUST STOCK FUNCTIONS ==========
let adjustStockItemId = null;

function openAdjustStockModal() {
  if (!currentDetailItemId) {
    showToast('Please select an item first', 'error');
    return;
  }

  adjustStockItemId = currentDetailItemId;
  const item = items.find(i => i.id == adjustStockItemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  // Set title
  document.getElementById('adjustStockTitle').textContent = `Adjust Stock - ${item.name}`;

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('adjustStockDate').value = today;

  // Set quantity available
  const qtyAvailable = parseFloat(item.stock_quantity) || 0;
  document.getElementById('adjustQuantityAvailable').value = qtyAvailable.toFixed(6);

  // Set cost price
  const costPrice = parseFloat(item.purchase_cost) || parseFloat(item.cost) || 0;
  document.getElementById('adjustCostPrice').value = costPrice.toFixed(0);

  // Set value fields
  const currentValue = qtyAvailable * costPrice;
  document.getElementById('adjustCurrentValue').value = 'PHP' + currentValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('adjustCurrentValue').dataset.rawValue = currentValue;
  document.getElementById('adjustChangedValue').value = '0.00';
  document.getElementById('adjustValueAdjusted').value = '';

  // Reset other fields
  document.getElementById('adjustNewQuantity').value = '0.00';
  document.getElementById('adjustQuantityAdjusted').value = '';
  document.getElementById('adjustStockReference').value = '';
  document.getElementById('adjustStockReason').value = '';
  document.getElementById('adjustStockDescription').value = '';

  // Reset to Quantity mode
  document.querySelector('input[name="adjustmentType"][value="quantity"]').checked = true;
  document.getElementById('qtyAdjustSection').style.display = '';
  document.getElementById('valueAdjustSection').style.display = 'none';

  // Set up mode toggle listeners
  document.querySelectorAll('input[name="adjustmentType"]').forEach(radio => {
    radio.onchange = function () {
      if (this.value === 'value') {
        document.getElementById('qtyAdjustSection').style.display = 'none';
        document.getElementById('valueAdjustSection').style.display = '';
      } else {
        document.getElementById('qtyAdjustSection').style.display = '';
        document.getElementById('valueAdjustSection').style.display = 'none';
      }
    };
  });

  // Set up input events for quantity bidirectional calculation
  const qtyAdjustedEl = document.getElementById('adjustQuantityAdjusted');
  const newQtyEl = document.getElementById('adjustNewQuantity');
  const newQtyAdjustedEl = qtyAdjustedEl.cloneNode(true);
  qtyAdjustedEl.parentNode.replaceChild(newQtyAdjustedEl, qtyAdjustedEl);
  const newNewQtyEl = newQtyEl.cloneNode(true);
  newQtyEl.parentNode.replaceChild(newNewQtyEl, newQtyEl);
  newQtyAdjustedEl.addEventListener('input', calculateNewQuantity);
  newNewQtyEl.addEventListener('input', calculateQuantityAdjusted);

  // Set up value input calculation
  const changedValEl = document.getElementById('adjustChangedValue');
  changedValEl.oninput = function () {
    calculateValueAdjusted();
  };

  // Close item detail view and show adjust stock overlay
  document.getElementById('itemDetailOverlay').classList.remove('active');
  document.getElementById('adjustStockOverlay').classList.add('active');
}

function calculateValueAdjusted() {
  const currentValue = parseFloat(document.getElementById('adjustCurrentValue').dataset.rawValue) || 0;
  const changedValue = parseFloat(document.getElementById('adjustChangedValue').value) || 0;
  const adjusted = changedValue - currentValue;
  const sign = adjusted >= 0 ? '+' : '';
  document.getElementById('adjustValueAdjusted').value = sign + adjusted.toFixed(2);
}

function closeAdjustStockModal() {
  document.getElementById('adjustStockOverlay').classList.remove('active');
  adjustStockItemId = null;
}

function calculateNewQuantity() {
  const qtyAvailable = parseFloat(document.getElementById('adjustQuantityAvailable').value) || 0;
  const qtyAdjusted = parseFloat(document.getElementById('adjustQuantityAdjusted').value) || 0;
  const newQty = qtyAvailable + qtyAdjusted;
  document.getElementById('adjustNewQuantity').value = newQty.toFixed(2);
}

function calculateQuantityAdjusted() {
  const qtyAvailable = parseFloat(document.getElementById('adjustQuantityAvailable').value) || 0;
  const newQty = parseFloat(document.getElementById('adjustNewQuantity').value) || 0;
  const qtyAdjusted = newQty - qtyAvailable;
  const sign = qtyAdjusted >= 0 ? '+' : '';
  document.getElementById('adjustQuantityAdjusted').value = sign + qtyAdjusted.toFixed(2);
}

async function saveAdjustmentAsDraft() {
  await submitStockAdjustment('draft');
}

async function convertToAdjusted() {
  await submitStockAdjustment('adjusted');
}

async function submitStockAdjustment(status) {
  const reason = document.getElementById('adjustStockReason').value;
  if (!reason) {
    showToast('Please select a reason', 'error');
    return;
  }

  const adjustmentType = document.querySelector('input[name="adjustmentType"]:checked')?.value || 'quantity';

  let adjustedValue;
  if (adjustmentType === 'value') {
    // Value mode: send the value delta (Changed Value - Current Value)
    const currentValue = parseFloat(document.getElementById('adjustCurrentValue').dataset.rawValue) || 0;
    const changedValue = parseFloat(document.getElementById('adjustChangedValue').value) || 0;
    adjustedValue = changedValue - currentValue;
    if (adjustedValue === 0) {
      showToast('Changed value must be different from current value', 'error');
      return;
    }
  } else {
    // Quantity mode
    adjustedValue = parseFloat(document.getElementById('adjustQuantityAdjusted').value);
    if (!adjustedValue || adjustedValue === 0) {
      showToast('Please enter a quantity to adjust', 'error');
      return;
    }
  }

  const item = items.find(i => i.id == adjustStockItemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  try {
    const referenceNumber = document.getElementById('adjustStockReference').value || '';
    const description = document.getElementById('adjustStockDescription').value || '';
    const account = document.getElementById('adjustStockAccount').value || '';

    const response = await fetch('/api/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_number: referenceNumber || undefined,
        mode: adjustmentType,
        reason: reason,
        description: description,
        account: account,
        status: status,
        items: [{
          item_id: adjustStockItemId,
          quantity_adjusted: adjustedValue
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create adjustment');
    }

    if (status === 'adjusted') {
      showToast(`${adjustmentType === 'value' ? 'Value' : 'Inventory'} Adjustment Applied`, 'success');
    } else {
      showToast('Adjustment saved as draft', 'success');
    }

    closeAdjustStockModal();

    // Reload items and re-open detail view for the adjusted item
    const adjustedItemId = adjustStockItemId;
    await loadItems();
    if (typeof showItemDetail === 'function') {
      showItemDetail(adjustedItemId);
    }
  } catch (error) {
    console.error('Error creating adjustment:', error);
    showToast(error.message || 'Error creating adjustment', 'error');
  }
}

// ========== ADVANCED SEARCH MODAL FUNCTIONS ==========
function openAdvancedSearch() {
  const overlay = document.getElementById('advSearchOverlay');
  if (overlay) {
    overlay.classList.add('active');

    // Populate Brand dropdown from existing items
    const brandSelect = document.getElementById('advSearchBrand');
    if (brandSelect && brandSelect.options.length <= 1) {
      const brands = [...new Set(items.filter(i => i.brand).map(i => i.brand))].sort();
      brands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        brandSelect.appendChild(opt);
      });
    }

    // Populate Manufacturer dropdown from existing items
    const mfgSelect = document.getElementById('advSearchManufacturer');
    if (mfgSelect && mfgSelect.options.length <= 1) {
      const manufacturers = [...new Set(items.filter(i => i.manufacturer).map(i => i.manufacturer))].sort();
      manufacturers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        mfgSelect.appendChild(opt);
      });
    }
  }
}

function closeAdvancedSearch() {
  const overlay = document.getElementById('advSearchOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  // Reset all fields
  const fieldIds = [
    'advSearchName', 'advSearchDescription', 'advSearchBrand', 'advSearchUPC',
    'advSearchISBN', 'advSearchPurchaseRate', 'advSearchSalesTax', 'advSearchPurchaseAccount',
    'advSearchSKU', 'advSearchManufacturer', 'advSearchEAN', 'advSearchMPN',
    'advSearchRate', 'advSearchStatus', 'advSearchSalesAccount', 'advSearchSerialNumber'
  ];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function executeAdvancedSearch() {
  const criteria = {
    name: document.getElementById('advSearchName')?.value?.trim().toLowerCase(),
    description: document.getElementById('advSearchDescription')?.value?.trim().toLowerCase(),
    brand: document.getElementById('advSearchBrand')?.value,
    upc: document.getElementById('advSearchUPC')?.value?.trim().toLowerCase(),
    isbn: document.getElementById('advSearchISBN')?.value?.trim().toLowerCase(),
    purchase_rate: document.getElementById('advSearchPurchaseRate')?.value,
    sales_tax: document.getElementById('advSearchSalesTax')?.value,
    purchase_account: document.getElementById('advSearchPurchaseAccount')?.value,
    sku: document.getElementById('advSearchSKU')?.value?.trim().toLowerCase(),
    manufacturer: document.getElementById('advSearchManufacturer')?.value,
    ean: document.getElementById('advSearchEAN')?.value?.trim().toLowerCase(),
    mpn: document.getElementById('advSearchMPN')?.value?.trim().toLowerCase(),
    rate: document.getElementById('advSearchRate')?.value,
    status: document.getElementById('advSearchStatus')?.value,
    sales_account: document.getElementById('advSearchSalesAccount')?.value,
    serial_number: document.getElementById('advSearchSerialNumber')?.value?.trim().toLowerCase()
  };

  // Check if any criteria is set
  const hasCriteria = Object.values(criteria).some(v => v !== '' && v !== undefined && v !== null);
  if (!hasCriteria) {
    showToast('Please enter at least one search criteria', 'info');
    return;
  }

  // Filter items
  const filtered = items.filter(item => {
    if (criteria.name && !(item.name || '').toLowerCase().includes(criteria.name)) return false;
    if (criteria.description && !(item.description || '').toLowerCase().includes(criteria.description)) return false;
    if (criteria.brand && item.brand !== criteria.brand) return false;
    if (criteria.upc && !(item.upc || '').toLowerCase().includes(criteria.upc)) return false;
    if (criteria.isbn && !(item.isbn || '').toLowerCase().includes(criteria.isbn)) return false;
    if (criteria.purchase_rate && parseFloat(item.purchase_cost || 0) !== parseFloat(criteria.purchase_rate)) return false;
    if (criteria.sales_tax && item.sales_tax !== criteria.sales_tax) return false;
    if (criteria.purchase_account && item.purchase_account !== criteria.purchase_account) return false;
    if (criteria.sku && !(item.sku || '').toLowerCase().includes(criteria.sku)) return false;
    if (criteria.manufacturer && item.manufacturer !== criteria.manufacturer) return false;
    if (criteria.ean && !(item.ean || '').toLowerCase().includes(criteria.ean)) return false;
    if (criteria.mpn && !(item.mpn || '').toLowerCase().includes(criteria.mpn)) return false;
    if (criteria.rate && parseFloat(item.selling_price || 0) !== parseFloat(criteria.rate)) return false;
    if (criteria.status && item.status !== criteria.status) return false;
    if (criteria.sales_account && item.sales_account !== criteria.sales_account) return false;
    if (criteria.serial_number && !(item.serial_number || '').toLowerCase().includes(criteria.serial_number)) return false;
    return true;
  });

  // Close modal
  const overlay = document.getElementById('advSearchOverlay');
  if (overlay) overlay.classList.remove('active');

  // Apply filtered results to the table
  advancedSearchResults = filtered;
  isAdvancedSearchActive = true;
  renderItemsTable();
  renderItemsGrid();

  showToast(`Found ${filtered.length} item(s) matching your search`, 'success');
}

// Track advanced search state
let advancedSearchResults = null;
let isAdvancedSearchActive = false;

// Close advanced search on backdrop click
document.addEventListener('mousedown', function (e) {
  const overlay = document.getElementById('advSearchOverlay');
  if (overlay && overlay.classList.contains('active') && e.target === overlay) {
    closeAdvancedSearch();
  }
});

// ========== BULK ACTION TOOLBAR FUNCTIONS ==========
function updateBulkActionToolbar() {
  const toolbar = document.getElementById('bulkActionToolbar');
  const countEl = document.getElementById('selectedItemCount');
  const header = document.querySelector('.zoho-items-header');

  if (!toolbar || !countEl) return;

  if (selectedItems.length > 0) {
    toolbar.classList.add('active');
    countEl.textContent = selectedItems.length;
    if (header) header.style.display = 'none';
  } else {
    toolbar.classList.remove('active');
    if (header) header.style.display = 'flex';
  }
}



function selectAllItems() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  selectedItems = [];
  checkboxes.forEach(cb => {
    cb.checked = true;
    selectedItems.push(parseInt(cb.dataset.itemId));
  });
  updateBulkActionToolbar();
}

function deselectAllItems() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  selectedItems = [];
  updateBulkActionToolbar();
}

// Bulk Update functionality
let selectedBulkField = null;

function bulkUpdate() {
  if (selectedItems.length === 0) {
    showToast('No items selected', 'error');
    return;
  }
  openBulkUpdateModal();
}

// New Transaction dropdown functionality
function toggleNewTransactionDropdown() {
  const menu = document.getElementById('newTransactionMenu');
  const btn = document.querySelector('.bulk-action-btn-dropdown');

  if (menu.classList.contains('show')) {
    closeNewTransactionDropdown();
  } else {
    menu.classList.add('show');
    btn.classList.add('active');
  }
}

function closeNewTransactionDropdown() {
  const menu = document.getElementById('newTransactionMenu');
  const btn = document.querySelector('.bulk-action-btn-dropdown');

  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');
}

function selectTransaction(type) {
  // Close dropdown
  closeNewTransactionDropdown();

  // Navigate directly to create new transaction pages with selected items
  switch (type) {
    case 'sales_order':
      window.location.href = '/new-sales-order.html?items=' + selectedItems.join(',');
      break;
    case 'invoice':
      window.location.href = '/new-invoice.html?items=' + selectedItems.join(',');
      break;
    case 'sales_receipt':
      window.location.href = '/new-sales-receipt.html?items=' + selectedItems.join(',');
      break;
    case 'purchase_order':
      window.location.href = '/new-purchase-order.html?items=' + selectedItems.join(',');
      break;
    case 'bill':
      window.location.href = '/new-bill.html?items=' + selectedItems.join(',');
      break;
    default:
      showToast('Unknown transaction type', 'error');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.new-transaction-dropdown')) {
    closeNewTransactionDropdown();
  }
  if (!e.target.closest('.zoho-more-dropdown')) {
    closeMoreDropdown();
  }
});

// More dropdown functionality
function toggleMoreDropdown() {
  const menu = document.getElementById('moreDropdownMenu');
  if (menu.classList.contains('show')) {
    closeMoreDropdown();
  } else {
    menu.classList.add('show');
  }
}

function closeMoreDropdown() {
  const menu = document.getElementById('moreDropdownMenu');
  if (menu) menu.classList.remove('show');
}

function showSortSubmenu() {
  const submenu = document.getElementById('sortSubmenu');
  if (submenu) submenu.style.display = 'block';
}

function hideSortSubmenu() {
  const submenu = document.getElementById('sortSubmenu');
  if (submenu) submenu.style.display = 'none';
}

function sortItemsBy(field, direction) {
  // If clicking same field, toggle direction; otherwise set to given direction
  if (filters.sort === field) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortDirection = direction || 'asc';
  }
  filters.sort = field;

  // Update selected state and arrow
  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.classList.remove('selected');
    const arrow = opt.querySelector('.sort-arrow');
    if (arrow) arrow.remove();
  });
  const clicked = event.target.closest('.sort-option');
  if (clicked) {
    clicked.classList.add('selected');
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'sort-arrow';
    arrowSpan.textContent = sortDirection === 'asc' ? '↑' : '↓';
    clicked.appendChild(arrowSpan);
  }

  // Re-render with new sort
  renderItemsTable();
  closeMoreDropdown();
  const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  // Contextual direction labels
  let dirLabel;
  if (['purchase_rate', 'rate', 'stock_on_hand', 'reorder_level'].includes(field)) {
    dirLabel = sortDirection === 'asc' ? 'Lowest→Highest' : 'Highest→Lowest';
  } else if (['created_time', 'last_modified_time'].includes(field)) {
    dirLabel = sortDirection === 'asc' ? 'Oldest→Newest' : 'Newest→Oldest';
  } else {
    dirLabel = sortDirection === 'asc' ? 'A→Z' : 'Z→A';
  }
  showToast(`Sorted by ${fieldLabel} (${dirLabel})`, 'success');
}

function refreshItemsList() {
  loadItems();
  showToast('List refreshed', 'success');
}

function resetColumnWidth() {
  // Reset any custom column widths
  const table = document.querySelector('.items-table');
  if (table) {
    table.querySelectorAll('th, td').forEach(cell => {
      cell.style.width = '';
      cell.style.minWidth = '';
    });
  }
  showToast('Column widths reset', 'success');
}

function openImportModal() {
  showToast('Import feature coming soon', 'info');
}

function importItems() {
  // Create a hidden file input for CSV
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;

    showToast('Reading CSV file...', 'info');

    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const csvText = e.target.result;
        const rows = parseCSV(csvText);

        if (rows.length < 2) {
          showToast('CSV file is empty or has no data rows', 'error');
          return;
        }

        // First row is the header
        const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        const dataRows = rows.slice(1);

        let imported = 0;
        let failed = 0;

        for (const row of dataRows) {
          if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

          const rowData = {};
          headers.forEach((header, idx) => {
            rowData[header] = row[idx]?.trim() || '';
          });

          // Map CSV columns to API fields
          const itemPayload = {
            name: rowData['name'] || rowData['item_name'] || rowData['item'] || '',
            sku: rowData['sku'] || '',
            unit: rowData['unit'] || 'pcs',
            quantity: parseInt(rowData['stock_on_hand'] || rowData['quantity'] || rowData['stock'] || '0') || 0,
            reorder_point: parseInt(rowData['reorder_level'] || rowData['reorder_point'] || '10') || 10,
            price: parseFloat(rowData['rate'] || rowData['price'] || rowData['selling_price'] || '0') || 0,
            cost: parseFloat(rowData['purchase_rate'] || rowData['cost'] || rowData['purchase_cost'] || '0') || 0,
            description: rowData['description'] || '',
            brand: rowData['brand'] || '',
            manufacturer: rowData['manufacturer'] || '',
            upc: rowData['upc'] || '',
            ean: rowData['ean'] || '',
            isbn: rowData['isbn'] || '',
            type: rowData['type'] || 'goods',
            status: rowData['status'] || 'active'
          };

          if (!itemPayload.name) {
            failed++;
            continue;
          }

          try {
            const response = await fetch('/api/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(itemPayload)
            });

            if (response.ok) {
              imported++;
            } else {
              const errorData = await response.json();
              console.warn(`Failed to import "${itemPayload.name}":`, errorData.error);
              failed++;
            }
          } catch (err) {
            console.error(`Error importing "${itemPayload.name}":`, err);
            failed++;
          }
        }

        // Reload items after import
        await loadItems();
        renderItemsTable();
        renderItemsGrid();

        if (failed > 0) {
          showToast(`Imported ${imported} item(s). ${failed} failed.`, 'warning');
        } else {
          showToast(`Successfully imported ${imported} item(s)!`, 'success');
        }
      } catch (error) {
        console.error('CSV parse error:', error);
        showToast('Failed to parse CSV file', 'error');
      }
    };
    reader.readAsText(file);

    // Clean up
    document.body.removeChild(fileInput);
  });

  fileInput.click();
}

// CSV parser that handles quoted fields with commas
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // skip \n in \r\n
      } else {
        currentField += char;
      }
    }
  }

  // Push the last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function importItemImages() {
  // Create a hidden file input for multiple images
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async function () {
    const files = Array.from(this.files);
    if (files.length === 0) return;

    showToast(`Processing ${files.length} image(s)...`, 'info');

    let matched = 0;
    let notFound = 0;

    for (const file of files) {
      // Extract SKU from filename (remove extension)
      const fileName = file.name;
      const skuFromFile = fileName.substring(0, fileName.lastIndexOf('.')).trim();

      if (!skuFromFile) {
        notFound++;
        continue;
      }

      // Find matching item by SKU
      const matchingItem = items.find(item =>
        item.sku && item.sku.toLowerCase() === skuFromFile.toLowerCase()
      );

      if (!matchingItem) {
        console.warn(`No item found with SKU: "${skuFromFile}" (file: ${fileName})`);
        notFound++;
        continue;
      }

      // Convert image to base64 data URI
      try {
        const dataUrl = await readFileAsDataURL(file);

        const response = await fetch(`/api/items/${matchingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: dataUrl })
        });

        if (response.ok) {
          matched++;
        } else {
          console.warn(`Failed to update image for item ${matchingItem.name}`);
          notFound++;
        }
      } catch (err) {
        console.error(`Error uploading image for SKU "${skuFromFile}":`, err);
        notFound++;
      }
    }

    // Reload items after image import
    await loadItems();
    renderItemsTable();
    renderItemsGrid();

    if (notFound > 0) {
      showToast(`Updated ${matched} image(s). ${notFound} skipped (no SKU match or error).`, 'warning');
    } else {
      showToast(`Successfully updated ${matched} image(s)!`, 'success');
    }

    // Clean up
    document.body.removeChild(fileInput);
  });

  fileInput.click();
}

// Helper: read a File as base64 data URL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openExportModal() {
  showToast('Use the Export submenu from the kebab menu', 'info');
}

function exportItems() {
  if (!items || items.length === 0) {
    showToast('No items to export', 'info');
    return;
  }

  // CSV columns
  const headers = ['Name', 'SKU', 'Type', 'Stock on Hand', 'Reorder Level', 'Rate', 'Purchase Rate', 'Brand', 'Manufacturer', 'Description', 'UPC', 'EAN', 'ISBN', 'Unit', 'Status'];

  const csvRows = [headers.join(',')];

  items.forEach(item => {
    const row = [
      escapeCSV(item.name || ''),
      escapeCSV(item.sku || ''),
      escapeCSV(item.type || 'goods'),
      item.stock_quantity || 0,
      item.reorder_point || 0,
      item.selling_price || 0,
      item.purchase_cost || 0,
      escapeCSV(item.brand || ''),
      escapeCSV(item.manufacturer || ''),
      escapeCSV(item.description || ''),
      escapeCSV(item.upc || ''),
      escapeCSV(item.ean || ''),
      escapeCSV(item.isbn || ''),
      escapeCSV(item.unit || 'pcs'),
      escapeCSV(item.status || 'active')
    ];
    csvRows.push(row.join(','));
  });

  downloadCSV(csvRows.join('\n'), 'GiHon_All_Items.csv');
  showToast(`Exported ${items.length} item(s) to GiHon_All_Items.csv`, 'success');
}

function exportCurrentView() {
  // Get the visible items from the table DOM
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) {
    showToast('No items table found', 'error');
    return;
  }

  const rows = tbody.querySelectorAll('tr');
  const visibleItemIds = [];

  rows.forEach(row => {
    const onclick = row.getAttribute('onclick') || '';
    const match = onclick.match(/selectItem\((\d+)\)/);
    if (match) {
      visibleItemIds.push(parseInt(match[1]));
    }
    // Also check data attribute
    const dataId = row.getAttribute('data-item-id');
    if (dataId) {
      visibleItemIds.push(parseInt(dataId));
    }
  });

  // Get items matching visible rows, or fall back to filtered items
  let filteredItems;
  if (visibleItemIds.length > 0) {
    filteredItems = items.filter(item => visibleItemIds.includes(item.id));
  } else if (isAdvancedSearchActive && advancedSearchResults) {
    filteredItems = advancedSearchResults;
  } else {
    filteredItems = items;
  }

  if (filteredItems.length === 0) {
    showToast('No items in current view to export', 'info');
    return;
  }

  const headers = ['Name', 'SKU', 'Type', 'Stock on Hand', 'Reorder Level', 'Rate', 'Purchase Rate', 'Brand', 'Manufacturer', 'Description', 'UPC', 'EAN', 'ISBN', 'Unit', 'Status'];

  const csvRows = [headers.join(',')];

  filteredItems.forEach(item => {
    const row = [
      escapeCSV(item.name || ''),
      escapeCSV(item.sku || ''),
      escapeCSV(item.type || 'goods'),
      item.stock_quantity || 0,
      item.reorder_point || 0,
      item.selling_price || 0,
      item.purchase_cost || 0,
      escapeCSV(item.brand || ''),
      escapeCSV(item.manufacturer || ''),
      escapeCSV(item.description || ''),
      escapeCSV(item.upc || ''),
      escapeCSV(item.ean || ''),
      escapeCSV(item.isbn || ''),
      escapeCSV(item.unit || 'pcs'),
      escapeCSV(item.status || 'active')
    ];
    csvRows.push(row.join(','));
  });

  downloadCSV(csvRows.join('\n'), 'GiHon_Filtered_Items.csv');
  showToast(`Exported ${filteredItems.length} item(s) to GiHon_Filtered_Items.csv`, 'success');
}

// Helper: escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines)
function escapeCSV(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Helper: trigger a CSV file download
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function openPreferences() {
  showToast('Preferences feature coming soon', 'info');
}


// Open bulk update modal
function openBulkUpdateModal() {
  const modal = document.getElementById('bulkUpdateModal');
  if (modal) {
    // Reset the form
    selectedBulkField = null;
    document.getElementById('bulkUpdateFieldText').textContent = 'Select a field';
    document.getElementById('bulkUpdateFieldText').style.color = '#6b7280';
    document.getElementById('bulkUpdateValue').value = '';
    document.getElementById('bulkUpdateSearch').value = '';

    // Reset value dropdown and textarea
    document.getElementById('bulkValueText').textContent = 'Select value';
    document.getElementById('bulkValueText').style.color = '#6b7280';
    document.getElementById('bulkValueDropdown').style.display = 'block';
    document.getElementById('bulkDescriptionTextarea').style.display = 'none';
    document.getElementById('bulkDescriptionInput').value = '';
    document.getElementById('bulkValueSearch').value = '';

    // Reset field selection highlights
    document.querySelectorAll('.bulk-field-option').forEach(opt => {
      opt.classList.remove('selected');
      opt.style.display = 'block';
    });

    closeBulkUpdateDropdown();
    closeBulkValueDropdown();
    modal.classList.add('active');
  }
}


// Close bulk update modal
function closeBulkUpdateModal() {
  const modal = document.getElementById('bulkUpdateModal');
  if (modal) modal.classList.remove('active');
  closeBulkUpdateDropdown();
}

// Toggle bulk update dropdown
function toggleBulkUpdateDropdown() {
  const menu = document.getElementById('bulkUpdateDropdownMenu');
  const select = document.getElementById('bulkUpdateSelect');

  if (!menu.classList.contains('show')) {
    menu.style.display = 'block';
    menu.classList.add('show');
    select.classList.add('active');
    document.getElementById('bulkUpdateSearch').focus();
  } else {
    closeBulkUpdateDropdown();
  }
}

// Close bulk update dropdown
function closeBulkUpdateDropdown() {
  const menu = document.getElementById('bulkUpdateDropdownMenu');
  const select = document.getElementById('bulkUpdateSelect');

  if (menu) {
    menu.style.display = 'none';
    menu.classList.remove('show');
    if (select) select.classList.remove('active');
  }
}

// Filter bulk update fields
function filterBulkUpdateFields() {
  const searchValue = document.getElementById('bulkUpdateSearch').value.toLowerCase();
  const options = document.querySelectorAll('.bulk-field-option');

  options.forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = text.includes(searchValue) ? 'block' : 'none';
  });
}

// Select a field for bulk update
function selectBulkUpdateField(fieldKey, fieldName) {
  selectedBulkField = fieldKey;

  // Update the header text
  document.getElementById('bulkUpdateFieldText').textContent = fieldName;
  document.getElementById('bulkUpdateFieldText').style.color = '#1a1f3a';

  // Highlight selected option
  document.querySelectorAll('.bulk-field-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  document.querySelector(`[data-field="${fieldKey}"]`)?.classList.add('selected');

  // Close field dropdown
  closeBulkUpdateDropdown();

  // Reset value selection and show dropdown by default
  document.getElementById('bulkValueText').textContent = 'Select value';
  document.getElementById('bulkValueText').style.color = '#6b7280';
  document.getElementById('bulkUpdateValue').value = '';
  document.getElementById('bulkValueSearch').value = '';
  document.getElementById('bulkValueDropdown').style.display = 'block';
  document.getElementById('bulkDescriptionTextarea').style.display = 'none';

  // Populate value dropdown based on field
  populateBulkValueOptions(fieldKey);
}

// Populate value dropdown based on selected field
async function populateBulkValueOptions(fieldKey) {
  const list = document.getElementById('bulkValueList');
  list.innerHTML = '<div class="bulk-value-loading">Loading...</div>';

  // Reset search box visibility (some fields hide it)
  const searchBox = document.querySelector('#bulkValueDropdownMenu .bulk-update-search-box');
  if (searchBox) searchBox.style.display = 'block';

  let options = [];

  try {
    switch (fieldKey) {
      case 'brand':
        const brandsRes = await fetch('/api/brands');
        if (brandsRes.ok) {
          const brands = await brandsRes.json();
          options = brands.map(b => ({ value: b.name, label: b.name }));
        }
        break;

      case 'manufacturer':
        const mfgRes = await fetch('/api/manufacturers');
        if (mfgRes.ok) {
          const manufacturers = await mfgRes.json();
          options = manufacturers.map(m => ({ value: m.name, label: m.name }));
        }
        break;

      case 'unit':
        options = [
          { value: 'pcs', label: 'pcs' },
          { value: 'box', label: 'box' },
          { value: 'kg', label: 'kg' },
          { value: 'g', label: 'g' },
          { value: 'm', label: 'm' },
          { value: 'cm', label: 'cm' },
          { value: 'liter', label: 'liter' },
          { value: 'ml', label: 'ml' },
          { value: 'dozen', label: 'dozen' },
          { value: 'pack', label: 'pack' },
          { value: 'set', label: 'set' }
        ];
        break;

      case 'returnable':
        // For returnable, show options directly without search
        document.querySelector('#bulkValueDropdownMenu .bulk-update-search-box').style.display = 'none';
        list.innerHTML = `
          <div class="bulk-value-option" data-value="true" onclick="selectBulkValue('true', 'Yes (Returnable)')">Yes (Returnable)</div>
          <div class="bulk-value-option" data-value="false" onclick="selectBulkValue('false', 'No (Non-returnable)')">No (Non-returnable)</div>
        `;
        return;

      case 'tax':
        options = [
          { value: 'VAT 12%', label: 'VAT 12%' },
          { value: 'VAT Exempt', label: 'VAT Exempt' },
          { value: 'Zero Rated', label: 'Zero Rated' },
          { value: 'None', label: 'None' }
        ];
        break;

      case 'valuation_method':
        options = [
          { value: 'FIFO', label: 'FIFO (First In, First Out)' },
          { value: 'LIFO', label: 'LIFO (Last In, First Out)' },
          { value: 'Average', label: 'Weighted Average' }
        ];
        break;

      case 'purchase_account':
        options = [
          { value: 'Advertising And Marketing', label: 'Advertising And Marketing' },
          { value: 'Automobile Expense', label: 'Automobile Expense' },
          { value: 'Bad Debt', label: 'Bad Debt' },
          { value: 'Bank Fees and Charges', label: 'Bank Fees and Charges' },
          { value: 'Consultant Expense', label: 'Consultant Expense' },
          { value: 'Cost of Goods Sold', label: 'Cost of Goods Sold' },
          { value: 'Credit Card Charges', label: 'Credit Card Charges' },
          { value: 'Depreciation Expense', label: 'Depreciation Expense' },
          { value: 'IT and Internet Expenses', label: 'IT and Internet Expenses' },
          { value: 'Janitorial Expense', label: 'Janitorial Expense' },
          { value: 'Lodging', label: 'Lodging' },
          { value: 'Meals and Entertainment', label: 'Meals and Entertainment' },
          { value: 'Office Supplies', label: 'Office Supplies' },
          { value: 'Other Expenses', label: 'Other Expenses' },
          { value: 'Postage', label: 'Postage' },
          { value: 'Purchase Discounts', label: 'Purchase Discounts' },
          { value: 'Rent Expense', label: 'Rent Expense' },
          { value: 'Repairs and Maintenance', label: 'Repairs and Maintenance' },
          { value: 'Salaries and Employee Wages', label: 'Salaries and Employee Wages' },
          { value: 'Telephone Expense', label: 'Telephone Expense' },
          { value: 'Travel Expense', label: 'Travel Expense' },
          { value: 'Uncategorized', label: 'Uncategorized' }
        ];
        break;

      case 'inventory_account':
        // Show inventory account options with search
        options = [
          { value: 'Inventory Asset', label: 'Inventory Asset' }
        ];
        break;

      case 'sales_account':
        options = [
          { value: 'Discount', label: 'Discount' },
          { value: 'General Income', label: 'General Income' },
          { value: 'Interest Income', label: 'Interest Income' },
          { value: 'Late Fee Income', label: 'Late Fee Income' },
          { value: 'Other Charges', label: 'Other Charges' },
          { value: 'Sales', label: 'Sales' },
          { value: 'Shipping Charge', label: 'Shipping Charge' }
        ];
        break;

      case 'sales_description':
      case 'purchase_description':
        // For description fields, hide the dropdown and show textarea directly
        document.getElementById('bulkValueDropdown').style.display = 'none';
        document.getElementById('bulkDescriptionTextarea').style.display = 'block';
        document.getElementById('bulkDescriptionTextarea').querySelector('textarea').value = '';
        return;

      case 'selling_price':
      case 'purchase_cost':
        // For price/cost fields, show a number input
        document.querySelector('#bulkValueDropdownMenu .bulk-update-search-box').style.display = 'none';
        list.innerHTML = `
          <div style="padding: 12px;">
            <input type="number" id="bulkValueNumericInput" placeholder="Enter ${fieldKey === 'selling_price' ? 'price' : 'cost'}" 
              style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 14px;"
              onchange="selectBulkValue(this.value, this.value)">
          </div>
        `;
        return;

      case 'reorder_point':
        // For reorder point, show number input without search
        document.querySelector('#bulkValueDropdownMenu .bulk-update-search-box').style.display = 'none';
        list.innerHTML = `
          <div style="padding: 12px;">
            <input type="number" id="bulkValueNumericInput" placeholder="Enter reorder point" 
              style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 14px;"
              onchange="selectBulkValue(this.value, this.value)">
          </div>
        `;
        return;

      default:
        // For other text fields
        list.innerHTML = `
          <div style="padding: 12px;">
            <input type="text" id="bulkValueTextInput" placeholder="Enter value" 
              style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 14px;"
              onchange="selectBulkValue(this.value, this.value)">
          </div>
        `;
        return;
    }

    if (options.length === 0) {
      list.innerHTML = '<div class="bulk-value-empty">No options available</div>';
    } else {
      list.innerHTML = options.map(opt =>
        `<div class="bulk-value-option" data-value="${opt.value}" onclick="selectBulkValue('${opt.value}', '${opt.label}')">${opt.label}</div>`
      ).join('');
    }
  } catch (error) {
    console.error('Error loading options:', error);
    list.innerHTML = '<div class="bulk-value-empty">Error loading options</div>';
  }
}

// Toggle value dropdown
function toggleBulkValueDropdown() {
  if (!selectedBulkField) {
    showToast('Please select a field first', 'info');
    return;
  }

  const menu = document.getElementById('bulkValueDropdownMenu');
  const select = document.getElementById('bulkValueSelect');

  if (!menu.classList.contains('show')) {
    menu.style.display = 'block';
    menu.classList.add('show');
    select.classList.add('active');
    document.getElementById('bulkValueSearch')?.focus();
  } else {
    closeBulkValueDropdown();
  }
}

// Close value dropdown
function closeBulkValueDropdown() {
  const menu = document.getElementById('bulkValueDropdownMenu');
  const select = document.getElementById('bulkValueSelect');

  if (menu) {
    menu.style.display = 'none';
    menu.classList.remove('show');
    if (select) select.classList.remove('active');
  }
}

// Filter value options
function filterBulkValueOptions() {
  const searchValue = document.getElementById('bulkValueSearch').value.toLowerCase();
  const options = document.querySelectorAll('.bulk-value-option');

  options.forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = text.includes(searchValue) ? 'block' : 'none';
  });
}

// Select a value
function selectBulkValue(value, label) {
  document.getElementById('bulkUpdateValue').value = value;
  document.getElementById('bulkValueText').textContent = label;
  document.getElementById('bulkValueText').style.color = '#1a1f3a';

  // Highlight selected option
  document.querySelectorAll('.bulk-value-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  document.querySelector(`.bulk-value-option[data-value="${value}"]`)?.classList.add('selected');

  closeBulkValueDropdown();
}

// Execute the bulk update
async function executeBulkUpdate() {
  if (!selectedBulkField) {
    showToast('Please select a field to update', 'error');
    return;
  }

  // Get value from hidden input, or from numeric/text inline input
  let newValue = document.getElementById('bulkUpdateValue').value.trim();
  if (!newValue) {
    const numInput = document.getElementById('bulkValueNumericInput');
    const textInput = document.getElementById('bulkValueTextInput');
    const descInput = document.getElementById('bulkDescriptionInput');
    if (numInput && numInput.value) newValue = numInput.value.trim();
    else if (textInput && textInput.value) newValue = textInput.value.trim();
    else if (descInput && descInput.value) newValue = descInput.value.trim();
  }

  if (!newValue) {
    showToast('Please enter a value', 'error');
    return;
  }

  try {
    let successCount = 0;
    let errorCount = 0;

    // Map frontend field keys to database column names
    const fieldToColumn = {
      'selling_price': 'selling_price',
      'purchase_cost': 'purchase_cost',
      'reorder_point': 'reorder_point',
      'stock_quantity': 'stock_quantity',
      'sales_description': 'description',
      'purchase_description': 'purchase_description',
      'sales_account': 'account',
      'purchase_account': 'purchase_account',
      'inventory_account': 'inventory_account',
      'valuation_method': 'valuation_method',
      'tax': 'tax_rate',
      'brand': 'brand',
      'manufacturer': 'manufacturer',
      'unit': 'unit',
      'returnable': 'is_returnable'
    };

    const numericFields = ['selling_price', 'purchase_cost', 'reorder_point', 'stock_quantity'];
    const dbColumn = fieldToColumn[selectedBulkField] || selectedBulkField;

    let updateData = { _partialUpdate: true };

    if (numericFields.includes(selectedBulkField)) {
      const numValue = parseFloat(newValue);
      if (isNaN(numValue)) {
        showToast('Please enter a valid number', 'error');
        return;
      }
      updateData[dbColumn] = numValue;
    } else if (selectedBulkField === 'returnable') {
      updateData[dbColumn] = newValue.toLowerCase() === 'true' || newValue.toLowerCase() === 'yes' || newValue === '1';
    } else {
      updateData[dbColumn] = newValue;
    }

    // Update each selected item
    for (const itemId of selectedItems) {
      try {
        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        if (response.ok) {
          successCount++;
        } else {
          const error = await response.json();
          console.error(`Error updating item ${itemId}:`, error);
          errorCount++;
        }
      } catch (error) {
        console.error(`Error updating item ${itemId}:`, error);
        errorCount++;
      }
    }

    // Close modal and refresh
    closeBulkUpdateModal();
    await loadItems();
    renderItemsTable();
    deselectAllItems();

    // Show result
    if (errorCount === 0) {
      showToast(`Updated ${successCount} item(s) successfully`, 'success');
    } else if (successCount > 0) {
      showToast(`Updated ${successCount} item(s), ${errorCount} failed`, 'warning');
    } else {
      showToast('Failed to update items', 'error');
    }

  } catch (error) {
    console.error('Error in bulk update:', error);
    showToast('Error updating items', 'error');
  }
}

// Mark selected items as active
async function bulkMarkActive() {
  if (selectedItems.length === 0) {
    showToast('No items selected', 'error');
    return;
  }

  try {
    let successCount = 0;
    for (const itemId of selectedItems) {
      try {
        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' })
        });
        if (response.ok) successCount++;
      } catch (error) {
        console.error(`Error updating item ${itemId}:`, error);
      }
    }

    await loadItems();
    renderItemsTable();
    deselectAllItems();
    showToast(`Marked ${successCount} item(s) as active`, 'success');
  } catch (error) {
    console.error('Error in bulk mark active:', error);
    showToast('Error updating items', 'error');
  }
}

// Mark selected items as inactive
async function bulkMarkInactive() {
  if (selectedItems.length === 0) {
    showToast('No items selected', 'error');
    return;
  }

  try {
    let successCount = 0;
    for (const itemId of selectedItems) {
      try {
        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'inactive' })
        });
        if (response.ok) successCount++;
      } catch (error) {
        console.error(`Error updating item ${itemId}:`, error);
      }
    }

    await loadItems();
    renderItemsTable();
    deselectAllItems();
    showToast(`Marked ${successCount} item(s) as inactive`, 'success');
  } catch (error) {
    console.error('Error in bulk mark inactive:', error);
    showToast('Error updating items', 'error');
  }
}

// Add selected items to a group
function bulkAddToGroup() {
  if (selectedItems.length === 0) {
    showToast('No items selected', 'error');
    return;
  }

  openGroupingModal();
}

// Open the grouping modal
function openGroupingModal() {
  const modal = document.getElementById('groupingModal');
  if (!modal) return;

  // Populate the items to be grouped table
  const itemsToGroup = selectedItems.map(id => items.find(i => i.id === id)).filter(Boolean);
  const tbody = document.getElementById('groupingItemsBody');
  if (tbody) {
    tbody.innerHTML = itemsToGroup.map(item => `
      <tr>
        <td>${item.name || 'Unnamed'}</td>
        <td><input type="text" class="group-sku-input" value="${item.sku || ''}" readonly></td>
      </tr>
    `).join('');
  }

  // Load existing item groups for dropdown
  loadItemGroupsForDropdown();

  // Reset form
  document.getElementById('groupingOptionNew').checked = true;
  toggleGroupingOption('new');

  modal.classList.add('active');
}

// Close grouping modal
function closeGroupingModal() {
  const modal = document.getElementById('groupingModal');
  if (modal) modal.classList.remove('active');
}

// Toggle between new group and existing group options
function toggleGroupingOption(option) {
  const newGroupSection = document.getElementById('newGroupSection');
  const existingGroupSection = document.getElementById('existingGroupSection');
  const noAttributesMessage = document.getElementById('noAttributesMessage');

  if (option === 'new') {
    newGroupSection.style.display = 'block';
    existingGroupSection.style.display = 'none';
    if (noAttributesMessage) noAttributesMessage.style.display = 'none';
  } else {
    newGroupSection.style.display = 'none';
    existingGroupSection.style.display = 'block';
    if (noAttributesMessage) noAttributesMessage.style.display = 'block';
  }
}

// Load item groups for the dropdown
async function loadItemGroupsForDropdown() {
  try {
    const response = await fetch('/api/items/groups/list');
    if (!response.ok) return;

    const groups = await response.json();
    const select = document.getElementById('existingGroupSelect');
    if (select) {
      select.innerHTML = '<option value="">Choose Item Group</option>' +
        groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading groups:', error);
  }
}

// Save grouping (either create new or add to existing)
async function saveGrouping() {
  const isNew = document.getElementById('groupingOptionNew').checked;

  if (isNew) {
    // Create new group
    const groupName = document.getElementById('newGroupName').value.trim();
    const unit = document.getElementById('newGroupUnit').value.trim();
    const manufacturer = document.getElementById('newGroupManufacturer')?.value.trim() || null;
    const brand = document.getElementById('newGroupBrand')?.value.trim() || null;

    if (!groupName) {
      showToast('Please enter a group name', 'error');
      return;
    }

    try {
      // Create the group
      const createResponse = await fetch('/api/items/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, unit: unit || 'pcs', manufacturer: manufacturer, brand: brand })
      });

      if (!createResponse.ok) {
        showToast('Failed to create group', 'error');
        return;
      }

      const newGroup = await createResponse.json();

      // Add items to the new group
      let successCount = 0;
      for (const itemId of selectedItems) {
        try {
          const response = await fetch(`/api/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: newGroup.id })
          });
          if (response.ok) successCount++;
        } catch (error) {
          console.error(`Error adding item ${itemId} to group:`, error);
        }
      }

      closeGroupingModal();
      await loadItems();
      renderItemsTable();
      deselectAllItems();
      showToast(`Created group "${groupName}" with ${successCount} item(s)`, 'success');

    } catch (error) {
      console.error('Error creating group:', error);
      showToast('Error creating group', 'error');
    }
  } else {
    // Add to existing group
    const groupId = document.getElementById('existingGroupSelect').value;

    if (!groupId) {
      showToast('Please select a group', 'error');
      return;
    }

    try {
      let successCount = 0;
      for (const itemId of selectedItems) {
        try {
          const response = await fetch(`/api/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: parseInt(groupId) })
          });
          if (response.ok) successCount++;
        } catch (error) {
          console.error(`Error adding item ${itemId} to group:`, error);
        }
      }

      closeGroupingModal();
      await loadItems();
      renderItemsTable();
      deselectAllItems();
      showToast(`Added ${successCount} item(s) to group`, 'success');

    } catch (error) {
      console.error('Error adding to group:', error);
      showToast('Error adding items to group', 'error');
    }
  }
}

function bulkMarkReturnable() {
  showToast(`Marked ${selectedItems.length} items as returnable`, 'success');
  deselectAllItems();
}

// Bulk delete selected items
async function bulkDeleteItems() {
  if (selectedItems.length === 0) {
    showToast('No items selected', 'error');
    return;
  }

  const itemCount = selectedItems.length;
  const itemNames = selectedItems.map(id => {
    const item = items.find(i => i.id === id);
    return item ? item.name : `Item #${id}`;
  }).slice(0, 3).join(', ') + (itemCount > 3 ? ` and ${itemCount - 3} more` : '');

  // Confirmation dialog
  const confirmed = confirm(`Are you sure you want to delete ${itemCount} item(s)?\n\n${itemNames}\n\nThis action cannot be undone.`);

  if (!confirmed) return;

  try {
    // Delete each item
    let successCount = 0;
    let errorCount = 0;

    for (const itemId of selectedItems) {
      try {
        const response = await fetch(`/api/items/${itemId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error deleting item ${itemId}:`, error);
        errorCount++;
      }
    }

    // Clear selection
    deselectAllItems();

    // Reload items
    await loadItems();
    renderItemsTable();

    // Show result
    if (errorCount === 0) {
      showToast(`Successfully deleted ${successCount} item(s)`, 'success');
    } else if (successCount > 0) {
      showToast(`Deleted ${successCount} item(s), ${errorCount} failed`, 'warning');
    } else {
      showToast(`Failed to delete items`, 'error');
    }
  } catch (error) {
    console.error('Error in bulk delete:', error);
    showToast('Error deleting items', 'error');
  }
}

function showMoreBulkActions() {
  showToast('More bulk actions coming soon', 'info');
}

// ========== ITEM DETAIL VIEW FUNCTIONS ==========
function openItemDetailView(itemId) {
  currentDetailItemId = itemId;
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  // Populate left sidebar list
  renderItemDetailLeftList();

  // Populate main content with item data
  document.getElementById('detailItemName').textContent = item.name || 'Unnamed Item';
  document.getElementById('detailItemSku').textContent = item.sku || '-';
  document.getElementById('detailItemUnit').textContent = item.unit || 'pcs';
  document.getElementById('detailItemManufacturer').textContent = item.manufacturer || '-';
  document.getElementById('detailItemBrand').textContent = item.brand || '-';
  document.getElementById('detailItemCost').textContent = 'PHP' + formatNumber(item.purchase_cost || 0);
  document.getElementById('detailItemPrice').textContent = 'PHP' + formatNumber(item.selling_price || 0);
  document.getElementById('detailOpeningStock').textContent = formatNumber(item.stock_quantity || 0);
  document.getElementById('detailStockOnHand').textContent = ': ' + formatNumber(item.stock_quantity || 0);
  document.getElementById('detailPhysicalStock').textContent = ': ' + formatNumber(item.stock_quantity || 0);
  document.getElementById('detailReorderPoint').textContent = formatNumber(item.reorder_point || 0);

  // Fetch committed stock and available for sale
  fetch(`/api/items/${item.id}/committed-stock`)
    .then(r => r.json())
    .then(data => {
      const committed = parseFloat(data.committed_stock || 0);
      const available = parseFloat(data.available_for_sale || 0);
      document.getElementById('detailCommittedStock').textContent = ': ' + formatNumber(committed);
      document.getElementById('detailAvailableForSale').textContent = ': ' + formatNumber(available);
      document.getElementById('detailPhysicalCommitted').textContent = ': ' + formatNumber(committed);
      document.getElementById('detailPhysicalAvailable').textContent = ': ' + formatNumber(available);
    })
    .catch(() => {
      document.getElementById('detailCommittedStock').textContent = ': 0.00';
      document.getElementById('detailAvailableForSale').textContent = ': 0.00';
      document.getElementById('detailPhysicalCommitted').textContent = ': 0.00';
      document.getElementById('detailPhysicalAvailable').textContent = ': 0.00';
    });

  // Show preferred vendor
  const vendorEl = document.getElementById('detailPreferredVendor');
  if (vendorEl) vendorEl.textContent = item.preferred_vendor || '-';

  // Update item type display
  const typeMap = { 'goods': 'Inventory Items', 'service': 'Service', 'non-inventory': 'Non-Inventory' };
  document.getElementById('detailItemType').textContent = typeMap[item.type] || 'Inventory Items';

  // Show Added By
  const addedByEl = document.getElementById('detailAddedBy');
  if (addedByEl) addedByEl.textContent = item.added_by || '-';

  // Show item group if available
  const groupRow = document.getElementById('detailItemGroupRow');
  const groupLink = document.getElementById('detailItemGroupLink');
  if (groupRow && groupLink) {
    if (item.group_name && item.group_id) {
      groupRow.style.display = '';
      groupLink.textContent = item.group_name;
      groupLink.href = `/item-groups.html?groupId=${item.group_id}`;
      groupLink.onclick = function (e) {
        e.preventDefault();
        window.location.href = `/item-groups.html?groupId=${item.group_id}`;
      };
    } else {
      groupRow.style.display = 'none';
    }
  }

  // Show item image or placeholder
  const imgPreview = document.getElementById('detailImagePreview');
  const imgPlaceholder = document.getElementById('detailImagePlaceholder');
  const imgEl = document.getElementById('detailImageImg');
  if (imgPreview && imgPlaceholder && imgEl) {
    if (item.image_url) {
      imgEl.src = item.image_url;
      imgPreview.style.display = 'block';
      imgPlaceholder.style.display = 'none';
    } else {
      imgPreview.style.display = 'none';
      imgPlaceholder.style.display = 'block';
    }
  }

  // Show the overlay
  document.getElementById('itemDetailOverlay').classList.add('active');

  // If currently on transactions or history tab, reload data for the new item
  const activeTab = document.querySelector('.item-detail-tab.active');
  if (activeTab) {
    const tabName = activeTab.dataset.tab;
    if (tabName === 'transactions') {
      loadItemTransactions(currentDetailItemId);
    } else if (tabName === 'history') {
      loadItemHistory(currentDetailItemId);
    }
  }

  // Load status counts (To be Shipped, Received, Invoiced, Billed)
  loadItemStatusCounts(itemId);
}

function closeItemDetailView() {
  document.getElementById('itemDetailOverlay').classList.remove('active');
  currentDetailItemId = null;
}

// Load item status counts for the detail view cards
async function loadItemStatusCounts(itemId) {
  // Reset to 0 first
  const shipped = document.getElementById('detailToBeShipped');
  const received = document.getElementById('detailToBeReceived');
  const invoiced = document.getElementById('detailToBeInvoiced');
  const billed = document.getElementById('detailToBeBilled');
  if (shipped) shipped.textContent = '0';
  if (received) received.textContent = '0';
  if (invoiced) invoiced.textContent = '0';
  if (billed) billed.textContent = '0';

  try {
    const res = await fetch(`/api/items/${itemId}/status-counts`);
    if (!res.ok) return;
    const data = await res.json();
    if (shipped) shipped.textContent = data.to_be_shipped || 0;
    if (received) received.textContent = data.to_be_received || 0;
    if (invoiced) invoiced.textContent = data.to_be_invoiced || 0;
    if (billed) billed.textContent = data.to_be_billed || 0;
  } catch (error) {
    console.error('Error loading item status counts:', error);
  }
}

// Upload image for current detail item
async function uploadDetailImage(file) {
  if (!file || !currentDetailItemId) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image must be less than 5MB', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`/api/items/${currentDetailItemId}/upload-image`, {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (res.ok && result.image_url) {
      // Update UI
      const imgEl = document.getElementById('detailImageImg');
      const imgPreview = document.getElementById('detailImagePreview');
      const imgPlaceholder = document.getElementById('detailImagePlaceholder');
      imgEl.src = result.image_url;
      imgPreview.style.display = 'block';
      imgPlaceholder.style.display = 'none';
      // Update local items array
      const item = items.find(i => i.id === currentDetailItemId);
      if (item) item.image_url = result.image_url;
      showToast('Image uploaded successfully', 'success');
    } else {
      showToast(result.error || 'Failed to upload image', 'error');
    }
  } catch (err) {
    console.error('Error uploading image:', err);
    showToast('Error uploading image', 'error');
  }
  // Reset file input
  const fileInput = document.getElementById('detailImageInput');
  if (fileInput) fileInput.value = '';
}

// Remove image from current detail item
async function removeDetailImage() {
  if (!currentDetailItemId) return;
  try {
    const res = await fetch(`/api/items/${currentDetailItemId}/remove-image`, { method: 'DELETE' });
    if (res.ok) {
      const imgPreview = document.getElementById('detailImagePreview');
      const imgPlaceholder = document.getElementById('detailImagePlaceholder');
      imgPreview.style.display = 'none';
      imgPlaceholder.style.display = 'block';
      const item = items.find(i => i.id === currentDetailItemId);
      if (item) item.image_url = null;
      showToast('Image removed', 'success');
    }
  } catch (err) {
    console.error('Error removing image:', err);
    showToast('Error removing image', 'error');
  }
}

// Opening Stock Details Modal
function openOpeningStockModal() {
  if (!currentDetailItemId) return;
  const item = items.find(i => i.id === currentDetailItemId);
  if (!item) return;

  document.getElementById('openingStockInput').value = parseFloat(item.stock_quantity) || 0;
  document.getElementById('openingStockRateInput').value = parseFloat(item.purchase_cost) || 0;

  const modal = document.getElementById('openingStockModal');
  if (modal) modal.classList.add('active');
}

function closeOpeningStockModal() {
  const modal = document.getElementById('openingStockModal');
  if (modal) modal.classList.remove('active');
}

async function saveOpeningStock() {
  if (!currentDetailItemId) return;

  const openingStock = parseFloat(document.getElementById('openingStockInput').value) || 0;
  const ratePerUnit = parseFloat(document.getElementById('openingStockRateInput').value);

  if (isNaN(ratePerUnit) || ratePerUnit <= 0) {
    showToast('Opening Stock Rate per Unit is required', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/items/${currentDetailItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _partialUpdate: true,
        stock_quantity: openingStock,
        purchase_cost: ratePerUnit
      })
    });

    if (response.ok) {
      closeOpeningStockModal();
      await loadItems();
      renderItemsTable();
      openItemDetailView(currentDetailItemId);
      showToast('Opening stock updated successfully', 'success');
    } else {
      const error = await response.json();
      showToast(error.error || 'Failed to update opening stock', 'error');
    }
  } catch (error) {
    console.error('Error updating opening stock:', error);
    showToast('Error updating opening stock', 'error');
  }
}

function editCurrentItem() {
  if (currentDetailItemId) {
    const itemId = currentDetailItemId;
    // Close detail view first (this sets currentDetailItemId = null)
    closeItemDetailView();
    // Open edit modal for the saved item ID
    openItemModal(itemId);
  }
}

// Toggle the More dropdown in detail view
function toggleDetailMoreDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('detailMoreDropdown');
  dropdown.classList.toggle('show');

  // Update "Mark as Inactive/Active" label based on current item status
  if (currentDetailItemId) {
    const item = items.find(i => i.id === currentDetailItemId);
    if (item) {
      const statusItem = dropdown.querySelector('[onclick="toggleItemActiveStatus()"]');
      if (statusItem) {
        statusItem.textContent = (item.status === 'inactive') ? 'Mark as Active' : 'Mark as Inactive';
      }
    }
  }

  // Close on outside click
  function closeDropdown(evt) {
    if (!dropdown.contains(evt.target)) {
      dropdown.classList.remove('show');
      document.removeEventListener('click', closeDropdown);
    }
  }
  if (dropdown.classList.contains('show')) {
    setTimeout(() => document.addEventListener('click', closeDropdown), 0);
  }
}

// Clone the current item
async function cloneCurrentItem() {
  document.getElementById('detailMoreDropdown').classList.remove('show');
  if (!currentDetailItemId) return;
  const item = items.find(i => i.id === currentDetailItemId);
  if (!item) return;

  if (!confirm(`Clone item "${item.name}"?`)) return;

  try {
    const cloneData = {
      name: item.name + ' (Copy)',
      sku: '',
      unit: item.unit,
      quantity: 0,
      reorder_point: item.reorder_point,
      price: item.selling_price,
      cost: item.purchase_cost,
      can_be_wholesale: item.can_be_wholesale,
      manufacturer: item.manufacturer,
      brand: item.brand,
      description: item.description,
      upc: '',
      ean: '',
      isbn: '',
      dimensions: item.dimensions,
      account: item.account,
      tax_rate: item.tax_rate,
      type: item.type,
      weight: item.weight,
      purchase_account: item.purchase_account,
      purchase_description: item.purchase_description,
      preferred_vendor: item.preferred_vendor
    };
    await itemsAPI.create(cloneData);
    showToast('Item cloned successfully', 'success');
    closeItemDetailView();
    await loadItems();
    renderItemsTable();
  } catch (error) {
    console.error('Error cloning item:', error);
    showToast('Failed to clone item', 'error');
  }
}

// Toggle item active/inactive status
async function toggleItemActiveStatus() {
  document.getElementById('detailMoreDropdown').classList.remove('show');
  if (!currentDetailItemId) return;
  const item = items.find(i => i.id === currentDetailItemId);
  if (!item) return;

  const newStatus = (item.status === 'inactive') ? 'active' : 'inactive';
  const label = newStatus === 'inactive' ? 'inactive' : 'active';

  if (!confirm(`Mark "${item.name}" as ${label}?`)) return;

  try {
    await itemsAPI.update(currentDetailItemId, { status: newStatus, _partialUpdate: true });
    showToast(`Item marked as ${label}`, 'success');
    await loadItems();
    renderItemsTable();
    // Re-open updated item
    const updatedItem = items.find(i => i.id === currentDetailItemId);
    if (updatedItem) openItemDetailView(currentDetailItemId);
  } catch (error) {
    console.error('Error updating item status:', error);
    showToast('Failed to update item status', 'error');
  }
}

// Delete current item
async function deleteCurrentItem() {
  document.getElementById('detailMoreDropdown').classList.remove('show');
  if (!currentDetailItemId) return;
  const item = items.find(i => i.id === currentDetailItemId);
  if (!item) return;

  if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) return;

  try {
    await itemsAPI.delete(currentDetailItemId);
    showToast('Item deleted successfully', 'success');
    closeItemDetailView();
    await loadItems();
    renderItemsTable();
  } catch (error) {
    console.error('Error deleting item:', error);
    showToast('Failed to delete item', 'error');
  }
}

// Move to another item (placeholder)
function moveToAnotherItem() {
  document.getElementById('detailMoreDropdown').classList.remove('show');
  showToast('Move to another item feature coming soon', 'info');
}

function renderItemDetailLeftList() {
  const listContainer = document.getElementById('itemDetailLeftList');
  if (!listContainer) return;

  listContainer.innerHTML = items.map(item => `
    <div class="item-detail-left-item ${item.id === currentDetailItemId ? 'active' : ''}" 
         onclick="openItemDetailView(${item.id})">
      <div class="item-detail-left-item-name">${item.name}</div>
      <div class="item-detail-left-item-sku">SKU: ${item.sku || '-'}</div>
      <div class="item-detail-left-item-price">PHP${formatNumber(item.selling_price || 0)}</div>
    </div>
  `).join('');
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0.00';
  return parseFloat(num).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Switch to List View
function switchToListView() {
  currentView = 'list';

  // Update button states
  document.getElementById('listViewBtn').classList.add('active');
  document.getElementById('gridViewBtn').classList.remove('active');

  // Show table, hide grid
  document.querySelector('.items-table-wrapper').style.display = 'block';
  document.getElementById('itemsGridWrapper').style.display = 'none';

  // Re-render table
  renderItemsTable();
}

// Switch to Grid View
function switchToGridView() {
  currentView = 'grid';

  // Update button states
  document.getElementById('listViewBtn').classList.remove('active');
  document.getElementById('gridViewBtn').classList.add('active');

  // Hide table, show grid
  document.querySelector('.items-table-wrapper').style.display = 'none';
  document.getElementById('itemsGridWrapper').style.display = 'block';

  // Render grid view
  renderGridView();
}

// Render Grid View
function renderGridView() {
  const grid = document.getElementById('itemsGrid');
  if (!grid) return;

  // Apply same filters as table view
  let filteredItems = [...items];

  // Filter by category
  if (filters.category) {
    filteredItems = filteredItems.filter(item => item.item_group === filters.category);
  }

  // Filter by search term
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(item =>
      (item.name && item.name.toLowerCase().includes(searchTerm)) ||
      (item.description && item.description.toLowerCase().includes(searchTerm)) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm))
    );
  }

  if (filteredItems.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #6b7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
        <div style="font-size: 16px;">No items found</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredItems.map(item => {
    const stock = parseInt(item.stock_quantity) || 0;
    const price = parseFloat(item.selling_price) || 0;
    const isSelected = selectedItemId === item.id ? 'selected' : '';
    const imageHtml = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}">`
      : '📦';

    return `
      <div class="grid-item-card ${isSelected}" onclick="selectItem(${item.id})">
        <div class="grid-item-image">${imageHtml}</div>
        <div class="grid-item-body">
          <div class="grid-item-name">${item.name || 'Unnamed Item'}</div>
          <div class="grid-item-sku">${item.sku || 'No SKU'}</div>
          <div class="grid-item-stats">
            <div class="grid-item-stat">
              <div class="grid-item-stat-value">${stock}</div>
              <div class="grid-item-stat-label">Stock</div>
            </div>
            <div class="grid-item-stat">
              <div class="grid-item-stat-value grid-item-price">₱${price.toLocaleString()}</div>
              <div class="grid-item-stat-label">Price</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Manufacturers list (stored in database)
let manufacturers = [];
let manufacturersData = []; // Full data with id and name
let editingManufacturerIndex = -1;
let selectedManufacturer = '';

// Fetch manufacturers from API
async function fetchManufacturers() {
  try {
    const response = await fetch('/api/manufacturers');
    manufacturersData = await response.json();
    manufacturers = manufacturersData.map(m => m.name);
    updateManufacturerDropdown();
    renderManufacturersList();
    renderManufacturerDropdownList();
  } catch (error) {
    console.error('Error fetching manufacturers:', error);
  }
}
// Toggle Manufacturer Custom Dropdown
function toggleManufacturerDropdown() {
  const dropdown = document.getElementById('manufacturerDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    document.getElementById('manufacturerSearchInput').value = '';
    document.getElementById('manufacturerSearchInput').focus();
    renderManufacturerDropdownList();
  }
}

// Close Manufacturer Dropdown
function closeManufacturerDropdown() {
  const dropdown = document.getElementById('manufacturerDropdown');
  dropdown.classList.remove('open');
}

// Filter Manufacturers in dropdown
function filterManufacturers() {
  renderManufacturerDropdownList();
}

// Select Manufacturer from custom dropdown
function selectManufacturerFromDropdown(name) {
  selectedManufacturer = name;
  document.getElementById('itemManufacturer').value = name;
  document.getElementById('manufacturerDropdownText').textContent = name;
  document.getElementById('manufacturerDropdownText').classList.add('has-value');
  closeManufacturerDropdown();
}

// Render Manufacturer Dropdown List
function renderManufacturerDropdownList() {
  const listContainer = document.getElementById('manufacturerDropdownList');
  const searchInput = document.getElementById('manufacturerSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  // Filter manufacturers
  const filtered = manufacturers.filter(m =>
    m.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0 && manufacturers.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No manufacturers yet</div>';
    return;
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No matches found</div>';
    return;
  }

  listContainer.innerHTML = filtered.map(name => {
    const isSelected = selectedManufacturer === name;
    return `
      <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectManufacturerFromDropdown('${name}')">
        ${isSelected ? '<span class="check-icon">✓</span>' : ''}
        <span>${name}</span>
      </div>
    `;
  }).join('');
}

// Update manufacturer dropdown when list changes
function updateManufacturerDropdown() {
  renderManufacturerDropdownList();
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
  const manufacturerDropdown = document.getElementById('manufacturerDropdown');
  if (manufacturerDropdown && !manufacturerDropdown.contains(e.target)) {
    manufacturerDropdown.classList.remove('open');
  }
});

// Open Manage Manufacturers Modal
function openManageManufacturersModal() {
  const modal = document.getElementById('manageManufacturersModal');
  if (modal) {
    modal.classList.add('active');
    renderManufacturersList();
    cancelNewManufacturer(); // Reset form state
  }
}

// Close Manage Manufacturers Modal
function closeManageManufacturersModal() {
  const modal = document.getElementById('manageManufacturersModal');
  if (modal) {
    modal.classList.remove('active');
    cancelNewManufacturer();
  }
}

// Show New Manufacturer Form
function showNewManufacturerForm() {
  document.getElementById('newManufacturerForm').style.display = 'block';
  document.getElementById('btnNewManufacturer').style.display = 'none';
  document.getElementById('newManufacturerName').value = '';
  document.getElementById('newManufacturerName').focus();
  editingManufacturerIndex = -1;
}

// Cancel New Manufacturer Form
function cancelNewManufacturer() {
  document.getElementById('newManufacturerForm').style.display = 'none';
  document.getElementById('btnNewManufacturer').style.display = 'block';
  document.getElementById('newManufacturerName').value = '';
  editingManufacturerIndex = -1;
}

// Save New Manufacturer
async function saveNewManufacturer() {
  const nameInput = document.getElementById('newManufacturerName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter a manufacturer name', 'error');
    return;
  }

  try {
    const response = await fetch('/api/manufacturers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (response.status === 409) {
      showToast('Manufacturer already exists', 'error');
      return;
    }

    if (!response.ok) throw new Error('Failed to save manufacturer');

    await fetchManufacturers();
    showToast(`Manufacturer "${name}" added`, 'success');
    document.getElementById('itemManufacturer').value = name;
    cancelNewManufacturer();
  } catch (error) {
    console.error('Error saving manufacturer:', error);
    showToast('Failed to save manufacturer', 'error');
  }
}

// Edit Manufacturer
function editManufacturer(index) {
  const name = manufacturers[index];
  document.getElementById('newManufacturerForm').style.display = 'block';
  document.getElementById('btnNewManufacturer').style.display = 'none';
  document.getElementById('newManufacturerName').value = name;
  document.getElementById('newManufacturerName').focus();
  editingManufacturerIndex = index;
}

// Delete Manufacturer
async function deleteManufacturer(index) {
  const manufacturer = manufacturersData[index];
  if (!manufacturer) return;

  if (confirm(`Delete manufacturer "${manufacturer.name}"?`)) {
    try {
      await fetch(`/api/manufacturers/${manufacturer.id}`, { method: 'DELETE' });
      await fetchManufacturers();
      showToast(`Manufacturer "${manufacturer.name}" deleted`, 'success');
    } catch (error) {
      console.error('Error deleting manufacturer:', error);
      showToast('Failed to delete manufacturer', 'error');
    }
  }
}

// Select Manufacturer from list
function selectManufacturer(name) {
  document.getElementById('itemManufacturer').value = name;
  closeManageManufacturersModal();
}

// Render Manufacturers List
function renderManufacturersList() {
  const listContainer = document.getElementById('manufacturersList');
  if (!listContainer) return;

  if (manufacturers.length === 0) {
    listContainer.innerHTML = '<div class="manage-list-empty">No manufacturers added yet</div>';
    return;
  }

  listContainer.innerHTML = manufacturers.map((name, index) => `
    <div class="manage-list-item" onclick="selectManufacturer('${name}')">
      <span class="manage-list-item-name">${name}</span>
      <div class="manage-list-item-actions">
        <button class="manage-list-action-btn btn-edit" onclick="event.stopPropagation(); editManufacturer(${index})">Edit</button>
        <button class="manage-list-action-btn btn-delete" onclick="event.stopPropagation(); deleteManufacturer(${index})">Delete</button>
      </div>
    </div>
  `).join('');
}

// Update manufacturer dropdown with current list
function updateManufacturerDropdown() {
  const select = document.getElementById('itemManufacturer');
  if (!select) return;

  // Clear and rebuild options
  select.innerHTML = `
    <option value="">Select or Add Manufacturer</option>
    ${manufacturers.map(m => `<option value="${m}">${m}</option>`).join('')}
    <option value="__manage__">⚙️ Manage Manufacturers</option>
  `;
}

// Brands list (stored in database)
let brands = [];
let brandsData = []; // Full data with id and name
let editingBrandIndex = -1;
let selectedBrand = '';

// Fetch brands from API
async function fetchBrands() {
  try {
    const response = await fetch('/api/brands');
    brandsData = await response.json();
    brands = brandsData.map(b => b.name);
    updateBrandDropdown();
    renderBrandsList();
    renderBrandDropdownList();
  } catch (error) {
    console.error('Error fetching brands:', error);
  }
}

// Toggle Brand Custom Dropdown
function toggleBrandDropdown() {
  const dropdown = document.getElementById('brandDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    document.getElementById('brandSearchInput').value = '';
    document.getElementById('brandSearchInput').focus();
    renderBrandDropdownList();
  }
}

// Close Brand Dropdown
function closeBrandDropdown() {
  const dropdown = document.getElementById('brandDropdown');
  dropdown.classList.remove('open');
}

// Filter Brands in dropdown
function filterBrands() {
  renderBrandDropdownList();
}

// Select Brand from custom dropdown
function selectBrandFromDropdown(name) {
  selectedBrand = name;
  document.getElementById('itemBrand').value = name;
  document.getElementById('brandDropdownText').textContent = name;
  document.getElementById('brandDropdownText').classList.add('has-value');
  closeBrandDropdown();
}

// Render Brand Dropdown List
function renderBrandDropdownList() {
  const listContainer = document.getElementById('brandDropdownList');
  const searchInput = document.getElementById('brandSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  // Filter brands
  const filtered = brands.filter(b =>
    b.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0 && brands.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No brands yet</div>';
    return;
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No matches found</div>';
    return;
  }

  listContainer.innerHTML = filtered.map(name => {
    const isSelected = selectedBrand === name;
    return `
      <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectBrandFromDropdown('${name}')">
        ${isSelected ? '<span class="check-icon">✓</span>' : ''}
        <span>${name}</span>
      </div>
    `;
  }).join('');
}

// Update brand dropdown when list changes
function updateBrandDropdown() {
  renderBrandDropdownList();
}

// Close brand dropdown when clicking outside
document.addEventListener('click', function (e) {
  const brandDropdown = document.getElementById('brandDropdown');
  if (brandDropdown && !brandDropdown.contains(e.target)) {
    brandDropdown.classList.remove('open');
  }
});

// ========== SALES ACCOUNT DROPDOWN ==========
const salesAccounts = [
  'Discount',
  'General Income',
  'Interest Income',
  'Late Fee Income',
  'Other Charges',
  'Sales',
  'Shipping Charge'
];
let selectedSalesAccount = 'Sales';

function toggleSalesAccountDropdown() {
  const dropdown = document.getElementById('salesAccountDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    document.getElementById('salesAccountSearchInput').value = '';
    document.getElementById('salesAccountSearchInput').focus();
    renderSalesAccountDropdownList();
  }
}

function closeSalesAccountDropdown() {
  const dropdown = document.getElementById('salesAccountDropdown');
  dropdown.classList.remove('open');
}

function filterSalesAccounts() {
  renderSalesAccountDropdownList();
}

function selectSalesAccountFromDropdown(name) {
  selectedSalesAccount = name;
  document.getElementById('salesAccount').value = name;
  document.getElementById('salesAccountDropdownText').textContent = name;
  document.getElementById('salesAccountDropdownText').classList.add('has-value');
  closeSalesAccountDropdown();
}

function renderSalesAccountDropdownList() {
  const listContainer = document.getElementById('salesAccountDropdownList');
  const searchInput = document.getElementById('salesAccountSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = salesAccounts.filter(a => a.toLowerCase().includes(searchTerm));

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No matches found</div>';
    return;
  }

  listContainer.innerHTML = filtered.map(name => {
    const isSelected = selectedSalesAccount === name;
    return `
      <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectSalesAccountFromDropdown('${name}')">
        <span>${name}</span>
        ${isSelected ? '<span class="check-icon" style="margin-left:auto;">✓</span>' : ''}
      </div>
    `;
  }).join('');
}

document.addEventListener('click', function (e) {
  const salesAccountDropdown = document.getElementById('salesAccountDropdown');
  if (salesAccountDropdown && !salesAccountDropdown.contains(e.target)) {
    salesAccountDropdown.classList.remove('open');
  }
});

// ========== PURCHASE ACCOUNT DROPDOWN ==========
const purchaseAccountCategories = {
  'Expense': [
    'Advertising And Marketing',
    'Automobile Expense',
    'Bad Debt',
    'Bank Fees and Charges',
    'Consultant Expense',
    'Credit Card Charges',
    'Depreciation Expense',
    'IT and Internet Expenses',
    'Janitorial Expense',
    'Lodging',
    'Meals and Entertainment',
    'Office Supplies',
    'Other Expenses',
    'Postage',
    'Printing and Stationery',
    'Purchase Discounts',
    'Rent Expense',
    'Repairs and Maintenance',
    'Salaries and Employee Wages',
    'Telephone Expense',
    'Travel Expense',
    'Uncategorized'
  ],
  'Cost Of Goods Sold': [
    'Cost of Goods Sold'
  ]
};
let selectedPurchaseAccount = 'Cost of Goods Sold';

function togglePurchaseAccountDropdown() {
  const dropdown = document.getElementById('purchaseAccountDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    document.getElementById('purchaseAccountSearchInput').value = '';
    document.getElementById('purchaseAccountSearchInput').focus();
    renderPurchaseAccountDropdownList();
  }
}

function closePurchaseAccountDropdown() {
  const dropdown = document.getElementById('purchaseAccountDropdown');
  dropdown.classList.remove('open');
}

function filterPurchaseAccounts() {
  renderPurchaseAccountDropdownList();
}

function selectPurchaseAccountFromDropdown(name) {
  selectedPurchaseAccount = name;
  document.getElementById('purchaseAccount').value = name;
  document.getElementById('purchaseAccountDropdownText').textContent = name;
  document.getElementById('purchaseAccountDropdownText').classList.add('has-value');
  closePurchaseAccountDropdown();
}

function renderPurchaseAccountDropdownList() {
  const listContainer = document.getElementById('purchaseAccountDropdownList');
  const searchInput = document.getElementById('purchaseAccountSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  let html = '';

  for (const [category, accounts] of Object.entries(purchaseAccountCategories)) {
    const filtered = accounts.filter(a => a.toLowerCase().includes(searchTerm));

    if (filtered.length > 0) {
      html += `<div class="custom-dropdown-category">${category}</div>`;
      html += filtered.map((name, index) => {
        const isSelected = selectedPurchaseAccount === name;
        const originalIndex = accounts.indexOf(name);
        return `
          <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectPurchaseAccountFromDropdown('${name}')">
            <span>${name}</span>
            <div class="dropdown-item-actions">
              ${isSelected ? '<span class="check-icon">✓</span>' : ''}
              <button class="dropdown-delete-btn" onclick="event.stopPropagation(); deletePurchaseAccount('${category}', ${originalIndex}, '${name}')" title="Delete">×</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (!html) {
    html = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No matches found</div>';
  }

  listContainer.innerHTML = html;
}

function deletePurchaseAccount(category, index, name) {
  if (confirm(`Delete account "${name}"?`)) {
    purchaseAccountCategories[category].splice(index, 1);
    renderPurchaseAccountDropdownList();
    if (selectedPurchaseAccount === name) {
      selectedPurchaseAccount = '';
      document.getElementById('purchaseAccount').value = '';
      document.getElementById('purchaseAccountDropdownText').textContent = 'Select Account';
      document.getElementById('purchaseAccountDropdownText').classList.remove('has-value');
    }
    showToast(`Account "${name}" deleted`, 'success');
  }
}

let currentAccountType = 'purchase'; // 'purchase' or 'sales'

function addNewPurchaseAccount() {
  currentAccountType = 'purchase';
  openCreateAccountModal();
}

function openCreateAccountModal() {
  const modal = document.getElementById('createAccountModal');
  if (modal) {
    document.getElementById('newAccountName').value = '';
    modal.classList.add('active');
    document.getElementById('newAccountName').focus();
  }
}

function closeCreateAccountModal() {
  const modal = document.getElementById('createAccountModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('newAccountName').value = '';
  }
}

function saveNewAccount() {
  const nameInput = document.getElementById('newAccountName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter an account name', 'error');
    return;
  }

  if (currentAccountType === 'purchase') {
    purchaseAccountCategories['Expense'].push(name);
    selectPurchaseAccountFromDropdown(name);
  } else {
    salesAccounts.push(name);
    selectSalesAccountFromDropdown(name);
  }

  showToast(`Account "${name}" added`, 'success');
  closeCreateAccountModal();
}

document.addEventListener('click', function (e) {
  const purchaseAccountDropdown = document.getElementById('purchaseAccountDropdown');
  if (purchaseAccountDropdown && !purchaseAccountDropdown.contains(e.target)) {
    purchaseAccountDropdown.classList.remove('open');
  }
});

// ========== PREFERRED VENDOR DROPDOWN ==========
let vendors = [];
let selectedVendor = '';

// Fetch vendors from API
async function fetchVendors() {
  try {
    const response = await fetch('/api/suppliers');
    const suppliers = await response.json();
    // Extract vendor names from suppliers
    vendors = suppliers.map(s => s.name).filter(v => v);
    renderVendorDropdownList();
  } catch (error) {
    console.error('Error fetching vendors:', error);
  }
}

function toggleVendorDropdown() {
  const dropdown = document.getElementById('vendorDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    document.getElementById('vendorSearchInput').value = '';
    document.getElementById('vendorSearchInput').focus();
    renderVendorDropdownList();
  }
}

function closeVendorDropdown() {
  const dropdown = document.getElementById('vendorDropdown');
  dropdown.classList.remove('open');
}

function filterVendors() {
  renderVendorDropdownList();
}

function selectVendorFromDropdown(name) {
  selectedVendor = name;
  document.getElementById('preferredVendor').value = name;
  document.getElementById('vendorDropdownText').textContent = name;
  document.getElementById('vendorDropdownText').classList.add('has-value');
  closeVendorDropdown();
}

function renderVendorDropdownList() {
  const listContainer = document.getElementById('vendorDropdownList');
  const searchInput = document.getElementById('vendorSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = vendors.filter(v => v.toLowerCase().includes(searchTerm));

  if (filtered.length === 0 && vendors.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No vendors yet. Add vendors in Purchases.</div>';
    return;
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div style="padding: 12px 14px; color: #9ca3af; font-size: 13px;">No matches found</div>';
    return;
  }

  listContainer.innerHTML = filtered.map(name => {
    const isSelected = selectedVendor === name;
    return `
      <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectVendorFromDropdown('${name}')">
        <span>${name}</span>
        ${isSelected ? '<span class="check-icon" style="margin-left:auto;">✓</span>' : ''}
      </div>
    `;
  }).join('');
}

document.addEventListener('click', function (e) {
  const vendorDropdown = document.getElementById('vendorDropdown');
  if (vendorDropdown && !vendorDropdown.contains(e.target)) {
    vendorDropdown.classList.remove('open');
  }
});

// Fetch vendors, manufacturers and brands when page loads
document.addEventListener('DOMContentLoaded', function () {
  fetchVendors();
  fetchManufacturers();
  fetchBrands();

  // Event delegation for checkbox changes
  document.addEventListener('change', function (e) {
    if (e.target.classList.contains('item-checkbox')) {
      handleCheckboxChange(e);
    }
  });
});

// Open Manage Brands Modal
function openManageBrandsModal() {
  const modal = document.getElementById('manageBrandsModal');
  if (modal) {
    modal.classList.add('active');
    renderBrandsList();
    cancelNewBrand(); // Reset form state
  }
}

// Close Manage Brands Modal
function closeManageBrandsModal() {
  const modal = document.getElementById('manageBrandsModal');
  if (modal) {
    modal.classList.remove('active');
    cancelNewBrand();
  }
}

// Show New Brand Form
function showNewBrandForm() {
  document.getElementById('newBrandForm').style.display = 'block';
  document.getElementById('btnNewBrand').style.display = 'none';
  document.getElementById('newBrandName').value = '';
  document.getElementById('newBrandName').focus();
  editingBrandIndex = -1;
}

// Cancel New Brand Form
function cancelNewBrand() {
  document.getElementById('newBrandForm').style.display = 'none';
  document.getElementById('btnNewBrand').style.display = 'block';
  document.getElementById('newBrandName').value = '';
  editingBrandIndex = -1;
}

// Save New Brand
async function saveNewBrand() {
  const nameInput = document.getElementById('newBrandName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter a brand name', 'error');
    return;
  }

  try {
    const response = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (response.status === 409) {
      showToast('Brand already exists', 'error');
      return;
    }

    if (!response.ok) throw new Error('Failed to save brand');

    await fetchBrands();
    showToast(`Brand "${name}" added`, 'success');
    document.getElementById('itemBrand').value = name;
    cancelNewBrand();
  } catch (error) {
    console.error('Error saving brand:', error);
    showToast('Failed to save brand', 'error');
  }
}

// Edit Brand
function editBrand(index) {
  const name = brands[index];
  document.getElementById('newBrandForm').style.display = 'block';
  document.getElementById('btnNewBrand').style.display = 'none';
  document.getElementById('newBrandName').value = name;
  document.getElementById('newBrandName').focus();
  editingBrandIndex = index;
}

// Delete Brand
async function deleteBrand(index) {
  const brand = brandsData[index];
  if (!brand) return;

  if (confirm(`Delete brand "${brand.name}"?`)) {
    try {
      await fetch(`/api/brands/${brand.id}`, { method: 'DELETE' });
      await fetchBrands();
      showToast(`Brand "${brand.name}" deleted`, 'success');
    } catch (error) {
      console.error('Error deleting brand:', error);
      showToast('Failed to delete brand', 'error');
    }
  }
}

// Select Brand from list
function selectBrand(name) {
  document.getElementById('itemBrand').value = name;
  closeManageBrandsModal();
}

// Render Brands List
function renderBrandsList() {
  const listContainer = document.getElementById('brandsList');
  if (!listContainer) return;

  if (brands.length === 0) {
    listContainer.innerHTML = '<div class="manage-list-empty">No brands added yet</div>';
    return;
  }

  listContainer.innerHTML = brands.map((name, index) => `
    <div class="manage-list-item" onclick="selectBrand('${name}')">
      <span class="manage-list-item-name">${name}</span>
      <div class="manage-list-item-actions">
        <button class="manage-list-action-btn btn-edit" onclick="event.stopPropagation(); editBrand(${index})">Edit</button>
        <button class="manage-list-action-btn btn-delete" onclick="event.stopPropagation(); deleteBrand(${index})">Delete</button>
      </div>
    </div>
  `).join('');
}

// Update brand dropdown with current list
function updateBrandDropdown() {
  const select = document.getElementById('itemBrand');
  if (!select) return;

  // Clear and rebuild options
  select.innerHTML = `
    <option value="">Select or Add Brand</option>
    ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
    <option value="__manage__">⚙️ Manage Brands</option>
  `;
}

// Search items by Name and Description
function searchItemsByNameDesc() {
  const searchInput = document.getElementById('itemSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Update the filters object
  filters.search = searchTerm;

  // Re-render the table with the search filter applied
  renderItemsTable();
}

// Toggle select all checkboxes
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('selectAllItems');
  const itemCheckboxes = document.querySelectorAll('.item-checkbox');

  if (selectAllCheckbox) {
    const isChecked = selectAllCheckbox.checked;
    selectedItems = []; // Reset selected items array

    itemCheckboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
      const row = checkbox.closest('tr');
      if (isChecked) {
        const itemId = parseInt(checkbox.dataset.itemId);
        if (!selectedItems.includes(itemId)) {
          selectedItems.push(itemId);
        }
        if (row) row.classList.add('selected');
      } else {
        if (row) row.classList.remove('selected');
      }
    });

    updateBulkActionToolbar();
  }
}

// Update header checkbox based on individual selections
function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('selectAllItems');
  const itemCheckboxes = document.querySelectorAll('.item-checkbox');

  if (selectAllCheckbox && itemCheckboxes.length > 0) {
    const checkedCount = document.querySelectorAll('.item-checkbox:checked').length;

    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === itemCheckboxes.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// Column Configuration for Customize Columns feature
const allColumns = [
  { id: 'name', label: 'Name', visible: true, locked: true },
  { id: 'sku', label: 'SKU', visible: true, locked: false },
  { id: 'stock_on_hand', label: 'Stock On Hand', visible: true, locked: false },
  { id: 'reorder_level', label: 'Reorder Level', visible: true, locked: false },
  { id: 'account_name', label: 'Account Name', visible: false, locked: false },
  { id: 'brand', label: 'Brand', visible: false, locked: false },
  { id: 'description', label: 'Description', visible: true, locked: false },
  { id: 'dimensions', label: 'Dimensions', visible: true, locked: false },
  { id: 'ean', label: 'EAN', visible: false, locked: false },
  { id: 'isbn', label: 'ISBN', visible: false, locked: false },
  { id: 'manufacturer', label: 'Manufacturer', visible: false, locked: false },
  { id: 'purchase_account', label: 'Purchase Account Name', visible: false, locked: false },
  { id: 'purchase_description', label: 'Purchase Description', visible: false, locked: false },
  { id: 'purchase_rate', label: 'Purchase Rate', visible: false, locked: false },
  { id: 'rate', label: 'Rate', visible: false, locked: false },
  { id: 'type', label: 'Type', visible: true, locked: false },
  { id: 'upc', label: 'UPC', visible: false, locked: false },
  { id: 'usage_unit', label: 'Usage Unit', visible: false, locked: false },
  { id: 'weight', label: 'Weight', visible: false, locked: false }
];

let columnSettings = JSON.parse(JSON.stringify(allColumns)); // Working copy

// Toggle filter dropdown menu
function toggleFilterDropdown(event) {
  event.stopPropagation();
  const menu = document.getElementById('filterDropdownMenu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

// Close filter dropdown menu
function closeFilterDropdown() {
  const menu = document.getElementById('filterDropdownMenu');
  if (menu) {
    menu.classList.remove('active');
  }
}

// Toggle clip text mode - switches between Clip Text and Wrap Text
let clipTextEnabled = false;
function toggleClipText() {
  clipTextEnabled = !clipTextEnabled;
  const table = document.querySelector('.items-table');
  if (table) {
    if (clipTextEnabled) {
      // Clip Text mode ON - text will be truncated
      table.classList.add('clip-text-mode');
      table.classList.remove('wrap-text-mode');
      updateClipTextMenuItem('Wrap Text', '↩️');
      if (typeof showToast === 'function') {
        showToast('Clip Text enabled - Click Wrap Text to expand', 'success');
      }
    } else {
      // Wrap Text mode ON - text will wrap
      table.classList.remove('clip-text-mode');
      table.classList.add('wrap-text-mode');
      updateClipTextMenuItem('Clip Text', '📋');
      if (typeof showToast === 'function') {
        showToast('Wrap Text enabled - Text will wrap', 'success');
      }
    }
  }
}

// Update the clip/wrap text menu item
function updateClipTextMenuItem(text, icon) {
  // Update in the dynamically rendered header
  renderTableHeader();
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
  const dropdown = document.getElementById('filterDropdownMenu');
  const filterIcon = document.querySelector('.zoho-filter-icon');
  if (dropdown && !dropdown.contains(e.target) && e.target !== filterIcon) {
    dropdown.classList.remove('active');
  }
});

// Open Customize Columns modal
function openCustomizeColumns() {
  const modal = document.getElementById('customizeColumnsModal');
  if (modal) {
    modal.classList.add('active');
    columnSettings = JSON.parse(JSON.stringify(allColumns)); // Reset to saved state
    renderColumnsList();
    updateColumnCount();
  }
}

// Close Customize Columns modal
function closeCustomizeColumns() {
  const modal = document.getElementById('customizeColumnsModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Close modal when clicking outside the panel
document.addEventListener('mousedown', function (e) {
  const modal = document.getElementById('customizeColumnsModal');
  if (modal && modal.classList.contains('active')) {
    if (e.target === modal) {
      closeCustomizeColumns();
    }
  }
});

// Render the columns list in the modal
function renderColumnsList(filter = '') {
  const list = document.getElementById('columnsList');
  if (!list) return;

  const filteredColumns = columnSettings.filter(col =>
    col.label.toLowerCase().includes(filter.toLowerCase())
  );

  list.innerHTML = filteredColumns.map(col => `
    <div class="column-item ${col.locked ? 'locked' : ''} ${col.visible ? 'checked' : ''}" 
         data-column-id="${col.id}"
         onclick="${col.locked ? '' : `toggleColumnVisibility('${col.id}')`}">
      <span class="column-drag-handle">⋮⋮</span>
      ${col.locked
      ? `<span class="column-lock-icon">🔒</span>`
      : `<input type="checkbox" class="column-checkbox" 
            ${col.visible ? 'checked' : ''} 
            style="pointer-events: none;">`
    }
      <span class="column-name">${col.label}</span>
    </div>
  `).join('');
}

// Filter columns by search term
function filterColumns() {
  const searchInput = document.getElementById('columnSearchInput');
  const filter = searchInput ? searchInput.value : '';
  renderColumnsList(filter);
}

// Toggle column visibility
function toggleColumnVisibility(columnId) {
  const col = columnSettings.find(c => c.id === columnId);
  if (col && !col.locked) {
    col.visible = !col.visible;
    updateColumnCount();
    renderColumnsList(document.getElementById('columnSearchInput')?.value || '');
  }
}

// Update the selected count display
function updateColumnCount() {
  const selectedCount = document.getElementById('selectedColumnCount');
  const totalCount = document.getElementById('totalColumnCount');

  if (selectedCount) {
    selectedCount.textContent = columnSettings.filter(c => c.visible).length;
  }
  if (totalCount) {
    totalCount.textContent = columnSettings.length;
  }
}

// Save column settings
function saveColumnSettings() {
  // Copy settings to the main array
  allColumns.length = 0;
  columnSettings.forEach(col => allColumns.push(JSON.parse(JSON.stringify(col))));

  // Save to localStorage for persistence
  try {
    localStorage.setItem('itemsColumnSettings', JSON.stringify(allColumns));
  } catch (e) {
    console.log('Could not save column settings to localStorage');
  }

  // Close modal
  closeCustomizeColumns();

  // Refresh the table with new column visibility
  renderItemsTable();

  if (typeof showToast === 'function') {
    showToast('Column settings saved', 'success');
  }
}

// Load column settings from localStorage on page load
function loadColumnSettings() {
  try {
    const saved = localStorage.getItem('itemsColumnSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      allColumns.length = 0;
      parsed.forEach(col => allColumns.push(col));
    }
  } catch (e) {
    console.log('Could not load column settings from localStorage');
  }
}

// Render the table header dynamically based on visible columns
function renderTableHeader() {
  const thead = document.querySelector('.items-table thead');
  if (!thead) return;

  const visibleColumns = allColumns.filter(col => col.visible);
  const colCount = visibleColumns.length + 3; // +3 for filter, checkbox, and search columns

  // Determine clip/wrap text button label
  const clipWrapText = clipTextEnabled ? 'Wrap Text' : 'Clip Text';
  const clipWrapIcon = clipTextEnabled ? '↩️' : '📋';

  let headerHTML = `
    <tr>
      <th class="zoho-th-filter">
        <div class="filter-dropdown-container">
          <span class="zoho-filter-icon" onclick="toggleFilterDropdown(event)">
            <svg class="icon fill-linkblue" width="16" height="16" viewBox="0 0 24 24" fill="#3b82f6">
              <path d="M3 5h2v2H3V5zm4 0h14v2H7V5zm-4 6h2v2H3v-2zm4 0h14v2H7v-2zm-4 6h2v2H3v-2zm4 0h14v2H7v-2z"/>
            </svg>
          </span>
          <div class="filter-dropdown-menu" id="filterDropdownMenu">
            <div class="filter-dropdown-item" onclick="openCustomizeColumns(); closeFilterDropdown();">
              <span class="filter-dropdown-icon">⚙️</span>
              <span>Customize Columns</span>
            </div>
            <div class="filter-dropdown-item" onclick="toggleClipText(); closeFilterDropdown();">
              <span class="filter-dropdown-icon">${clipWrapIcon}</span>
              <span>${clipWrapText}</span>
            </div>
          </div>
        </div>
      </th>
      <th class="zoho-th-checkbox"><input type="checkbox" id="selectAllItems" onclick="toggleSelectAll()"></th>
  `;

  visibleColumns.forEach(col => {
    const sortIcon = col.id === 'sku' ? ' ⇅' : '';
    const alignClass = ['stock_on_hand', 'reorder_level', 'rate', 'purchase_rate'].includes(col.id)
      ? 'style="text-align: right;"'
      : '';
    headerHTML += `<th class="zoho-th-${col.id}" ${alignClass}>${col.label.toUpperCase()}${sortIcon}</th>`;
  });

  headerHTML += `
      <th class="zoho-th-search" onclick="openAdvancedSearch()" style="cursor:pointer;" title="Advanced Search">🔍</th>
    </tr>
  `;

  thead.innerHTML = headerHTML;
}

// Get the value for a column from an item
function getColumnValue(item, columnId) {
  switch (columnId) {
    case 'name':
      const imageHtml = item.image_url
        ? `<img src="${item.image_url}" alt="${item.name}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px;">`
        : `<div style="width: 32px; height: 32px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 14px;">📦</div>`;
      return `
        <div class="zoho-item-row">
          <div class="zoho-item-thumb">${imageHtml}</div>
          <a href="#" class="zoho-item-link" onclick="event.preventDefault(); selectItem(${item.id});">${item.name}</a>
        </div>
      `;
    case 'sku':
      return item.sku || '-';
    case 'stock_on_hand':
      const stock = parseFloat(item.stock_quantity || 0);
      return Number.isInteger(stock) ? stock.toString() : stock.toFixed(2);
    case 'reorder_level':
      if (!item.reorder_point) return '';
      const reorder = parseFloat(item.reorder_point);
      return Number.isInteger(reorder) ? reorder.toString() : reorder.toFixed(2);
    case 'account_name':
      return item.account || '';
    case 'brand':
      return item.brand || '';
    case 'description':
      return item.description || '';
    case 'dimensions':
      return item.dimensions || '';
    case 'ean':
      return item.ean || '';
    case 'isbn':
      return item.isbn || '';
    case 'manufacturer':
      return item.manufacturer || '';
    case 'purchase_account':
      return item.purchase_account || '';
    case 'purchase_description':
      return item.purchase_description || '';
    case 'purchase_rate':
      if (!item.purchase_cost) return '';
      const purchaseRate = parseFloat(item.purchase_cost);
      return Number.isInteger(purchaseRate) ? purchaseRate.toString() : purchaseRate.toFixed(2);
    case 'rate':
      if (!item.selling_price) return '';
      const rate = parseFloat(item.selling_price);
      return Number.isInteger(rate) ? rate.toString() : rate.toFixed(2);
    case 'type':
      return item.type || '';
    case 'upc':
      return item.upc || '';
    case 'usage_unit':
      return item.unit || 'pcs';
    case 'weight':
      return item.weight || '';
    default:
      return '';
  }
}

function generateSku() {
  // 8-character alphanumeric SKU
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let sku = '';
  for (let i = 0; i < 8; i++) {
    sku += chars[Math.floor(Math.random() * chars.length)];
  }
  return sku;
}

// Handle image upload - convert to base64
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  processImageFile(file);
}

// Process image file (used by both click upload and drag/drop)
function processImageFile(file) {
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    if (typeof showToast === 'function') {
      showToast('Image size must be less than 5MB', 'error');
    } else {
      alert('Image size must be less than 5MB');
    }
    return;
  }

  // Check if it's an image
  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') {
      showToast('Please upload an image file', 'error');
    } else {
      alert('Please upload an image file');
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;
    const imageUrlInput = document.getElementById('itemImageUrl');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreview');
    const dropzoneContent = document.getElementById('imageDropzoneContent');

    if (imageUrlInput) imageUrlInput.value = base64;
    if (previewImg) previewImg.src = base64;
    if (previewContainer) previewContainer.style.display = 'block';
    if (dropzoneContent) dropzoneContent.style.display = 'none';

    if (typeof showToast === 'function') {
      showToast('Image uploaded successfully', 'success');
    }
  };
  reader.readAsDataURL(file);
}

// Handle drag over
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('imageDropzone');
  if (dropzone) {
    dropzone.style.borderColor = '#3b82f6';
    dropzone.style.background = '#eff6ff';
  }
}

// Handle drag leave
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('imageDropzone');
  if (dropzone) {
    dropzone.style.borderColor = '#d1d5db';
    dropzone.style.background = 'white';
  }
}

// Handle drop
function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const dropzone = document.getElementById('imageDropzone');
  if (dropzone) {
    dropzone.style.borderColor = '#d1d5db';
    dropzone.style.background = 'white';
  }

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    processImageFile(files[0]);
  }
}

// Trigger image upload - only if not clicking on remove button
function triggerImageUpload(event) {
  // Don't trigger if clicking on the remove button or preview container
  if (event.target.classList.contains('image-remove-btn')) {
    return;
  }
  // Only trigger if dropzone content is visible (no image uploaded yet)
  const dropzoneContent = document.getElementById('imageDropzoneContent');
  const previewContainer = document.getElementById('imagePreviewContainer');

  if (dropzoneContent && dropzoneContent.style.display !== 'none') {
    document.getElementById('imageFileInput').click();
  } else if (previewContainer && previewContainer.style.display === 'none') {
    document.getElementById('imageFileInput').click();
  }
}

// Remove uploaded image
function removeUploadedImage(event) {
  event.preventDefault();
  event.stopPropagation();

  const imageUrlInput = document.getElementById('itemImageUrl');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const dropzoneContent = document.getElementById('imageDropzoneContent');
  const imageFileInput = document.getElementById('imageFileInput');

  // Clear the image data
  if (imageUrlInput) imageUrlInput.value = '';
  if (previewImg) previewImg.src = '';
  if (imageFileInput) imageFileInput.value = '';

  // Hide preview, show dropzone content
  if (previewContainer) previewContainer.style.display = 'none';
  if (dropzoneContent) dropzoneContent.style.display = 'block';

  showToast('Image removed', 'info');
}

// Reset image upload section
function resetImageUploadNew() {
  const imageUrlInput = document.getElementById('itemImageUrl');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const dropzoneContent = document.getElementById('imageDropzoneContent');

  if (imageUrlInput) imageUrlInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewContainer) previewContainer.style.display = 'none';
  if (dropzoneContent) dropzoneContent.style.display = 'block';
}

// Reset image upload section
function resetImageUpload() {
  const imageUrlInput = document.getElementById('itemImageUrl');
  const imageFileInput = document.getElementById('imageFileInput');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const dropzoneContent = document.getElementById('imageDropzoneContent');
  const dropzone = document.getElementById('imageDropzone');

  if (imageUrlInput) imageUrlInput.value = '';
  if (imageFileInput) imageFileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewContainer) previewContainer.style.display = 'none';
  if (dropzoneContent) dropzoneContent.style.display = '';
  if (dropzone) {
    dropzone.style.border = '2px dashed #d1d5db';
    dropzone.classList.remove('has-image');
  }
}

// Set image preview (for editing existing item)
function setImagePreview(imageUrl) {
  if (imageUrl) {
    const imageUrlInput = document.getElementById('itemImageUrl');
    const previewImg = document.getElementById('previewImg');
    const imagePreview = document.getElementById('imagePreview');
    const imagePlaceholder = document.getElementById('imagePlaceholder');
    const imageUploadBox = document.getElementById('imageUploadBox');

    if (imageUrlInput) imageUrlInput.value = imageUrl;
    if (previewImg) previewImg.src = imageUrl;
    if (imagePreview) imagePreview.style.display = 'block';
    if (imagePlaceholder) imagePlaceholder.style.display = 'none';
    if (imageUploadBox) {
      imageUploadBox.style.border = '2px solid #d84040';
      imageUploadBox.classList.add('has-image');
    }
  } else {
    resetImageUpload();
  }
}

// Toast notification - use global function from global-features.js
// Use a flag to prevent infinite recursion
let isShowingToast = false;

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}

// Load items
async function loadItems() {
  try {
    const result = await itemsAPI.getAll();
    items = Array.isArray(result) ? result : [];

    // Clear loading state
    const productsGrid = document.getElementById('productsGrid');
    const itemsTableBody = document.getElementById('itemsTableBody');

    if (productsGrid && productsGrid.querySelector('.spinner')) {
      // Loading state will be cleared by renderProductCards
    }
    if (itemsTableBody && itemsTableBody.querySelector('.spinner')) {
      // Loading state will be cleared by renderItemsTable
    }

    renderItemsTable();
    renderProductCards();
    loadItemGroups();
  } catch (error) {
    console.error('Error loading items:', error);

    // Ensure items is an array even on error
    items = [];

    // Clear loading state and show error
    const productsGrid = document.getElementById('productsGrid');
    const itemsTableBody = document.getElementById('itemsTableBody');

    if (productsGrid) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: #868e96;">
          <div style="font-size: 64px; margin-bottom: 16px; opacity: 0.5;">⚠️</div>
          <h3>Failed to load items</h3>
          <p>${error.message || 'Please try refreshing the page'}</p>
          <button class="btn btn-primary" onclick="loadItems()" style="margin-top: 16px;">Retry</button>
        </div>
      `;
    }

    if (itemsTableBody) {
      itemsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Failed to load items</div>
            <div class="empty-state-text">${error.message || 'Please try refreshing the page'}</div>
            <button class="btn btn-primary" onclick="loadItems()" style="margin-top: 16px;">Retry</button>
          </td>
        </tr>
      `;
    }

    if (typeof showToast === 'function') {
      showToast('Failed to load items: ' + (error.message || 'Unknown error'), 'error');
    } else {
      console.error('Failed to load items:', error);
    }
  }
}

// Load item groups
async function loadItemGroups() {
  try {
    itemGroups = await itemsAPI.getGroups();

    // Populate category filter
    const filterCategory = document.getElementById('filterCategory');
    if (filterCategory) {
      filterCategory.innerHTML = '<option value="">All Categories</option>' +
        itemGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }

    // Populate item category select in modal
    const itemCategory = document.getElementById('itemCategory');
    if (itemCategory) {
      itemCategory.innerHTML = '<option value="">Select Category</option>' +
        itemGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading item groups:', error);
  }
}

// Render items table
function renderItemsTable() {
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) return;

  // Ensure items is an array
  if (!Array.isArray(items)) {
    items = [];
  }

  // Apply the items filter (All Items, Active Items, etc.) first
  let filteredItems = isAdvancedSearchActive && advancedSearchResults
    ? [...advancedSearchResults]
    : [...items];

  // Apply currentItemsFilter
  switch (currentItemsFilter) {
    case 'all':
      // Show all items - no filter
      break;
    case 'active':
      filteredItems = filteredItems.filter(item => !item.status || item.status === 'active');
      break;
    case 'inactive':
      filteredItems = filteredItems.filter(item => item.status === 'inactive');
      break;
    case 'ungrouped':
      filteredItems = filteredItems.filter(item => !item.group_id);
      break;
    case 'lowstock':
      filteredItems = filteredItems.filter(item => {
        const qty = parseFloat(item.stock_quantity) || 0;
        const reorderPoint = parseFloat(item.reorder_point);
        // Only show items that have a reorder point set and stock is at or below it
        return !isNaN(reorderPoint) && reorderPoint > 0 && qty <= reorderPoint;
      });
      break;
    case 'inventory':
      filteredItems = filteredItems.filter(item => !item.type || item.type === 'goods');
      break;
    case 'sales':
      if (salesFilteredItemIds) {
        filteredItems = filteredItems.filter(item => salesFilteredItemIds.has(parseInt(item.id)));
      }
      break;
    case 'purchases':
      if (purchaseFilteredItemIds) {
        filteredItems = filteredItems.filter(item => purchaseFilteredItemIds.has(parseInt(item.id)));
      }
      break;
    default:
      break;
  }

  // Filter by category
  if (filters.category) {
    filteredItems = filteredItems.filter(item =>
      item.group_id && item.group_id.toString() === filters.category
    );
  }

  // Filter by search term (Name, Description, SKU)
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(item => {
      // Search across multiple fields - name, description, SKU, barcode, UPC, EAN, ISBN, manufacturer, brand
      const searchFields = [
        item.name,
        item.description,
        item.sku,
        item.barcode,
        item.upc,
        item.ean,
        item.isbn,
        item.manufacturer,
        item.brand,
        item.unit,
        String(item.id), // Allow searching by item ID
        String(item.selling_price || ''), // Allow searching by price
        String(item.stock_quantity || '') // Allow searching by stock quantity
      ];

      // Check if any field contains the search term
      return searchFields.some(field =>
        field && field.toString().toLowerCase().includes(searchTerm)
      );
    });
  }

  // Filter by stock status - use fixed threshold of 20
  const lowStockThreshold = 20;
  if (filters.stock === 'in-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > lowStockThreshold;
    });
  } else if (filters.stock === 'low-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > 0 && stock <= lowStockThreshold;
    });
  } else if (filters.stock === 'out-of-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock <= 0;
    });
  }

  // Sort items
  const dir = sortDirection === 'desc' ? -1 : 1;
  filteredItems.sort((a, b) => {
    switch (filters.sort) {
      case 'name':
        return dir * (a.name || '').localeCompare(b.name || '');
      case 'sku':
        return dir * (a.sku || '').localeCompare(b.sku || '');
      case 'stock_on_hand':
        return dir * ((parseFloat(a.stock_quantity) || 0) - (parseFloat(b.stock_quantity) || 0));
      case 'reorder_level':
        return dir * ((parseFloat(a.reorder_point) || 0) - (parseFloat(b.reorder_point) || 0));
      case 'purchase_rate':
        return dir * ((parseFloat(a.purchase_cost) || 0) - (parseFloat(b.purchase_cost) || 0));
      case 'rate':
        return dir * ((parseFloat(a.selling_price) || 0) - (parseFloat(b.selling_price) || 0));
      case 'created_time':
        return dir * (new Date(a.created_at || 0) - new Date(b.created_at || 0));
      case 'last_modified_time':
        return dir * (new Date(a.updated_at || a.created_at || 0) - new Date(b.updated_at || b.created_at || 0));
      // Legacy sort keys
      case 'name-desc':
        return -1 * (a.name || '').localeCompare(b.name || '');
      case 'stock':
        return (parseFloat(a.stock_quantity) || 0) - (parseFloat(b.stock_quantity) || 0);
      case 'stock-desc':
        return (parseFloat(b.stock_quantity) || 0) - (parseFloat(a.stock_quantity) || 0);
      case 'price':
        return (parseFloat(a.selling_price) || 0) - (parseFloat(b.selling_price) || 0);
      case 'price-desc':
        return (parseFloat(b.selling_price) || 0) - (parseFloat(a.selling_price) || 0);
      default:
        return 0;
    }
  });

  // Get visible columns for counting
  const visibleCols = allColumns.filter(col => col.visible);
  const totalColCount = visibleCols.length + 3; // +3 for filter, checkbox, and search columns

  // Render header even for empty state
  renderTableHeader();

  if (filteredItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${totalColCount}" class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">No items found</div>
          <div class="empty-state-text">Try adjusting your filters or add a new item</div>
          <button class="btn btn-primary" onclick="openItemModal()" style="margin-top: 16px;">Add First Item</button>
        </td>
      </tr>
    `;
    var paginationEl = document.getElementById('itemsPaginationContainer');
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  function renderItemsPage(pageData) {
    tbody.innerHTML = pageData.map(item => {
      const stock = parseInt(item.stock_quantity) || 0;
      const isSelected = selectedItemId === item.id ? 'selected' : '';
      const isInactive = item.status === 'inactive' ? 'item-inactive' : '';

      // Build dynamic columns based on visibility settings
      let columnCells = '';
      visibleCols.forEach(col => {
        const value = getColumnValue(item, col.id);
        const alignClass = ['stock_on_hand', 'reorder_level', 'rate', 'purchase_rate'].includes(col.id)
          ? 'style="text-align: right;"'
          : '';
        columnCells += `<td class="zoho-td-${col.id}" ${alignClass}>${value}</td>`;
      });

      return `
        <tr class="${isSelected} ${isInactive} ${selectedItems.includes(item.id) ? 'selected' : ''}" onclick="selectItem(${item.id})">
          <td class="zoho-td-filter"></td>
          <td class="zoho-td-checkbox" onclick="event.stopPropagation();">
            <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" ${selectedItems.includes(item.id) ? 'checked' : ''}>
          </td>
          ${columnCells}
          <td class="zoho-td-search"></td>
        </tr>
      `;
    }).join('');

    // Attach event listeners to checkboxes after rendering
    attachCheckboxListeners();
    updateBulkActionToolbar();
  }

  if (typeof Pagination !== 'undefined') {
    if (!window.itemsPager) {
      window.itemsPager = Pagination.create({
        data: filteredItems,
        perPage: 14,
        containerId: 'itemsPaginationContainer',
        onPageChange: function (pageData) { renderItemsPage(pageData); }
      });
    } else {
      window.itemsPager.updateData(filteredItems);
    }
  } else {
    // Fallback if pagination.js not loaded
    renderItemsPage(filteredItems);
  }
}

// Attach event listeners to all checkboxes
function attachCheckboxListeners() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.removeEventListener('change', handleCheckboxChangeEvent);
    checkbox.addEventListener('change', handleCheckboxChangeEvent);
  });
}

// Event handler for checkbox change
function handleCheckboxChangeEvent(e) {
  e.stopPropagation();
  const checkbox = e.target;
  const itemId = parseInt(checkbox.dataset.itemId);

  if (checkbox.checked) {
    if (!selectedItems.includes(itemId)) {
      selectedItems.push(itemId);
    }
    // Add selected class to row
    checkbox.closest('tr').classList.add('selected');
  } else {
    selectedItems = selectedItems.filter(id => id !== itemId);
    // Remove selected class from row
    checkbox.closest('tr').classList.remove('selected');
  }

  updateBulkActionToolbar();
  updateSelectAllCheckbox();
}

// Select item and show detail panel
async function selectItem(itemId) {
  selectedItemId = itemId;
  renderItemsTable();

  // Open the fullscreen item detail view
  openItemDetailView(itemId);
}

// Close item detail panel
function closeItemDetail() {
  selectedItemId = null;
  const panel = document.getElementById('itemDetailPanel');
  const container = document.getElementById('itemsContainer');

  panel.style.display = 'none';
  container.classList.remove('has-detail');
  panel.classList.remove('active');
  renderItemsTable();
}

// Render item detail panel
async function renderItemDetail(item) {
  const panel = document.getElementById('itemDetailPanel');
  const stock = item.stock_quantity || 0;
  const reorderPoint = item.reorder_point || 20;

  // Get item history (sales and purchases)
  let salesHistory = [];
  let purchaseHistory = [];
  let stockMovements = [];

  try {
    // Fetch sales history
    const sales = await salesAPI.getAll({ item_id: item.id, limit: 5 });
    salesHistory = sales || [];

    // Fetch purchase history
    const purchases = await purchasesAPI.getAll({ item_id: item.id, limit: 5 });
    purchaseHistory = purchases || [];

    // Fetch stock movements
    const movements = await inventoryAPI.getTransactions({ item_id: item.id, limit: 10 });
    stockMovements = movements || [];
  } catch (error) {
    console.error('Error loading item history:', error);
  }

  panel.innerHTML = `
    <div class="detail-header">
      <button class="detail-close" onclick="closeItemDetail()">×</button>
      <div class="detail-item-name">${item.name}</div>
      <div class="detail-item-sku">SKU: ${item.sku || 'N/A'} ${item.barcode ? `• Barcode: ${item.barcode}` : ''}</div>
    </div>
    
    <div class="detail-content">
      <!-- Stats Overview -->
      <div class="detail-section">
        <div class="detail-section-title">Overview</div>
        <div class="detail-stat-grid">
          <div class="stat-card">
            <div class="stat-label">Current Stock</div>
            <div class="stat-value ${stock <= reorderPoint ? 'danger' : 'success'}">${stock}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Reorder Point</div>
            <div class="stat-value">${reorderPoint}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Selling Price</div>
            <div class="stat-value">${formatCurrency(item.selling_price || 0)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Purchase Cost</div>
            <div class="stat-value">${formatCurrency(item.purchase_cost || 0)}</div>
          </div>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="detail-section">
        <div class="detail-section-title">Quick Actions</div>
        <div class="detail-actions">
          <button class="action-btn action-btn-primary" onclick="openStockModal(${item.id})">
            <span>📊 Adjust Stock</span>
          </button>
          <button class="action-btn action-btn-secondary" onclick="editItem(${item.id})">
            <span>✏️ Edit Item</span>
          </button>
          <button class="action-btn action-btn-success" onclick="quickSale(${item.id})">
            <span>💰 Quick Sale</span>
          </button>
          <button class="action-btn action-btn-primary" onclick="openPurchaseOrderModal(${item.id})">
            <span>🛒 Create Purchase Order</span>
          </button>
          <button class="action-btn action-btn-danger" onclick="disableItem(${item.id})">
            <span>🚫 Disable</span>
          </button>
        </div>
      </div>
      
      <!-- Stock Movements -->
      <div class="detail-section">
        <div class="detail-section-title">Stock Movements</div>
        <div class="history-timeline">
          ${stockMovements.length > 0 ? stockMovements.map(movement => `
            <div class="timeline-item">
              <div class="timeline-content">
                <div class="timeline-date">${formatDate(movement.created_at)}</div>
                <div class="timeline-text">
                  ${movement.type === 'in' ? '📥' : '📤'} 
                  ${movement.type === 'in' ? 'Stock In' : 'Stock Out'}: 
                  <span class="timeline-amount">${movement.quantity} ${item.unit || 'pcs'}</span>
                  ${movement.reference ? `<br><small>Ref: ${movement.reference}</small>` : ''}
                </div>
              </div>
            </div>
          `).join('') : '<div style="text-align: center; color: #868e96; padding: 20px;">No stock movements yet</div>'}
        </div>
      </div>
      
      <!-- Sales History -->
      <div class="detail-section">
        <div class="detail-section-title">Recent Sales</div>
        <div class="history-timeline">
          ${salesHistory.length > 0 ? salesHistory.map(sale => `
            <div class="timeline-item">
              <div class="timeline-content">
                <div class="timeline-date">${formatDate(sale.created_at)}</div>
                <div class="timeline-text">
                  💵 Sale: <span class="timeline-amount">${sale.quantity} ${item.unit || 'pcs'}</span> 
                  @ ${formatCurrency(sale.unit_price || 0)}
                  <br><small>Total: ${formatCurrency((sale.quantity || 0) * (sale.unit_price || 0))}</small>
                </div>
              </div>
            </div>
          `).join('') : '<div style="text-align: center; color: #868e96; padding: 20px;">No sales history</div>'}
        </div>
      </div>
      
      <!-- Purchase History -->
      <div class="detail-section">
        <div class="detail-section-title">Recent Purchases</div>
        <div class="history-timeline">
          ${purchaseHistory.length > 0 ? purchaseHistory.map(purchase => `
            <div class="timeline-item">
              <div class="timeline-content">
                <div class="timeline-date">${formatDate(purchase.created_at)}</div>
                <div class="timeline-text">
                  🛒 Purchase: <span class="timeline-amount">${purchase.quantity} ${item.unit || 'pcs'}</span> 
                  @ ${formatCurrency(purchase.unit_cost || 0)}
                  <br><small>Total: ${formatCurrency((purchase.quantity || 0) * (purchase.unit_cost || 0))}</small>
                </div>
              </div>
            </div>
          `).join('') : '<div style="text-align: center; color: #868e96; padding: 20px;">No purchase history</div>'}
        </div>
      </div>
    </div>
  `;
}

// Apply filters
function applyFilters() {
  const categoryEl = document.getElementById('filterCategory');
  const stockEl = document.getElementById('filterStock');
  const sortEl = document.getElementById('filterSort');

  filters.category = categoryEl ? categoryEl.value : '';
  filters.stock = stockEl ? stockEl.value : '';
  filters.sort = sortEl ? sortEl.value : 'name';

  renderItemsTable();
  renderProductCards();
}

// Search items filter (inline search in filter bar)
// Real-time search filter - triggers on every keystroke
function searchItemsFilter() {
  const searchInput = document.getElementById('itemSearchFilter');
  if (!searchInput) return;

  const query = searchInput.value.toLowerCase().trim();

  // Update filters.search so renderProductCards() can use it
  filters.search = query;

  if (query.length === 0) {
    filters.search = '';
    renderItemsTable();
    renderProductCards();
    return;
  }

  // Filter items by search query
  let filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(query) ||
    (item.sku && item.sku.toLowerCase().includes(query))
  );

  // Apply other filters
  if (filters.category) {
    filteredItems = filteredItems.filter(item =>
      item.group_id && item.group_id.toString() === filters.category
    );
  }

  // Filter by stock status - use fixed threshold of 20
  const lowStockThreshold = 20;
  if (filters.stock === 'in-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > lowStockThreshold;
    });
  } else if (filters.stock === 'low-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > 0 && stock <= lowStockThreshold;
    });
  } else if (filters.stock === 'out-of-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock <= 0;
    });
  }

  // Sort
  filteredItems.sort((a, b) => {
    switch (filters.sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'stock': return (a.stock_quantity || 0) - (b.stock_quantity || 0);
      case 'stock-desc': return (b.stock_quantity || 0) - (a.stock_quantity || 0);
      case 'price': return (a.selling_price || 0) - (b.selling_price || 0);
      case 'price-desc': return (b.selling_price || 0) - (a.selling_price || 0);
      default: return 0;
    }
  });

  // Render table - use the same structure as renderItemsTable()
  const tbody = document.getElementById('itemsTableBody');
  if (tbody) {
    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">No items found</div>
            <div class="empty-state-text">Try a different search term</div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = filteredItems.map(item => {
        const stock = parseInt(item.stock_quantity) || 0;
        // Use fixed threshold of 20 for Low Stock status
        const lowStockThreshold = 20;
        let stockBadge = '';

        if (stock <= 0) {
          stockBadge = '<span class="item-badge badge-out-of-stock">Out of Stock</span>';
        } else if (stock <= lowStockThreshold) {
          stockBadge = '<span class="item-badge badge-stock-low">Low Stock</span>';
        } else {
          stockBadge = '<span class="item-badge badge-stock-ok">High Stock</span>';
        }

        const isSelected = selectedItemId === item.id ? 'selected' : '';

        const actionButtons = `
      <div class="table-actions" onclick="event.stopPropagation();">
        <button class="btn-table-action btn-edit" onclick="event.stopPropagation(); editItem(${item.id})" title="Edit Item">
          Edit
        </button>
        <button class="btn-table-action btn-delete" onclick="event.stopPropagation(); deleteItem(${item.id})" title="Delete Item">
          Delete
        </button>
      </div>
    `;

        return `
      <tr class="${isSelected}">
        <td data-label="Item Name">
          <div class="item-name">
            ${item.name}
          </div>
        </td>
        <td data-label="SKU">${item.sku || '-'}</td>
        <td data-label="Unit">${item.unit || 'pcs'}</td>
        <td data-label="Quantity">${Math.floor(item.stock_quantity || 0)}</td>
        <td data-label="Price">${Math.floor(item.selling_price || 0).toLocaleString()}</td>
        <td data-label="Cost">${Math.floor(item.purchase_cost || item.cost || 0).toLocaleString()}</td>
        <td data-label="Status">${stockBadge}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
      }).join('');
    }
  }

  // Always render product cards with updated filters
  renderProductCards();
}

// Open item modal
function openItemModal(itemId = null) {
  const modal = document.getElementById('itemModal');
  const form = document.getElementById('itemForm');

  if (itemId) {
    // Edit mode
    document.querySelector('.new-item-header h2').textContent = 'Edit Item';
    const item = items.find(i => i.id === itemId);
    if (item) {
      document.getElementById('itemId').value = item.id;
      document.getElementById('itemName').value = item.name || '';
      document.getElementById('itemSku').value = item.sku || '';
      document.getElementById('itemUnit').value = item.unit || 'pcs';
      document.getElementById('itemReorderPoint').value = item.reorder_point || '';
      document.getElementById('itemPrice').value = item.selling_price || '';
      document.getElementById('itemCost').value = item.purchase_cost || '';

      // Reset image first, then load if exists
      resetImageUpload();

      // Load image if exists
      if (item.image_url) {
        const imageUrlInput = document.getElementById('itemImageUrl');
        const previewContainer = document.getElementById('imagePreviewContainer');
        const previewImg = document.getElementById('imagePreview');
        const dropzoneContent = document.getElementById('imageDropzoneContent');

        if (imageUrlInput) imageUrlInput.value = item.image_url;
        if (previewImg) previewImg.src = item.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
        if (dropzoneContent) dropzoneContent.style.display = 'none';
      } else {
        // Reset image preview for items without image
        resetImageUpload();
      }

      // Additional fields
      if (document.getElementById('salesDescription')) {
        document.getElementById('salesDescription').value = item.description || '';
      }
      if (document.getElementById('itemUpc')) {
        document.getElementById('itemUpc').value = item.upc || '';
      }
      if (document.getElementById('itemEan')) {
        document.getElementById('itemEan').value = item.ean || '';
      }
      if (document.getElementById('itemIsbn')) {
        document.getElementById('itemIsbn').value = item.isbn || '';
      }
      if (document.getElementById('salesAccount')) {
        const accountValue = item.account || 'Sales';
        document.getElementById('salesAccount').value = accountValue;
        selectedSalesAccount = accountValue;
        const salesAccountText = document.getElementById('salesAccountDropdownText');
        if (salesAccountText) {
          salesAccountText.textContent = accountValue;
          salesAccountText.classList.add('has-value');
        }
      }
      if (document.getElementById('salesTax')) {
        document.getElementById('salesTax').value = item.tax_rate || '';
      }

      // Parse dimensions (format: "L x W x H unit")
      if (item.dimensions && document.getElementById('itemLength')) {
        const dimParts = item.dimensions.split(' x ');
        if (dimParts.length >= 3) {
          document.getElementById('itemLength').value = dimParts[0] || '';
          document.getElementById('itemWidth').value = dimParts[1] || '';
          // Last part contains height and unit
          const lastPart = dimParts[2].split(' ');
          document.getElementById('itemHeight').value = lastPart[0] || '';
          if (lastPart[1] && document.getElementById('dimensionUnit')) {
            document.getElementById('dimensionUnit').value = lastPart[1] || 'cm';
          }
        }
      }

      // Manufacturer and Brand dropdowns
      if (item.manufacturer && document.getElementById('itemManufacturer')) {
        document.getElementById('itemManufacturer').value = item.manufacturer;
        const mfgText = document.getElementById('manufacturerDropdownText');
        if (mfgText) mfgText.textContent = item.manufacturer;
      }
      if (item.brand && document.getElementById('itemBrand')) {
        document.getElementById('itemBrand').value = item.brand;
        const brandText = document.getElementById('brandDropdownText');
        if (brandText) brandText.textContent = item.brand;
      }

      // Type (goods/service)
      if (item.type) {
        const typeRadio = document.querySelector(`input[name="itemType"][value="${item.type}"]`);
        if (typeRadio) typeRadio.checked = true;
      }
      onItemTypeChange();

      // Weight (format: "value unit")
      if (item.weight && document.getElementById('itemWeight')) {
        const weightParts = item.weight.split(' ');
        document.getElementById('itemWeight').value = weightParts[0] || '';
        if (weightParts[1] && document.getElementById('weightUnit')) {
          document.getElementById('weightUnit').value = weightParts[1] || 'kg';
        }
      }

      // Purchase account and description
      if (document.getElementById('purchaseAccount')) {
        document.getElementById('purchaseAccount').value = item.purchase_account || 'cost_of_goods';
        const purchaseAccountText = document.getElementById('purchaseAccountDropdownText');
        if (purchaseAccountText && item.purchase_account) {
          purchaseAccountText.textContent = item.purchase_account;
        }
      }
      if (document.getElementById('purchaseDescription')) {
        document.getElementById('purchaseDescription').value = item.purchase_description || '';
      }
      // Populate preferred vendor
      if (document.getElementById('preferredVendor')) {
        document.getElementById('preferredVendor').value = item.preferred_vendor || '';
      }
      // Populate Added By
      if (document.getElementById('itemAddedBy')) {
        document.getElementById('itemAddedBy').value = item.added_by || '';
      }
      const vendorText = document.getElementById('vendorDropdownText');
      if (vendorText) {
        vendorText.textContent = item.preferred_vendor || '';
        if (item.preferred_vendor) vendorText.classList.add('has-value');
        else vendorText.classList.remove('has-value');
      }
    }
  } else {
    // Add mode
    document.querySelector('.new-item-header h2').textContent = 'New Item';
    form.reset();
    document.getElementById('itemId').value = '';
    // SKU is optional - leave blank for user to fill
    document.getElementById('itemSku').value = '';
    // Set defaults
    document.getElementById('itemUnit').value = 'pcs';
    document.getElementById('itemReturnable').checked = true;
    document.getElementById('itemSellable').checked = true;
    document.getElementById('itemPurchasable').checked = true;
    document.getElementById('trackInventory').checked = true;
    // Reset image upload for new items
    resetImageUpload();
    // Reset Added By
    if (document.getElementById('itemAddedBy')) {
      document.getElementById('itemAddedBy').value = '';
    }
    onItemTypeChange();
  }

  modal.classList.add('active');
}

// Show Add Item Modal (called from + New button)
function showAddItemModal() {
  openItemModal(null);
}

// Close item modal
function closeItemModal() {
  const modal = document.getElementById('itemModal');
  modal.classList.remove('active');
  document.getElementById('itemForm').reset();
  resetImageUpload();
}

// Save item (called from Save button)
async function saveItem(event) {
  if (event) event.preventDefault();

  console.log('saveItem called');

  const itemId = document.getElementById('itemId')?.value || '';
  const nameInput = document.getElementById('itemName')?.value?.trim() || '';
  const skuInput = document.getElementById('itemSku')?.value?.trim() || '';
  const unitInput = document.getElementById('itemUnit')?.value || 'pcs';
  const quantityInput = document.getElementById('itemQuantity')?.value || '0';
  const reorderPointInput = document.getElementById('itemReorderPoint')?.value || '10';
  const priceInput = document.getElementById('itemPrice')?.value || '0';
  const costInput = document.getElementById('itemCost')?.value || '0';
  const wholesaleInput = document.getElementById('itemWholesale')?.checked || false;
  const imageUrl = document.getElementById('itemImageUrl')?.value || null;
  const manufacturerInput = document.getElementById('itemManufacturer')?.value || null;
  const brandInput = document.getElementById('itemBrand')?.value || null;

  // Additional fields
  const descriptionInput = document.getElementById('salesDescription')?.value?.trim() || null;
  const upcInput = document.getElementById('itemUpc')?.value?.trim() || null;
  const eanInput = document.getElementById('itemEan')?.value?.trim() || null;
  const isbnInput = document.getElementById('itemIsbn')?.value?.trim() || null;
  const accountInput = document.getElementById('salesAccount')?.value || null;
  const taxRateInput = document.getElementById('salesTax')?.value || null;

  // Type (goods/service)
  const typeInput = document.querySelector('input[name="itemType"]:checked')?.value || 'goods';

  // Purchase information
  const purchaseAccountInput = document.getElementById('purchaseAccount')?.value || null;
  const purchaseDescriptionInput = document.getElementById('purchaseDescription')?.value.trim() || null;
  const preferredVendorInput = document.getElementById('preferredVendor')?.value?.trim() || null;

  // Dimensions - combine into a single string
  const length = document.getElementById('itemLength')?.value || '';
  const width = document.getElementById('itemWidth')?.value || '';
  const height = document.getElementById('itemHeight')?.value || '';
  const dimensionUnit = document.getElementById('dimensionUnit')?.value || 'cm';
  let dimensionsInput = null;
  if (length || width || height) {
    dimensionsInput = `${length} x ${width} x ${height} ${dimensionUnit}`.trim();
  }

  // Weight - combine into a single string
  const weightValue = document.getElementById('itemWeight')?.value || '';
  const weightUnit = document.getElementById('weightUnit')?.value || 'kg';
  let weightInput = null;
  if (weightValue) {
    weightInput = `${weightValue} ${weightUnit}`.trim();
  }

  // Validate inputs
  if (!nameInput) {
    showToast('Item name is required', 'error');
    return;
  }

  // Validate SKU uniqueness (if SKU is provided)
  if (skuInput) {
    const existingItem = items.find(item => {
      // Skip current item if editing
      if (itemId && item.id.toString() === itemId.toString()) {
        return false;
      }
      // Check if SKU matches (case-insensitive)
      return item.sku && item.sku.toLowerCase() === skuInput.toLowerCase();
    });

    if (existingItem) {
      showToast(`SKU "${skuInput}" already exists! Please use a different SKU.`, 'error');
      // Focus on SKU field
      const skuField = document.getElementById('itemSku');
      if (skuField) {
        skuField.focus();
        skuField.select();
      }
      return;
    }
  }

  const quantity = parseInt(quantityInput) || 0;
  const price = parseFloat(priceInput) || 0;
  const reorderPoint = parseInt(reorderPointInput) || 10;
  const cost = parseFloat(costInput) || 0;

  const data = {
    name: nameInput,
    sku: skuInput || null,
    unit: unitInput,
    quantity: quantity,
    reorder_point: reorderPoint,
    price: price,
    cost: cost,
    can_be_wholesale: wholesaleInput,
    image_url: imageUrl,
    manufacturer: manufacturerInput,
    brand: brandInput,
    description: descriptionInput,
    upc: upcInput,
    ean: eanInput,
    isbn: isbnInput,
    dimensions: dimensionsInput,
    account: accountInput,
    tax_rate: taxRateInput,
    type: typeInput,
    weight: weightInput,
    purchase_account: purchaseAccountInput,
    purchase_description: purchaseDescriptionInput,
    preferred_vendor: preferredVendorInput,
    added_by: document.getElementById('itemAddedBy')?.value || null
  };

  console.log('Saving item with data:', data);
  console.log('Image URL length:', imageUrl ? imageUrl.length : 0);
  console.log('Total data size (approx):', JSON.stringify(data).length, 'characters');

  try {
    if (itemId) {
      console.log('Updating item:', itemId);
      const result = await itemsAPI.update(itemId, data);
      console.log('Update result:', result);
      showToast('Item updated successfully', 'success');
    } else {
      console.log('Creating new item');
      const result = await itemsAPI.create(data);
      console.log('Created item:', result);
      showToast('Item created successfully', 'success');
    }
    closeItemModal();
    await loadItems();
    renderItemsTable();
  } catch (error) {
    console.error('Error saving item:', error);
    console.error('Error details:', error.message, error.stack);
    showToast(error.message || 'Failed to save item', 'error');
  }
}

// Edit item
function editItem(id) {
  openItemModal(id);
}

// Delete item - show confirmation modal
let deleteItemId = null;

function deleteItem(id) {
  deleteItemId = id;
  const item = items.find(i => i.id === id);
  const modal = document.getElementById('deleteModal');
  const itemNameEl = document.getElementById('deleteItemName');

  if (item && itemNameEl) {
    itemNameEl.textContent = `"${item.name}"`;
  }

  modal.classList.add('active');
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  modal.classList.remove('active');
  deleteItemId = null;
}

async function confirmDelete() {
  if (!deleteItemId) return;

  try {
    await itemsAPI.delete(deleteItemId);
    showToast('Item deleted successfully', 'success');
    closeDeleteModal();
    closeItemDetail();
    loadItems();
  } catch (error) {
    showToast('Failed to delete item', 'error');
  }
}

// Disable item
async function disableItem(id) {
  if (!confirm('Are you sure you want to disable this item?')) return;

  try {
    await itemsAPI.update(id, { is_active: false });
    showToast('Item disabled successfully', 'success');
    closeItemDetail();
    loadItems();
  } catch (error) {
    showToast('Failed to disable item', 'error');
  }
}

// Quick sale - Toggle Quick Sale panel on mobile, add item to cart
function quickSale(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  // Check if mobile view
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // On mobile: Toggle Quick Sale panel and add item to cart
    const cartPanel = document.getElementById('cartPanel');
    const posContainer = document.getElementById('posContainer');

    if (cartPanel && posContainer) {
      // Add item to cart first
      addToCart(id);

      // Expand Quick Sale panel to show items
      cartPanel.classList.add('expanded');
      const toggleIcon = document.getElementById('cartToggleIcon');
      if (toggleIcon) toggleIcon.textContent = '▼';

      // Scroll to cart panel
      setTimeout(() => {
        cartPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  } else {
    // On desktop: Add to cart (panel is already visible)
    addToCart(id);
  }
}

// Open stock adjustment modal
function openStockModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('stockItemId').value = itemId;
  document.getElementById('currentStock').value = `${item.stock_quantity || 0} ${item.unit || 'pcs'}`;
  document.getElementById('adjustmentType').value = 'add';
  document.getElementById('adjustmentQuantity').value = '';
  document.getElementById('adjustmentReason').value = '';

  const modal = document.getElementById('stockModal');
  modal.classList.add('active');
}

// Close stock modal
function closeStockModal() {
  const modal = document.getElementById('stockModal');
  modal.classList.remove('active');
  document.getElementById('stockForm').reset();
}

// Generate barcode
function generateBarcode() {
  const barcodeInput = document.getElementById('itemBarcode');
  const preview = document.getElementById('barcodePreview');

  // Generate random 13-digit barcode (EAN-13 format)
  let barcode = '';
  for (let i = 0; i < 13; i++) {
    barcode += Math.floor(Math.random() * 10).toString();
  }

  // Update the barcode input field
  barcodeInput.value = barcode;

  // Display barcode preview
  if (preview) {
    if (typeof displayBarcode === 'function') {
      displayBarcode('barcodePreview', barcode, 'CODE128');
    } else if (typeof JsBarcode !== 'undefined') {
      // Fallback: use JsBarcode directly
      preview.innerHTML = '';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      try {
        JsBarcode(svg, barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 10
        });
        preview.appendChild(svg);
        preview.style.textAlign = 'center';
        preview.style.padding = '10px';
        preview.style.backgroundColor = '#f8f9fa';
        preview.style.borderRadius = '8px';
      } catch (error) {
        console.error('Error generating barcode:', error);
        showToast('Error generating barcode. Please check the barcode value.', 'error');
      }
    } else {
      preview.innerHTML = `<div class="image-preview-placeholder">
        <strong>Barcode:</strong> ${barcode}<br>
        <small style="color: #868e96;">JsBarcode library not loaded</small>
      </div>`;
    }
  }
}

// Search items
let itemSearchTimeout;
function searchItems() {
  clearTimeout(itemSearchTimeout);
  const query = document.getElementById('itemSearch').value;

  itemSearchTimeout = setTimeout(async () => {
    if (query.length < 2) {
      loadItems();
      return;
    }

    try {
      items = await itemsAPI.search(query);
      renderItemsTable();
    } catch (error) {
      console.error('Error searching items:', error);
    }
  }, 300);
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.floor(amount));
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Purchase Order Functions
function openPurchaseOrderModal(itemId = null) {
  poSelectedItemId = itemId;
  poItems = [];
  const modal = document.getElementById('purchaseOrderModal');
  modal.classList.add('active');

  // Populate item suggestions
  populatePOItemSuggestions();

  // Reset form
  document.getElementById('purchaseOrderForm').reset();

  // Auto-generate PO Number
  const poNumber = 'PO-' + Date.now().toString().slice(-8);
  document.getElementById('poNumber').value = poNumber;

  // Set default expected date (7 days from now)
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + 7);
  document.getElementById('poExpectedDate').value = expectedDate.toISOString().split('T')[0];

  // If itemId is provided, pre-fill the item
  if (itemId) {
    const item = items.find(i => i.id === itemId);
    if (item) {
      document.getElementById('poItemInput').value = item.name;
      document.getElementById('poQuantity').value = '';
      document.getElementById('poPrice').value = item.purchase_cost || item.cost || 0;
    }
  }

  renderPOItems();
  calculatePOTotal();
}

function closePurchaseOrderModal() {
  const modal = document.getElementById('purchaseOrderModal');
  modal.classList.remove('active');
  poItems = [];
  poSelectedItemId = null;
}

function populatePOItemSuggestions() {
  const datalist = document.getElementById('poItemSuggestions');
  if (!datalist) return;

  datalist.innerHTML = items.map(item =>
    `<option value="${item.name}">Stock: ${item.stock_quantity || 0}</option>`
  ).join('');
}

function addPOItem() {
  const itemInput = document.getElementById('poItemInput');
  const quantityInput = document.getElementById('poQuantity');
  const priceInput = document.getElementById('poPrice');

  const itemName = itemInput.value.trim();
  const quantity = parseFloat(quantityInput.value);
  const price = parseFloat(priceInput.value);

  if (!itemName || !quantity || quantity <= 0) {
    showToast('Please select an item and enter quantity', 'error');
    return;
  }

  const itemNameNormalized = itemName.toLowerCase();
  const item = items.find(i => i.name.toLowerCase() === itemNameNormalized);
  let itemId = null;
  let isNew = false;

  if (item) {
    itemId = item.id;
  } else {
    itemId = null;
    isNew = true;
  }

  const unitPrice = price || (item ? item.purchase_cost : 0) || 0;
  const totalPrice = quantity * unitPrice;

  poItems.push({
    item_id: itemId,
    item_name: item ? item.name : itemName,
    quantity: quantity,
    unit_cost: unitPrice,
    total_price: totalPrice,
    is_new: isNew
  });

  renderPOItems();
  calculatePOTotal();

  // Reset inputs
  itemInput.value = '';
  quantityInput.value = '';
  priceInput.value = '';

  // If there was a pre-selected item, clear it
  if (poSelectedItemId) {
    poSelectedItemId = null;
  }
}

function removePOItem(index) {
  poItems.splice(index, 1);
  renderPOItems();
  calculatePOTotal();
}

function renderPOItems() {
  const tbody = document.getElementById('poItemsList');
  if (!tbody) return;

  if (poItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #999; padding: 24px;">
          No items added yet. Add items from above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = poItems.map((item, index) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">${item.item_name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">${formatCurrency(item.unit_cost)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;"><strong>${formatCurrency(item.total_price)}</strong></td>
      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">
        <button class="btn btn-danger" onclick="removePOItem(${index})" 
          style="padding: 6px 12px; font-size: 12px;">Remove</button>
      </td>
    </tr>
  `).join('');
}

function calculatePOTotal() {
  const total = poItems.reduce((sum, item) => sum + item.total_price, 0);
  const totalEl = document.getElementById('poTotalAmount');
  if (totalEl) {
    totalEl.textContent = formatCurrency(total);
  }
}

// Update stock for received purchase
async function updateStockForPurchase(purchaseId) {
  try {
    const purchase = await purchasesAPI.getById(purchaseId);
    if (!purchase || !purchase.items) return;

    // Update stock for each item
    for (const item of purchase.items) {
      const currentItem = items.find(i => i.id === item.item_id);
      if (currentItem) {
        const newStock = (currentItem.stock_quantity || 0) + item.quantity;

        // Update item stock - API requires name, quantity, and price
        await itemsAPI.update(item.item_id, {
          name: currentItem.name,
          quantity: newStock,
          price: currentItem.selling_price || currentItem.price || 0,
          cost: currentItem.purchase_cost || currentItem.cost || 0,
          sku: currentItem.sku || null,
          unit: currentItem.unit || 'pcs',
          reorder_point: currentItem.reorder_point || 20
        });

        // Log transaction
        await inventoryAPI.stockIn({
          item_id: item.item_id,
          quantity: item.quantity,
          reference: purchase.po_number || purchase.invoice_number,
          notes: `Purchase Order Received - ${purchase.supplier_name}`,
          type: 'IN'
        });
      }
    }

  } catch (error) {
    console.error('Error updating stock:', error);
    throw error;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load saved column settings
  loadColumnSettings();

  // Auto-open New Item modal if ?new=true in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('new') === 'true') {
    setTimeout(() => { if (typeof showAddItemModal === 'function') showAddItemModal(); }, 500);
    // Clean up URL
    window.history.replaceState({}, '', '/items.html');
  }

  // Search functionality for product cards
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      filters.search = e.target.value;
      renderProductCards();
      renderItemsTable();
    });
  }

  // Item form submission
  const itemForm = document.getElementById('itemForm');
  if (itemForm) {
    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const itemId = document.getElementById('itemId').value;
      const nameInput = document.getElementById('itemName').value.trim();
      const skuInput = document.getElementById('itemSku').value.trim();
      const unitInput = document.getElementById('itemUnit').value;
      const quantityInput = document.getElementById('itemQuantity').value;
      const reorderPointInput = document.getElementById('itemReorderPoint').value;
      const priceInput = document.getElementById('itemPrice').value;
      const costInput = document.getElementById('itemCost').value;
      const wholesaleInput = document.getElementById('itemWholesale').checked;

      // Validate inputs
      if (!nameInput) {
        showToast('Item name is required', 'error');
        return;
      }

      if (!quantityInput || quantityInput === '' || parseInt(quantityInput) < 0) {
        showToast('Please enter a valid quantity', 'error');
        return;
      }

      if (!priceInput || priceInput === '' || parseInt(priceInput) < 0) {
        showToast('Please enter a valid price', 'error');
        return;
      }

      const quantity = parseInt(quantityInput);
      const price = parseInt(priceInput);
      const reorderPoint = parseInt(reorderPointInput) || 10;
      const cost = parseInt(costInput) || 0;

      if (isNaN(quantity)) {
        showToast('Quantity must be a valid number', 'error');
        return;
      }

      if (isNaN(price)) {
        showToast('Price must be a valid number', 'error');
        return;
      }

      const data = {
        name: nameInput,
        sku: skuInput || null,
        unit: unitInput || 'pcs',
        quantity: quantity,
        reorder_point: reorderPoint,
        price: price,
        cost: cost,
        can_be_wholesale: wholesaleInput,
        image_url: document.getElementById('itemImageUrl').value || null
      };


      try {
        if (itemId) {
          await itemsAPI.update(itemId, data);
          showToast('Item updated successfully', 'success');
        } else {
          await itemsAPI.create(data);
          showToast('Item created successfully', 'success');
        }
        closeItemModal();
        loadItems();
      } catch (error) {
        showToast(error.message || 'Failed to save item', 'error');
      }
    });
  }

  // Stock form submission
  const stockForm = document.getElementById('stockForm');
  if (stockForm) {
    stockForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const itemId = document.getElementById('stockItemId').value;
      const type = document.getElementById('adjustmentType').value;
      const quantity = parseInt(document.getElementById('adjustmentQuantity').value);
      const reason = document.getElementById('adjustmentReason').value;

      if (!quantity || quantity <= 0) {
        showToast('Please enter a valid quantity', 'error');
        return;
      }

      const item = items.find(i => i.id == itemId);
      if (!item) return;

      let newStock = item.stock_quantity || 0;

      if (type === 'add') {
        newStock += quantity;
      } else if (type === 'remove') {
        newStock = Math.max(0, newStock - quantity);
      } else if (type === 'set') {
        newStock = quantity;
      }

      try {
        // Update item stock - API requires name, quantity, and price
        await itemsAPI.update(itemId, {
          name: item.name,
          quantity: newStock,
          price: item.selling_price || item.price || 0,
          cost: item.purchase_cost || item.cost || 0,
          sku: item.sku || null,
          unit: item.unit || 'pcs',
          reorder_point: item.reorder_point || 20
        });

        // Log stock movement
        await inventoryAPI.stockIn({
          item_id: itemId,
          quantity: type === 'add' ? quantity : -quantity,
          reference: reason || 'Manual adjustment',
          type: type
        });

        showToast('Stock adjusted successfully', 'success');
        closeStockModal();
        loadItems();

        // Refresh detail panel if open
        if (selectedItemId == itemId) {
          selectItem(itemId);
        }
      } catch (error) {
        showToast(error.message || 'Failed to adjust stock', 'error');
      }
    });
  }

  // Load Added By dropdown options from salespersons
  fetch('/api/salespersons')
    .then(r => r.json())
    .then(data => {
      const sel = document.getElementById('itemAddedBy');
      if (sel && Array.isArray(data)) {
        data.forEach(sp => {
          const opt = document.createElement('option');
          opt.value = sp.name;
          opt.textContent = sp.name;
          sel.appendChild(opt);
        });
      }
    })
    .catch(() => { });

  // Load initial data
  loadItems().then(() => {
    // Check for URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('item_id');
    const edit = urlParams.get('edit');
    const filterParam = urlParams.get('filter');

    // Apply filter from URL parameter (e.g., ?filter=low-stock)
    if (filterParam) {
      if (filterParam === 'low-stock') {
        // Switch to table view first
        switchView('table');

        // Set the filter
        filters.stock = 'low-stock';
        const stockSelect = document.getElementById('filterStock');
        if (stockSelect) {
          stockSelect.value = 'low-stock';
        }

        // Apply filters and render the table with low stock items
        applyFilters();

        // Scroll to the table section after a short delay to ensure it's rendered
        setTimeout(() => {
          // Find the table wrapper or table element
          const tableWrapper = document.querySelector('.items-table-wrapper');
          const itemsTableBody = document.getElementById('itemsTableBody');

          if (tableWrapper) {
            tableWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (itemsTableBody) {
            itemsTableBody.closest('.items-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 500);
      }
    }

    if (itemId && edit === 'true') {
      // Wait a bit for the table to render, then open the edit modal
      setTimeout(() => {
        editItem(parseInt(itemId));
      }, 300);
    }
  });

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Purchase Order form submission
  const purchaseOrderForm = document.getElementById('purchaseOrderForm');
  if (purchaseOrderForm) {
    purchaseOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (poItems.length === 0) {
        showToast('Please add at least one item', 'error');
        return;
      }

      const total = poItems.reduce((sum, item) => sum + item.total_price, 0);

      try {
        // Auto-create new items first if needed
        const finalItems = [];
        const createdItemsCache = {};

        for (const item of poItems) {
          if (item.is_new) {
            let newItemId = createdItemsCache[item.item_name.toLowerCase()];

            if (!newItemId) {
              // Create new item
              const newItemResult = await itemsAPI.create({
                name: item.item_name,
                quantity: 0,
                price: item.unit_cost,
                cost: item.unit_cost,
                unit: 'pcs'
              });

              if (newItemResult && newItemResult.id) {
                newItemId = newItemResult.id;
                createdItemsCache[item.item_name.toLowerCase()] = newItemId;
              } else {
                throw new Error(`Failed to create new item: ${item.item_name}`);
              }
            }

            finalItems.push({
              item_id: newItemId,
              quantity: item.quantity,
              unit_price: item.unit_cost
            });
          } else {
            finalItems.push({
              item_id: item.item_id,
              quantity: item.quantity,
              unit_price: item.unit_cost
            });
          }
        }

        const data = {
          supplier_name: document.getElementById('poSupplierName').value,
          contact_person: document.getElementById('poContactPerson').value,
          email: document.getElementById('poEmail').value,
          phone: document.getElementById('poPhone').value,
          po_number: document.getElementById('poNumber').value || `PO-${Date.now()}`,
          expected_date: document.getElementById('poExpectedDate').value,
          items: finalItems,
          total_amount: total,
          payment_terms: document.getElementById('poPaymentTerms').value,
          status: document.getElementById('poStatus').value,
          notes: document.getElementById('poNotes').value,
          date: new Date().toISOString()
        };

        const result = await purchasesAPI.create(data);
        showToast('Purchase order created successfully! 📦', 'success');
        closePurchaseOrderModal();
        loadItems();

        if (result && result.id && data.status === 'received') {
          // If marked as received immediately, update stock
          await updateStockForPurchase(result.id);
        }
      } catch (error) {
        showToast(error.message || 'Failed to create purchase order', 'error');
      }
    });
  }

  // Auto-fill price when item entered in purchase order form
  const poItemInput = document.getElementById('poItemInput');
  if (poItemInput) {
    poItemInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const item = items.find(i => i.name.toLowerCase() === val.toLowerCase());
      if (item) {
        const priceInput = document.getElementById('poPrice');
        if (priceInput) {
          priceInput.value = item.purchase_cost || item.cost || 0;
        }
      }
    });
  }
});

// ========== POS CARD & CART FUNCTIONS ==========

// Switch between cards and table view
function switchView(view) {
  currentView = view;
  const posContainer = document.getElementById('posContainer');
  const itemsContainer = document.getElementById('itemsContainer');
  const viewCardsBtn = document.getElementById('viewCards');
  const viewTableBtn = document.getElementById('viewTable');

  if (view === 'cards') {
    posContainer.style.display = 'grid';
    itemsContainer.style.display = 'none';
    viewCardsBtn.classList.add('active');
    viewTableBtn.classList.remove('active');
  } else {
    posContainer.style.display = 'none';
    itemsContainer.style.display = 'grid';
    viewCardsBtn.classList.remove('active');
    viewTableBtn.classList.add('active');
  }
}

// Toggle cart panel on mobile
function toggleCartPanel() {
  const cartPanel = document.getElementById('cartPanel');
  const toggleIcon = document.getElementById('cartToggleIcon');

  if (cartPanel) {
    const isExpanded = cartPanel.classList.contains('expanded');
    if (isExpanded) {
      // Collapse: show only header
      cartPanel.classList.remove('expanded');
      if (toggleIcon) toggleIcon.textContent = '▲';
    } else {
      // Expand: show full panel
      cartPanel.classList.add('expanded');
      if (toggleIcon) toggleIcon.textContent = '▼';
    }
  }
}

// Close cart panel on mobile
function closeCartPanel() {
  const cartPanel = document.getElementById('cartPanel');
  const toggleIcon = document.getElementById('cartToggleIcon');

  if (cartPanel) {
    // Collapse to show only header
    cartPanel.classList.remove('expanded');
    if (toggleIcon) toggleIcon.textContent = '▲';
  }
}

// Render product cards
function renderProductCards() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  // Ensure items is an array
  if (!Array.isArray(items)) {
    items = [];
  }

  // Apply filters
  let filteredItems = [...items];

  // Filter by search term
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(item =>
      (item.name && item.name.toLowerCase().includes(searchTerm)) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm))
    );
  }

  // Filter by stock status - use fixed threshold of 20
  const lowStockThreshold = 20;
  if (filters.stock === 'in-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > lowStockThreshold;
    });
  } else if (filters.stock === 'low-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock > 0 && stock <= lowStockThreshold;
    });
  } else if (filters.stock === 'out-of-stock') {
    filteredItems = filteredItems.filter(item => {
      const stock = parseFloat(item.stock_quantity) || 0;
      return stock <= 0;
    });
  }

  // Sort items
  filteredItems.sort((a, b) => {
    switch (filters.sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'stock': return (a.stock_quantity || 0) - (b.stock_quantity || 0);
      case 'stock-desc': return (b.stock_quantity || 0) - (a.stock_quantity || 0);
      case 'price': return (a.selling_price || 0) - (b.selling_price || 0);
      case 'price-desc': return (b.selling_price || 0) - (a.selling_price || 0);
      default: return 0;
    }
  });

  if (filteredItems.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: #868e96;">
        <div style="font-size: 64px; margin-bottom: 16px; opacity: 0.5;">📦</div>
        <h3>No items found</h3>
        <p>Try adjusting your filters</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredItems.map(item => {
    const stock = parseInt(item.stock_quantity) || 0;
    const isOutOfStock = stock <= 0;
    const price = formatCurrency(item.selling_price || 0);

    // Display image if available, otherwise show placeholder
    const imageContent = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;">`
      : '📦';

    return `
      <div class="product-card">
        <div class="product-card-image" style="${item.image_url ? 'padding: 0;' : ''}">${imageContent}</div>
        <div class="product-card-body">
          <div class="product-card-name" title="${item.name}">${item.name}</div>
          <div class="product-card-details">${item.sku || 'No SKU'} • ${item.unit || 'pcs'}</div>
          <div class="product-card-footer">
            <span class="product-card-price">${price}</span>
            <span class="product-card-stock">${stock} in stock</span>
          </div>
        </div>
        <div class="product-card-actions">
          <button class="btn-add-cart" onclick="addToCart(${item.id})" ${isOutOfStock ? 'disabled' : ''}>
            🛒 ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Add item to cart
function addToCart(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const stock = parseInt(item.stock_quantity) || 0;
  if (stock <= 0) {
    showToast('Wala nang stock ang item na ito', 'error');
    return;
  }

  const existingItem = cart.find(c => c.id === itemId);
  if (existingItem) {
    if (existingItem.quantity >= stock) {
      showToast(`Sobra na sa stock! Available stock lang ay ${stock} pcs`, 'error');
      return;
    }
    existingItem.quantity++;
  } else {
    cart.push({
      id: item.id,
      name: item.name,
      price: item.selling_price || 0,
      quantity: 1,
      maxStock: stock
    });
  }

  renderCart();
}

// Update cart item quantity (increment/decrement)
function updateCartQuantity(itemId, change) {
  const cartItem = cart.find(c => c.id === itemId);
  if (!cartItem) return;

  const newQty = cartItem.quantity + change;

  if (newQty <= 0) {
    removeFromCart(itemId);
    return;
  }

  if (newQty > cartItem.maxStock) {
    showToast(`Sobra sa stock! Available stock lang ay ${cartItem.maxStock} pcs`, 'error');
    return;
  }

  cartItem.quantity = newQty;
  renderCart(); // This will validate and update button state
}

// Set cart item quantity directly (from input field)
function setCartQuantity(itemId, value, inputElement) {
  const cartItem = cart.find(c => c.id === itemId);
  if (!cartItem) return;

  // Handle empty string - don't update yet, wait for valid input
  if (value === '' || value === null || value === undefined) {
    // Update totals with current quantity
    updateCartTotals();
    return;
  }

  // Parse and validate the input
  let newQty = parseInt(value);

  // If invalid, don't update (let user continue typing)
  if (isNaN(newQty)) {
    // Update totals with current quantity
    updateCartTotals();
    return;
  }

  // If less than 1, set to 1
  if (newQty < 1) {
    newQty = 1;
  }

  // Check if exceeds available stock
  if (newQty > cartItem.maxStock) {

    // Show custom styled error dialog
    const mainMessage = `SOBRA SA STOCK!`;
    const subMessage = `Available stock lang ay ${cartItem.maxStock} pcs para sa "${cartItem.name}"\n\nNilagay mo: ${newQty} pcs\nI-correct namin sa ${cartItem.maxStock} pcs.`;

    // Use custom alert dialog if available, otherwise fallback to toast/alert
    if (typeof window.alertDialog !== 'undefined' && window.alertDialog) {
      window.alertDialog.show({
        type: 'error',
        title: 'Sobra sa Stock',
        titleIcon: '⚠️',
        message: mainMessage,
        submessage: subMessage,
        confirmText: 'OK',
        showCancel: false,
        onConfirm: () => {
          // On confirm - continue with correction
        }
      });
    } else if (typeof window.showToast === 'function') {
      window.showToast(mainMessage + ' ' + subMessage, 'error');
    } else if (typeof showToast === 'function') {
      showToast(mainMessage + ' ' + subMessage, 'error');
    } else {
      // Ultimate fallback
      alert(mainMessage + '\n\n' + subMessage);
    }

    // Reset to max stock
    newQty = cartItem.maxStock;

    // Reset input field to max stock and add visual feedback
    if (inputElement) {
      // Set value to max stock
      inputElement.value = cartItem.maxStock;

      // Add error class for visual feedback (red border, shake animation)
      inputElement.classList.add('cart-qty-error');

      // Show error message in UI
      const errorMsgEl = document.getElementById(`qtyError_${itemId}`);
      if (errorMsgEl) {
        errorMsgEl.textContent = `Max: ${cartItem.maxStock} pcs`;
        errorMsgEl.style.display = 'block';
        setTimeout(() => {
          errorMsgEl.style.display = 'none';
        }, 5000);
      }

      // Focus and select the input to show the error clearly
      setTimeout(() => {
        inputElement.focus();
        inputElement.select();
      }, 100);

      // Remove error class after animation (longer duration for visibility)
      setTimeout(() => {
        inputElement.classList.remove('cart-qty-error');
      }, 3000);
    }

    // Update quantity to max stock
    cartItem.quantity = newQty;

    // Update totals immediately
    updateCartTotals();

    // Update the item total display in real-time
    if (inputElement) {
      const cartItemElement = inputElement.closest('.cart-item');
      if (cartItemElement) {
        const totalElement = cartItemElement.querySelector('.cart-item-total');
        if (totalElement) {
          totalElement.textContent = formatCurrency(cartItem.price * cartItem.quantity);
        }
      }
    }

    // Update Fill Up button state based on validation
    const invalidItems = validateCartItems();
    const btnCheckout = document.getElementById('btnCheckout');
    if (btnCheckout) {
      if (invalidItems.length > 0) {
        btnCheckout.disabled = true;
        btnCheckout.title = `Hindi ma-process: ${invalidItems.map(item => `${item.name} (${item.quantity} > ${item.maxStock})`).join(', ')}`;
        btnCheckout.style.opacity = '0.6';
        btnCheckout.style.cursor = 'not-allowed';
      } else {
        btnCheckout.disabled = false;
        btnCheckout.title = '';
        btnCheckout.style.opacity = '1';
        btnCheckout.style.cursor = 'pointer';
      }
    }

    return;
  }

  // If quantity is 0, remove item
  if (newQty === 0) {
    removeFromCart(itemId);
    return;
  }

  // Update quantity
  cartItem.quantity = newQty;

  // Update totals immediately (real-time update)
  updateCartTotals();

  // Update the item total display in real-time
  if (inputElement) {
    const cartItemElement = inputElement.closest('.cart-item');
    if (cartItemElement) {
      const totalElement = cartItemElement.querySelector('.cart-item-total');
      if (totalElement) {
        totalElement.textContent = formatCurrency(cartItem.price * cartItem.quantity);
      }
    }
  }

  // Update Fill Up button state based on validation
  const invalidItems = validateCartItems();
  const btnCheckout = document.getElementById('btnCheckout');
  if (btnCheckout) {
    if (invalidItems.length > 0) {
      btnCheckout.disabled = true;
      btnCheckout.title = `Hindi ma-process: ${invalidItems.map(item => `${item.name} (${item.quantity} > ${item.maxStock})`).join(', ')}`;
      btnCheckout.style.opacity = '0.6';
      btnCheckout.style.cursor = 'not-allowed';
    } else {
      btnCheckout.disabled = false;
      btnCheckout.title = '';
      btnCheckout.style.opacity = '1';
      btnCheckout.style.cursor = 'pointer';
    }
  }
}

// Update cart totals without full re-render (for real-time updates)
function updateCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Calculate discount
  const discountVal = parseFloat(document.getElementById('cartDiscount')?.value || 0);
  const discountType = document.getElementById('cartDiscountType')?.value || 'fixed';
  let discountAmount = 0;

  if (discountType === 'percent') {
    discountAmount = subtotal * (discountVal / 100);
  } else {
    discountAmount = discountVal;
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);

  // Calculate Tax
  const taxPercent = parseFloat(document.getElementById('cartTax')?.value || 0);
  const taxAmount = afterDiscount * (taxPercent / 100);

  const total = afterDiscount + taxAmount;

  // Update display
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

// Remove item from cart
function removeFromCart(itemId) {
  cart = cart.filter(c => c.id !== itemId);
  renderCart();
}

// Clear cart
function clearCart() {
  cart = [];
  renderCart();
}

// Render cart
function renderCart() {
  const cartItemsEl = document.getElementById('cartItems');
  const cartSummaryEl = document.getElementById('cartSummary');
  const btnCheckout = document.getElementById('btnCheckout');

  if (cart.length === 0) {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Cart is empty</p>
        <p style="font-size: 12px;">Click "Add to Cart" on items to add them here</p>
      </div>
    `;
    cartSummaryEl.style.display = 'none';
    btnCheckout.disabled = true;
    return;
  }

  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatCurrency(item.price)} each</div>
      </div>
      <div class="cart-item-qty">
        <button onclick="updateCartQuantity(${item.id}, -1)">−</button>
        <div style="position: relative;">
          <input type="number" 
                 class="cart-qty-input" 
                 value="${item.quantity}" 
                 min="1" 
                 max="${item.maxStock || 9999}"
                 oninput="setCartQuantity(${item.id}, this.value, this)"
                 onchange="setCartQuantity(${item.id}, this.value, this)"
                 onblur="setCartQuantity(${item.id}, this.value, this); renderCart()"
                 onclick="this.select()"
                 data-item-id="${item.id}">
          <div class="cart-qty-error-msg" id="qtyError_${item.id}" style="display: none;"></div>
        </div>
        <button onclick="updateCartQuantity(${item.id}, 1)">+</button>
      </div>
      <div class="cart-item-total">${formatCurrency(item.price * item.quantity)}</div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})">×</button>
    </div>
  `).join('');

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Calculate discount
  const discountVal = parseFloat(document.getElementById('cartDiscount')?.value || 0);
  const discountType = document.getElementById('cartDiscountType')?.value || 'fixed';
  let discountAmount = 0;

  if (discountType === 'percent') {
    discountAmount = subtotal * (discountVal / 100);
  } else {
    discountAmount = discountVal;
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);

  // Calculate Tax
  const taxPercent = parseFloat(document.getElementById('cartTax')?.value || 0);
  const taxAmount = afterDiscount * (taxPercent / 100);

  const total = afterDiscount + taxAmount;

  document.getElementById('cartSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('cartTotal').textContent = formatCurrency(total);

  cartSummaryEl.style.display = 'block';

  // Validate cart items - disable Fill Up button if any item exceeds stock
  const invalidItems = validateCartItems();
  if (invalidItems.length > 0) {
    btnCheckout.disabled = true;
    // Add visual indicator
    if (btnCheckout) {
      btnCheckout.title = `Hindi ma-process: ${invalidItems.map(item => `${item.name} (${item.quantity} > ${item.maxStock})`).join(', ')}`;
      btnCheckout.style.opacity = '0.6';
      btnCheckout.style.cursor = 'not-allowed';
    }
  } else {
    btnCheckout.disabled = false;
    if (btnCheckout) {
      btnCheckout.title = '';
      btnCheckout.style.opacity = '1';
      btnCheckout.style.cursor = 'pointer';
    }
  }
}

// Validate cart items - check if any quantity exceeds stock
function validateCartItems() {
  const invalidItems = [];

  for (const item of cart) {
    if (item.quantity > item.maxStock) {
      invalidItems.push({
        name: item.name,
        quantity: item.quantity,
        maxStock: item.maxStock
      });
    }
  }

  return invalidItems;
}

// Sale Details Modal Functions
function openSaleDetailsModal() {
  if (cart.length === 0) {
    showToast('Cart is empty', 'error');
    return;
  }

  // Validate cart items before opening modal
  const invalidItems = validateCartItems();
  if (invalidItems.length > 0) {
    let errorMessage = 'Sobra sa stock! Hindi ma-process ang sale:\n';
    invalidItems.forEach(item => {
      errorMessage += `• ${item.name}: ${item.quantity} pcs (Available: ${item.maxStock} pcs lang)\n`;
    });
    showToast(errorMessage.trim(), 'error');
    return;
  }

  const modal = document.getElementById('saleDetailsModal');
  const modalTotal = document.getElementById('modalTotalAmount');
  const cartTotal = document.getElementById('cartTotal').textContent;

  if (modalTotal) modalTotal.textContent = cartTotal;
  if (modal) modal.classList.add('active');
}

function closeSaleDetailsModal() {
  const modal = document.getElementById('saleDetailsModal');
  if (modal) modal.classList.remove('active');
  document.getElementById('saleDetailsForm').reset();
}

// Handle Sale Details Form Submission
const saleDetailsForm = document.getElementById('saleDetailsForm');
if (saleDetailsForm) {
  saleDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnSubmit = saleDetailsForm.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '⏳ Processing...';

    try {
      const saleItems = cart.map(item => ({
        item_id: item.id,
        quantity: item.quantity,
        unit_price: item.price
      }));

      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Calculate final totals
      const discountVal = parseFloat(document.getElementById('cartDiscount')?.value || 0);
      const discountType = document.getElementById('cartDiscountType')?.value || 'fixed';
      let discountAmount = 0;

      if (discountType === 'percent') {
        discountAmount = subtotal * (discountVal / 100);
      } else {
        discountAmount = discountVal;
      }

      const afterDiscount = Math.max(0, subtotal - discountAmount);

      const taxPercent = parseFloat(document.getElementById('cartTax')?.value || 0);
      const taxAmount = afterDiscount * (taxPercent / 100);

      const total = afterDiscount + taxAmount;

      const saleData = {
        items: saleItems,
        customer_name: document.getElementById('buyerName').value,
        customer_email: document.getElementById('buyerEmail').value,
        customer_phone: document.getElementById('buyerPhone').value,
        customer_address: document.getElementById('buyerAddress').value,
        payment_method: document.getElementById('paymentMethod').value,
        status: document.getElementById('saleStatus').value,
        subtotal: subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: total
      };

      await salesAPI.create(saleData);

      showToast('Sale completed successfully! 🎉', 'success');
      cart = [];
      renderCart();
      loadItems(); // Refresh items to update stock
      closeSaleDetailsModal();

    } catch (error) {
      console.error('Error processing sale:', error);
      showToast(error.message || 'Failed to process sale', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  });
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById('saleDetailsModal');
  if (event.target == modal) {
    closeSaleDetailsModal();
  }
};
