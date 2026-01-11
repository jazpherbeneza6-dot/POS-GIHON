// Purchases Management with comprehensive features

let purchases = [];
let purchaseItems = [];
let allItems = [];
let suppliers = [];
let currentTab = 'all';
let masterSuppliersCache = [];
let purchaseItemsCache = {}; // Cache for storing purchase items for popup display

// Track processing purchases to prevent duplicate operations
const processingPurchases = new Set();

// Pagination settings
const ITEMS_PER_PAGE = 10;
const paginationState = {
  all: { currentPage: 1, totalPages: 1 },
  ordered: { currentPage: 1, totalPages: 1 },
  received: { currentPage: 1, totalPages: 1 },
  suppliers: { currentPage: 1, totalPages: 1 }
};

// Search state
let currentSearchTerm = '';

function findMasterSupplierByName(name) {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  return masterSuppliersCache.find(s => (s.name || '').toLowerCase() === target) || null;
}

function generatePoNumber() {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900); // 3-digit random
  return `PO-${ts}${rand}`;
}

// Helper to normalize status
function getStatus(purchase) {
  return (purchase.status || 'ordered').toString().trim().toLowerCase();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  setupButtonEventListeners();

  // Setup search listener
  const searchInput = document.getElementById('purchasesSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      // Reset pagination to page 1 when searching
      Object.keys(paginationState).forEach(key => {
        paginationState[key].currentPage = 1;
      });
      renderAllTabs();
    });
  }
});

// Setup button event listeners (replacing onclick handlers)
function setupButtonEventListeners() {
  // Purchase modal buttons
  const addPurchaseItemBtn = document.getElementById('addPurchaseItemBtn');
  if (addPurchaseItemBtn) {
    addPurchaseItemBtn.addEventListener('click', addPurchaseItem);
  }

  const closeNewPurchaseBtn = document.getElementById('closeNewPurchaseBtn');
  if (closeNewPurchaseBtn) {
    closeNewPurchaseBtn.addEventListener('click', closeNewPurchaseModal);
  }

  const closeReceiveBtn = document.getElementById('closeReceiveBtn');
  if (closeReceiveBtn) {
    closeReceiveBtn.addEventListener('click', closeReceiveModal);
  }

  const closeSupplierBtn = document.getElementById('closeSupplierBtn');
  if (closeSupplierBtn) {
    closeSupplierBtn.addEventListener('click', closeSupplierModal);
  }

  // Header button
  document.addEventListener('layoutReady', () => {
    const openNewPurchaseBtn = document.getElementById('openNewPurchaseBtn');
    if (openNewPurchaseBtn) {
      openNewPurchaseBtn.addEventListener('click', openNewPurchaseModal);
    }
  });

  // Tab buttons
  document.querySelectorAll('.tab-button[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close-btn').forEach(button => {
    button.addEventListener('click', () => {
      const modalId = button.getAttribute('data-modal');
      if (modalId === 'newPurchaseModal') closeNewPurchaseModal();
      else if (modalId === 'receiveItemsModal') closeReceiveModal();
      else if (modalId === 'supplierModal') closeSupplierModal();
    });
  });
}

// Ensure functions are globally accessible for inline onclick handlers
window.openNewPurchaseModal = openNewPurchaseModal;
window.closeNewPurchaseModal = closeNewPurchaseModal;
window.openSuppliersModal = openSuppliersModal;
window.switchTab = switchTab;
window.openReceiveModal = openReceiveModal;
window.deletePurchase = deletePurchase;
window.deleteSupplier = deleteSupplier;
window.editSupplier = editSupplier;
window.addPurchaseItem = addPurchaseItem;
window.removePurchaseItem = removePurchaseItem;
window.openDeletePurchaseModal = openDeletePurchaseModal;
window.closeDeletePurchaseModal = closeDeletePurchaseModal;
window.confirmDeletePurchase = confirmDeletePurchase;
window.showPurchaseItems = showPurchaseItems;
window.closePurchaseItemsModal = closePurchaseItemsModal;
window.viewPurchase = viewPurchase;

// View purchase - opens the purchase items modal
function viewPurchase(purchaseId) {
  showPurchaseItems(purchaseId);
}

// Show purchase items modal
function showPurchaseItems(purchaseId) {
  console.log('showPurchaseItems called with ID:', purchaseId);

  // Get purchase details
  const purchase = purchases.find(p => p.id === purchaseId);
  if (!purchase) {
    showAlert('Purchase not found', 'error');
    return;
  }

  // Get items from cache
  const items = purchaseItemsCache[purchaseId] || [];
  const poNumber = purchase.po_number || `PO-${purchaseId}`;
  const supplier = purchase.supplier_name || 'Unknown Supplier';
  const status = getStatus(purchase);
  const statusClass = status === 'received' ? 'received' : status === 'ordered' ? 'ordered' : 'pending';
  const date = purchase.date || purchase.created_at;
  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) : '-';
  const total = parseFloat(purchase.total_amount || 0);

  // Build items list HTML
  let itemsListHtml = '';
  let subtotal = 0;

  if (items.length > 0) {
    items.forEach(item => {
      const name = item.item_name || item.name || 'Unknown';
      const qty = item.quantity || 0;
      const price = parseFloat(item.unit_price || 0);
      const itemTotal = qty * price;
      subtotal += itemTotal;
      itemsListHtml += `
        <tr>
          <td class="pv-item-name">${name}</td>
          <td class="pv-item-qty">${qty}</td>
          <td class="pv-item-price">₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          <td class="pv-item-total">₱${itemTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    });
  } else {
    itemsListHtml = '<tr><td colspan="4" class="pv-no-items">No items in this purchase</td></tr>';
  }

  // Create modal HTML with beautiful design
  const modalHtml = `
    <div id="purchaseViewModal" class="purchase-view-overlay" onclick="if(event.target.id === 'purchaseViewModal') closePurchaseItemsModal();">
      <div class="purchase-view-modal">
        <!-- Header -->
        <div class="pv-header pv-header-${statusClass}">
          <div class="pv-header-content">
            <span class="pv-header-icon">📦</span>
            <span class="pv-header-title">Purchase Order Details</span>
          </div>
          <button class="pv-close-btn" onclick="closePurchaseItemsModal()">×</button>
        </div>
        
        <!-- Body -->
        <div class="pv-body">
          <!-- PO Number Badge -->
          <div class="pv-po-badge">${poNumber}</div>
          
          <!-- Info Grid -->
          <div class="pv-info-grid">
            <div class="pv-info-item">
              <span class="pv-info-label">Supplier</span>
              <span class="pv-info-value">${supplier}</span>
            </div>
            <div class="pv-info-item">
              <span class="pv-info-label">Date</span>
              <span class="pv-info-value">${formattedDate}</span>
            </div>
            <div class="pv-info-item">
              <span class="pv-info-label">Status</span>
              <span class="pv-status-badge pv-status-${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </div>
            <div class="pv-info-item">
              <span class="pv-info-label">Total Items</span>
              <span class="pv-info-value">${items.length} unique items</span>
            </div>
          </div>
        <div class="pv-items-section">
          <h4 class="pv-section-title">Order Items</h4>
          <div class="pv-table-wrapper">
            <table class="pv-items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${itemsListHtml}</tbody>
            </table>
          </div>
        </div>
        
        <div class="pv-total-section">
          <div class="pv-total-row">
            <span class="pv-total-label">Total Amount</span>
            <span class="pv-total-value">₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        
      </div>
      
      <!-- Footer -->
      <div class="pv-footer">
        <button class="pv-btn pv-btn-close" onclick="closePurchaseItemsModal()">Close</button>
      </div>
    </div>
  </div>
  `;

  renderModal(modalHtml);
}

// Generate HTML rows for items
function generateItemsTableRows(items) {
  if (!items || items.length === 0) {
    return '<tr><td colspan="4" style="text-align:center;">No items found</td></tr>';
  }

  return items.map(item => `
    <tr>
      <td>${item.item_name}</td>
      <td>${item.quantity}</td>
      <td>${item.unit_price}</td>
      <td>${item.total_price}</td>
    </tr>
  `).join('');
}

// Render the modal to the DOM
function renderModal(modalHtml) {
  // Close any existing modal first
  closePurchaseItemsModal();

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Use a small timeout to allow the DOM to update before adding the active class for animation
  requestAnimationFrame(() => {
    const modal = document.getElementById('purchaseViewModal');
    if (modal) {
      modal.classList.add('active');
    }
  });
}

function closePurchaseItemsModal() {
  const modal = document.getElementById('purchaseViewModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

// Format number input with commas as user types
function formatNumberInput(input) {
  // Remove all non-digit characters except decimal point
  let value = input.value.replace(/[^\d.]/g, '');

  // Handle decimal numbers
  let parts = value.split('.');
  let integerPart = parts[0];
  let decimalPart = parts.length > 1 ? '.' + parts[1] : '';

  // Add commas to integer part
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  input.value = integerPart + decimalPart;
}

// Parse formatted number (remove commas)
function parseFormattedNumber(value) {
  if (!value) return 0;
  return parseFloat(value.toString().replace(/,/g, '')) || 0;
}

window.formatNumberInput = formatNumberInput;

// Load all data
async function loadData() {
  try {
    // Load purchases first so suppliers can derive from it if needed
    await loadItems();
    await loadPurchases();
    await loadSuppliers();
    updateStats();
    updateTabCounts();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Load items
async function loadItems() {
  try {
    allItems = await itemsAPI.getAll();
    populateItemSelect();
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Load purchases
async function loadPurchases() {
  try {
    purchases = await purchasesAPI.getAll({ limit: 100 });
    renderAllTabs();
  } catch (error) {
    console.error('Error loading purchases:', error);
    showAlert('Failed to load purchases', 'error');
  }
}

// Load suppliers derived from purchases (one row per purchase so quantities/items won't aggregate)
async function loadSuppliers() {
  try {
    // Get master supplier records for contact info
    masterSuppliersCache = await suppliersAPI.getAll();
    suppliers = buildSupplierRowsFromPurchases();

    renderSuppliers();
    populateSupplierSelect(); // Update supplier dropdown
  } catch (error) {
    console.error('Error loading suppliers:', error);
    suppliers = [];
    renderSuppliers();
  }
}

// Build per-purchase supplier rows (no aggregation)
function buildSupplierRowsFromPurchases() {
  const supplierById = {};
  const supplierByName = {};
  masterSuppliersCache.forEach(s => {
    supplierById[s.id] = s;
    if (s.name) supplierByName[s.name.toLowerCase()] = s;
  });

  return purchases
    .filter(p => {
      const status = getStatus(p);
      if (status !== 'received') return false;
      return p.supplier_name || p.supplier_id;
    })
    .map(purchase => {
      // Compute item name summary and total quantity per purchase
      let itemNames = [];
      let qty = 0;
      if (purchase.items && purchase.items.length > 0) {
        // Store items in cache for popup display
        purchaseItemsCache[purchase.id] = purchase.items;

        purchase.items.forEach(item => {
          const name = item.item_name || item.name || 'Unknown';
          if (name && !itemNames.includes(name)) itemNames.push(name);
          qty += parseInt(item.quantity, 10) || 0;
        });
      }

      // Build clickable item name HTML
      let itemNameHtml = 'N/A';
      if (itemNames.length === 1) {
        itemNameHtml = itemNames[0];
      } else if (itemNames.length === 2) {
        itemNameHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${itemNames[0]}, ${itemNames[1]}</a>`;
      } else if (itemNames.length > 2) {
        itemNameHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${itemNames[0]} + ${itemNames.length - 1} more</a>`;
      }

      // Enrich contact info from supplier record if available
      const matchedSupplier =
        (purchase.supplier_id && supplierById[purchase.supplier_id]) ||
        (purchase.supplier_name && supplierByName[purchase.supplier_name.toLowerCase()]) ||
        null;

      return {
        id: purchase.id,
        name: purchase.supplier_name || matchedSupplier?.name || 'N/A',
        contact_person: purchase.contact_person || matchedSupplier?.contact_person || '',
        email: purchase.email || matchedSupplier?.email || '',
        phone: purchase.phone || matchedSupplier?.phone || '',
        item_name: itemNameHtml,
        total_quantity: qty,
        total_spent: purchase.total_amount || 0
      };
    });
}

// Populate item select
// Populate item datalist
function populateItemSelect() {
  const datalist = document.getElementById('purchaseItemSuggestions');
  if (!datalist) return;

  datalist.innerHTML = allItems.map(item =>
    `<option value="${item.name}">Stock: ${item.stock_quantity || 0}</option>`
  ).join('');
}

// Populate supplier datalist
function populateSupplierSelect() {
  const datalist = document.getElementById('supplierSuggestions');
  if (!datalist) return;

  // Get unique supplier names from suppliers array
  const uniqueSuppliers = Array.from(new Set(suppliers.map(s => s.name)));
  datalist.innerHTML = uniqueSuppliers.map(name =>
    `<option value="${name}">${name}</option>`
  ).join('');

  // Also populate supplier select dropdown if it exists
  const supplierSelect = document.getElementById('purchaseSupplierSelect');
  if (supplierSelect) {
    supplierSelect.innerHTML = '<option value="">Select Supplier</option>' +
      suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

// Update stats
function updateStats() {
  // Total purchases
  document.getElementById('totalPurchases').textContent = purchases.length;

  // Total spent
  const totalSpent = purchases.reduce((sum, p) => {
    const status = getStatus(p);
    if (status !== 'received') return sum;
    const amt = Number(p.total_amount);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
  document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);

  // Pending orders
  const pending = purchases.filter(p => p.status === 'ordered' || p.status === 'partial').length;
  document.getElementById('pendingOrders').textContent = pending;

  // Active suppliers
  document.getElementById('activeSuppliers').textContent = suppliers.length;
}

// Update tab counts
function updateTabCounts() {
  const ordered = purchases.filter(p => {
    const s = getStatus(p);
    return s === 'ordered' || s === 'partial';
  }).length;
  const received = purchases.filter(p => getStatus(p) === 'received').length;

  document.getElementById('allCount').textContent = purchases.length;
  document.getElementById('orderedCount').textContent = ordered;
  document.getElementById('receivedCount').textContent = received;
  document.getElementById('suppliersCount').textContent = suppliers.length;
}

// Switch tabs
function switchTab(tabName, evt) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  // Support both inline onclick (event available) and programmatic calls
  const targetBtn = evt?.target ? evt.target.closest('.tab-button') : document.querySelector(`.tab-button[onclick*="${tabName}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');

  renderAllTabs();
}

// Render all tabs
function renderAllTabs() {
  // Filter purchases based on search term
  let filteredPurchases = purchases;
  let filteredSuppliers = suppliers;

  if (currentSearchTerm) {
    filteredPurchases = purchases.filter(purchase => {
      const searchStr = currentSearchTerm.toLowerCase();
      const poNumber = (purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`).toLowerCase();
      const supplierName = (purchase.supplier_name || '').toLowerCase();
      const total = (purchase.total_amount || 0).toString();
      const status = getStatus(purchase);

      // Check item names
      let itemMatch = false;
      if (purchase.items && purchase.items.length > 0) {
        itemMatch = purchase.items.some(item => {
          const itemName = (item.item_name || item.name || '').toLowerCase();
          return itemName.includes(searchStr);
        });
      }

      return poNumber.includes(searchStr) ||
        supplierName.includes(searchStr) ||
        total.includes(searchStr) ||
        status.includes(searchStr) ||
        itemMatch;
    });

    filteredSuppliers = suppliers.filter(supplier => {
      const searchStr = currentSearchTerm.toLowerCase();
      const name = (supplier.name || '').toLowerCase();
      const contact = (supplier.contact_person || '').toLowerCase();
      const email = (supplier.email || '').toLowerCase();
      const phone = (supplier.phone || '').toLowerCase();

      return name.includes(searchStr) ||
        contact.includes(searchStr) ||
        email.includes(searchStr) ||
        phone.includes(searchStr);
    });
  }

  const orderedPurchases = filteredPurchases.filter(p => {
    const s = getStatus(p);
    return s === 'ordered' || s === 'partial';
  });
  const receivedPurchases = filteredPurchases.filter(p => getStatus(p) === 'received');

  renderPurchasesTable('all', filteredPurchases);
  renderPurchasesTable('ordered', orderedPurchases);
  renderReceivedTable(receivedPurchases);
  renderSuppliers(filteredSuppliers);
}

// Change page for a specific tab
function changePurchasePage(type, page) {
  if (page < 1 || page > paginationState[type].totalPages) return;
  paginationState[type].currentPage = page;
  renderAllTabs();
}

// Make changePurchasePage globally accessible
window.changePurchasePage = changePurchasePage;

// Render pagination controls
function renderPurchasePagination(type, totalItems, tableWrapperSelector) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  paginationState[type].totalPages = totalPages || 1;

  // Ensure current page is valid
  if (paginationState[type].currentPage > totalPages) {
    paginationState[type].currentPage = Math.max(1, totalPages);
  }

  const currentPage = paginationState[type].currentPage;

  // Find or create pagination container
  let paginationContainer = document.getElementById(`${type}PurchasesPagination`);
  const tableWrapper = document.querySelector(tableWrapperSelector);

  if (!paginationContainer && tableWrapper) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = `${type}PurchasesPagination`;
    paginationContainer.className = 'pagination-container';
    tableWrapper.parentNode.insertBefore(paginationContainer, tableWrapper.nextSibling);
  }

  if (!paginationContainer) return;

  // Hide pagination if only 1 page or no items
  if (totalPages <= 1) {
    paginationContainer.innerHTML = '';
    return;
  }

  // Calculate page range to show
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  let pagesHtml = '';

  // First page and ellipsis
  if (startPage > 1) {
    pagesHtml += `<button class="pagination-btn" onclick="changePurchasePage('${type}', 1)">1</button>`;
    if (startPage > 2) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  // Page numbers
  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    pagesHtml += `<button class="pagination-btn ${activeClass}" onclick="changePurchasePage('${type}', ${i})">${i}</button>`;
  }

  // Last page and ellipsis
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
    pagesHtml += `<button class="pagination-btn" onclick="changePurchasePage('${type}', ${totalPages})">${totalPages}</button>`;
  }

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
  const itemLabel = type === 'suppliers' ? 'suppliers' : 'purchases';

  paginationContainer.innerHTML = `
    <div class="pagination-info">
      Showing ${startItem}-${endItem} of ${totalItems} ${itemLabel}
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn pagination-nav" onclick="changePurchasePage('${type}', ${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        ← Prev
      </button>
      ${pagesHtml}
      <button class="pagination-btn pagination-nav" onclick="changePurchasePage('${type}', ${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        Next →
      </button>
    </div>
  `;
}

// Render purchases table
function renderPurchasesTable(type, data) {
  const tbody = document.getElementById(`${type}PurchasesTableBody`);
  if (!tbody) return;

  // Calculate pagination
  const totalItems = data.length;
  const currentPage = paginationState[type].currentPage;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = data.slice(startIndex, endIndex);

  // Render pagination controls
  renderPurchasePagination(type, totalItems, `#tab-${type} .purchases-table-wrapper`);

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px;">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">📦</div>
          <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">
            No ${type === 'all' ? '' : type} purchases found
          </div>
          <div style="font-size: 14px; color: #868e96; margin-bottom: 24px;">
            ${type === 'all' ? 'Create your first purchase order' : `No ${type} orders at the moment`}
          </div>
          ${type === 'all' ? '<button class="btn btn-primary" onclick="openNewPurchaseModal()">Create First Purchase</button>' : ''}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = paginatedData.map(purchase => {
    const poNumber = purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`;
    const date = formatDate(purchase.date || purchase.created_at);
    const supplier = purchase.supplier_name || 'N/A';
    const total = formatCurrency(purchase.total_amount || 0);
    const expectedDate = purchase.expected_date ? formatDate(purchase.expected_date) : 'N/A';

    // Extract item names and quantities
    let itemNames = 'N/A';
    let totalQuantity = 0;
    let itemNamesHtml = 'N/A';

    if (purchase.items && purchase.items.length > 0) {
      // Store items in cache for later retrieval
      purchaseItemsCache[purchase.id] = purchase.items;

      // Get item names
      const names = purchase.items.map(item => item.item_name || item.name || 'Unknown');

      if (names.length > 0) {
        if (names.length === 1) {
          // Single item - show name only
          itemNamesHtml = names[0];
        } else if (names.length === 2) {
          // Two items - show both names
          itemNamesHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${names[0]}, ${names[1]}</a>`;
        } else {
          // More than 2 items - show first one and count
          itemNamesHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${names[0]} + ${names.length - 1} more</a>`;
        }
      }

      // Calculate total quantity
      totalQuantity = purchase.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
    }

    let statusBadge = '';
    const status = purchase.status || 'ordered';
    const statusClass = `status-${status}`;
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    const actionButtons = `
      ${(purchase.status === 'ordered' || purchase.status === 'partial')
        ? `<button class="btn btn-success" onclick="openReceiveModal(${purchase.id})" style="padding: 6px 12px; font-size: 12px; margin-right: 4px;">Receive</button>`
        : `<button class="btn btn-secondary" onclick="viewPurchase(${purchase.id})" style="padding: 6px 12px; font-size: 12px; margin-right: 4px;">View</button>`}
      <button class="btn btn-danger" onclick="deletePurchase(${purchase.id})" style="padding: 6px 12px; font-size: 12px;">Delete</button>
    `;

    // Different columns for ordered tab
    if (type === 'ordered') {
      return `
        <tr>
          <td data-label="PO Number"><strong>${poNumber}</strong></td>
          <td data-label="Date">${date}</td>
          <td data-label="Supplier">${supplier}</td>
          <td data-label="Item Name">${itemNamesHtml}</td>
          <td data-label="Quantity">${totalQuantity}</td>
          <td data-label="Total Amount"><strong>${total}</strong></td>
          <td data-label="Expected Date">${expectedDate}</td>
          <td>${actionButtons}</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td data-label="PO Number"><strong>${poNumber}</strong></td>
        <td data-label="Date">${date}</td>
        <td data-label="Supplier">${supplier}</td>
        <td data-label="Item Name">${itemNamesHtml}</td>
        <td data-label="Quantity">${totalQuantity}</td>
        <td data-label="Total Amount"><strong>${total}</strong></td>
        <td data-label="Status">${statusBadge}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

// Render received table
function renderReceivedTable(data) {
  const tbody = document.getElementById('receivedPurchasesTableBody');
  if (!tbody) return;

  // Calculate pagination
  const totalItems = data.length;
  const currentPage = paginationState['received'].currentPage;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = data.slice(startIndex, endIndex);

  // Render pagination controls
  renderPurchasePagination('received', totalItems, '#tab-received .purchases-table-wrapper');

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px;">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">📦</div>
          <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">No received purchases</div>
          <div style="font-size: 14px; color: #868e96;">Orders will appear here once marked as received</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = paginatedData.map(purchase => {
    const poNumber = purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`;
    const dateOrdered = formatDate(purchase.date || purchase.created_at);
    const dateReceived = formatDate(purchase.received_date || purchase.updated_at);
    const supplier = purchase.supplier_name || 'N/A';
    const total = formatCurrency(purchase.total_amount || 0);
    const expectedDate = purchase.expected_date ? formatDate(purchase.expected_date) : 'N/A';

    // Extract item names and quantities
    let itemNamesHtml = 'N/A';
    let totalQuantity = 0;

    if (purchase.items && purchase.items.length > 0) {
      // Store items in cache for later retrieval
      purchaseItemsCache[purchase.id] = purchase.items;

      // Get item names
      const names = purchase.items.map(item => item.item_name || item.name || 'Unknown');

      if (names.length > 0) {
        if (names.length === 1) {
          // Single item - show name only
          itemNamesHtml = names[0];
        } else if (names.length === 2) {
          // Two items - show both names
          itemNamesHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${names[0]}, ${names[1]}</a>`;
        } else {
          // More than 2 items - show first one and count
          itemNamesHtml = `<a href="javascript:void(0)" onclick="showPurchaseItems(${purchase.id})" style="color: #3b82f6; text-decoration: underline; cursor: pointer;">${names[0]} + ${names.length - 1} more</a>`;
        }
      }

      // Calculate total quantity
      totalQuantity = purchase.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
    }

    return `
      <tr>
        <td><strong>${poNumber}</strong></td>
        <td>${dateOrdered}</td>
        <td>${dateReceived}</td>
        <td>${supplier}</td>
        <td>${itemNamesHtml}</td>
        <td>${totalQuantity}</td>
        <td>${expectedDate}</td>
        <td><strong>${total}</strong></td>
        <td>
          <button class="btn btn-secondary" onclick="viewPurchase(${purchase.id})" 
            style="padding: 6px 12px; font-size: 12px;">View</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Render suppliers
function renderSuppliers(filteredSuppliers = null) {
  const tbody = document.getElementById('suppliersTableBody');
  if (!tbody) return;

  // Safety: if suppliers array is empty but we have purchases, rebuild rows
  if (suppliers.length === 0 && purchases.length > 0) {
    suppliers = buildSupplierRowsFromPurchases();
  }

  // Use filtered suppliers if provided, otherwise use all suppliers
  const suppliersToRender = filteredSuppliers !== null ? filteredSuppliers : suppliers;

  // Calculate pagination
  const totalItems = suppliersToRender.length;
  const currentPage = paginationState['suppliers'].currentPage;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedSuppliers = suppliersToRender.slice(startIndex, endIndex);

  // Render pagination controls
  renderPurchasePagination('suppliers', totalItems, '#tab-suppliers .purchases-table-wrapper');

  if (suppliers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 48px;">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">👥</div>
          <div style="font-size: 18px; font-weight: 600; color: #495057; margin-bottom: 8px;">No suppliers yet</div>
          <div style="font-size: 14px; color: #868e96; margin-bottom: 24px;">Suppliers will appear here when you receive purchase orders</div>
          <button class="btn btn-primary" onclick="openAddSupplierModal()">Add First Supplier</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = paginatedSuppliers.map(supplier => `
    <tr>
      <td><strong>${supplier.name}</strong></td>
      <td>${supplier.contact_person || '-'}</td>
      <td>${supplier.email || '-'}</td>
      <td>${supplier.phone || '-'}</td>
      <td>${supplier.item_name || '-'}</td>
      <td>${Math.round(supplier.total_quantity ?? supplier.total_orders ?? 0)}</td>
      <td><strong>${formatCurrency(supplier.total_spent || 0)}</strong></td>
      <td>
        <button class="btn btn-secondary" onclick="editSupplier(${supplier.id})" 
          style="padding: 6px 12px; font-size: 12px; margin-right: 4px;">Edit</button>
        <button class="btn btn-danger" onclick="deleteSupplier(${supplier.id})" 
          style="padding: 6px 12px; font-size: 12px;">Delete</button>
      </td>
    </tr>
  `).join('');
}

// Add purchase item
function addPurchaseItem() {
  const itemInput = document.getElementById('purchaseItemInput');
  const quantityInput = document.getElementById('purchaseQuantity');
  const priceInput = document.getElementById('purchasePrice');
  const sellingPriceInput = document.getElementById('purchaseSellingPrice');

  const itemName = itemInput.value;
  const quantity = parseFormattedNumber(quantityInput.value);
  const price = parseFormattedNumber(priceInput.value);
  const sellingPrice = parseFormattedNumber(sellingPriceInput.value);

  if (!itemName || !Number.isFinite(quantity) || quantity <= 0) {
    showAlert('Please select an item and enter quantity', 'error');
    return;
  }

  /* 
   * Allow adding new items dynamically.
   * If item exists, use it.
   * If not, assume it's a new item to be created on submit.
   */
  /* 
   * Search case-insensitive to avoid duplicates (backend uses ILIKE)
   */
  const itemNameNormalized = itemName.trim().toLowerCase();
  const item = allItems.find(i => i.name.toLowerCase() === itemNameNormalized);
  let itemId = null;
  let isNew = false;

  if (item) {
    itemId = item.id;
  } else {
    itemId = null; // Will be created
    isNew = true;
  }

  const unitPrice = price || (item ? item.purchase_cost : 0) || 0;
  const itemSellingPrice = sellingPrice || (item ? item.selling_price : 0) || 0;
  const totalPrice = quantity * unitPrice;

  purchaseItems.push({
    item_id: itemId,
    item_name: item ? item.name : itemName,
    quantity: quantity,
    unit_cost: unitPrice,
    selling_price: itemSellingPrice,
    total_price: totalPrice,
    is_new: isNew
  });

  renderPurchaseItems();
  calculatePurchaseTotal();

  // Reset inputs
  itemInput.value = '';
  quantityInput.value = '';
  priceInput.value = '';
  sellingPriceInput.value = '';
}

// Remove purchase item
function removePurchaseItem(index) {
  purchaseItems.splice(index, 1);
  renderPurchaseItems();
  calculatePurchaseTotal();
}

// Render purchase items
function renderPurchaseItems() {
  const tbody = document.getElementById('purchaseItemsList');
  if (!tbody) return;

  if (purchaseItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #999; padding: 24px;">
          No items added yet. Add items from above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = purchaseItems.map((item, index) => `
    <tr>
      <td>${item.item_name}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.unit_cost)}</td>
      <td>${formatCurrency(item.selling_price || 0)}</td>
      <td><strong>${formatCurrency(item.total_price)}</strong></td>
      <td>
        <button class="btn btn-danger" onclick="removePurchaseItem(${index})" 
          style="padding: 6px 12px; font-size: 12px;">Remove</button>
      </td>
    </tr>
  `).join('');
}

// Calculate purchase total
function calculatePurchaseTotal() {
  const total = purchaseItems.reduce((sum, item) => sum + item.total_price, 0);
  document.getElementById('purchaseTotalAmount').textContent = formatCurrency(total);
}

// Open new purchase modal
function openNewPurchaseModal() {
  purchaseItems = [];
  const modal = document.getElementById('newPurchaseModal');
  modal.classList.add('active');

  loadItems();
  renderPurchaseItems();
  calculatePurchaseTotal();

  document.getElementById('newPurchaseForm').reset();

  // Auto-generate fresh PO Number every open
  document.getElementById('purchasePONumber').value = generatePoNumber();

  // Set default expected date (7 days from now)
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + 7);
  document.getElementById('purchaseExpectedDate').value = expectedDate.toISOString().split('T')[0];
}

// Close new purchase modal
function closeNewPurchaseModal() {
  const modal = document.getElementById('newPurchaseModal');
  modal.classList.remove('active');
  purchaseItems = [];
}

// Open receive modal
function openReceiveModal(purchaseId) {
  const purchase = purchases.find(p => p.id === purchaseId);
  if (!purchase) return;

  document.getElementById('receivePurchaseId').value = purchaseId;
  document.getElementById('receivePONumber').value = purchase.po_number || purchase.invoice_number || `PO-${purchaseId}`;
  document.getElementById('receiveSupplier').value = purchase.supplier_name || 'N/A';

  // Set today's date
  document.getElementById('receivedDate').value = new Date().toISOString().split('T')[0];

  const modal = document.getElementById('receiveItemsModal');
  modal.classList.add('active');
}

// Close receive modal
function closeReceiveModal() {
  const modal = document.getElementById('receiveItemsModal');
  modal.classList.remove('active');
  document.getElementById('receiveItemsForm').reset();
}

// Open add supplier modal
function openAddSupplierModal() {
  document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
  document.getElementById('supplierForm').reset();
  document.getElementById('supplierId').value = '';

  const modal = document.getElementById('supplierModal');
  modal.classList.add('active');
}

// Open suppliers modal (from header button)
function openSuppliersModal() {
  switchTab('suppliers');
  // scroll to suppliers tab content for clarity
  const suppliersSection = document.getElementById('tab-suppliers');
  if (suppliersSection) {
    suppliersSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// Close supplier modal
function closeSupplierModal() {
  const modal = document.getElementById('supplierModal');
  modal.classList.remove('active');
}

// Edit supplier
function editSupplier(id) {
  const supplier = suppliers.find(s => s.id === id);
  if (!supplier) return;

  document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
  document.getElementById('supplierId').value = supplier.id;
  document.getElementById('supplierName').value = supplier.name;
  document.getElementById('supplierContactPerson').value = supplier.contact_person || '';
  document.getElementById('supplierEmail').value = supplier.email || '';
  document.getElementById('supplierPhone').value = supplier.phone || '';
  document.getElementById('supplierAddress').value = supplier.address || '';
  document.getElementById('supplierNotes').value = supplier.notes || '';

  const modal = document.getElementById('supplierModal');
  modal.classList.add('active');
}

// Delete supplier
async function deleteSupplier(id) {
  if (!confirm('Are you sure you want to delete this supplier?')) return;

  try {
    await suppliersAPI.delete(id);
    showAlert('Supplier deleted successfully', 'success');
    await loadSuppliers();
    updateStats();
  } catch (error) {
    showAlert(error.message || 'Failed to delete supplier', 'error');
  }
}

// Show toast notification (bottom-right)
// Use global toast function if available (has duplicate prevention)
function showToast(message, type = 'success') {
  // Use global showToast if available (from global-features.js)
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    window.showToast(message, type);
    return;
  }

  // Fallback to local implementation if global not available
  const container = document.getElementById('toastContainer') || document.getElementById('toast-container');
  if (!container) return;

  // Create a unique identifier for this toast (message + type)
  const toastId = `${type}-${message}`;

  // Check if a toast with the same message and type already exists
  const existingToast = container.querySelector(`[data-toast-id="${toastId}"]`);
  if (existingToast) {
    // If toast already exists, don't create a duplicate
    return;
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('data-toast-id', toastId);
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Delete purchase modal state
let deletePurchaseId = null;
let isClosingDeletePurchaseModal = false; // Flag to prevent multiple rapid closes

// Open delete purchase confirmation modal
function openDeletePurchaseModal(id) {
  const purchase = purchases.find(p => p.id === id);
  if (!purchase) return;

  deletePurchaseId = id;
  isClosingDeletePurchaseModal = false; // Reset flag when opening modal
  const poNumber = purchase.po_number || purchase.invoice_number || `PO-${id}`;
  document.getElementById('deletePurchasePONumber').textContent = poNumber;

  const modal = document.getElementById('deletePurchaseModal');
  modal.classList.add('active');
}

// Close delete purchase confirmation modal
function closeDeletePurchaseModal() {
  // Prevent multiple rapid calls
  if (isClosingDeletePurchaseModal) {
    return;
  }

  isClosingDeletePurchaseModal = true;
  const modal = document.getElementById('deletePurchaseModal');
  modal.classList.remove('active');
  deletePurchaseId = null;

  // Reset flag after a short delay
  setTimeout(() => {
    isClosingDeletePurchaseModal = false;
  }, 300);
}

// Confirm delete purchase
async function confirmDeletePurchase() {
  if (!deletePurchaseId) return;

  try {
    await purchasesAPI.delete(deletePurchaseId);
    closeDeletePurchaseModal();
    showToast('Purchase deleted successfully', 'success');
    loadData();
  } catch (error) {
    closeDeletePurchaseModal();
    showToast('Failed to delete purchase: ' + error.message, 'error');
  }
}

// Delete purchase (opens the modal)
function deletePurchase(id) {
  openDeletePurchaseModal(id);
}

// View purchase
async function viewPurchase(id) {
  // Use the premium modal instead of alert
  showPurchaseItems(id);
}

// Setup event listeners
function setupEventListeners() {
  // Purchase form submission
  const purchaseForm = document.getElementById('newPurchaseForm');
  if (purchaseForm) {
    // Track if form is currently submitting to prevent duplicate submissions
    let isSubmitting = false;

    purchaseForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Prevent duplicate submissions
      if (isSubmitting) {
        return;
      }

      if (purchaseItems.length === 0) {
        showAlert('Please add at least one item', 'error');
        return;
      }

      // Mark as submitting
      isSubmitting = true;

      const total = purchaseItems.reduce((sum, item) => sum + item.total_price, 0);

      // Get or create supplier (use masterSuppliersCache for correct IDs)
      const supplierName = document.getElementById('purchaseSupplierName').value;
      let supplierId = null;
      let supplier = findMasterSupplierByName(supplierName);

      if (!supplier) {
        // Create new supplier if it doesn't exist
        const contactPerson = document.getElementById('purchaseContactPerson').value;
        const email = document.getElementById('purchaseEmail').value;
        const phone = document.getElementById('purchasePhone').value;

        if (supplierName.trim()) {
          try {
            const newSupplier = await suppliersAPI.create({
              name: supplierName,
              contact_person: contactPerson || null,
              email: email || null,
              phone: phone || null
            });
            supplierId = newSupplier.id;
            // Update master cache
            masterSuppliersCache.push(newSupplier);
          } catch (error) {
            console.error('Error creating supplier:', error);
            // Continue with purchase creation even if supplier creation fails (supplier_id will stay null)
          }
        }
      } else {
        supplierId = supplier.id;

        // Update supplier contact info if provided
        const contactPerson = document.getElementById('purchaseContactPerson').value;
        const email = document.getElementById('purchaseEmail').value;
        const phone = document.getElementById('purchasePhone').value;

        const updates = {};
        if (contactPerson && contactPerson !== supplier.contact_person) updates.contact_person = contactPerson;
        if (email && email !== supplier.email) updates.email = email;
        if (phone && phone !== supplier.phone) updates.phone = phone;

        if (Object.keys(updates).length > 0) {
          try {
            const updated = await suppliersAPI.update(supplierId, updates);
            // refresh master cache entry
            masterSuppliersCache = masterSuppliersCache.map(s => s.id === supplierId ? { ...s, ...updated } : s);
          } catch (error) {
            console.error('Error updating supplier:', error);
          }
        }
      }

      try {
        // Get the status to check if we should create items
        const purchaseStatus = document.getElementById('purchaseStatus').value;

        // Build items array - server will handle item creation and stock updates
        const finalItems = [];

        for (const item of purchaseItems) {
          const qty = Math.round(item.quantity);
          if (item.is_new) {
            // For new items, just pass the details - server will create them
            finalItems.push({
              item_id: null,
              item_name: item.item_name,
              quantity: qty,
              unit_price: item.unit_cost,
              selling_price: item.selling_price || 0,
              is_new: true
            });
          } else {
            // For existing items, include item_name for display purposes
            const existingItem = allItems.find(i => i.id === item.item_id);
            finalItems.push({
              item_id: item.item_id,
              item_name: existingItem ? existingItem.name : item.item_name,
              quantity: qty,
              unit_price: item.unit_cost,
              selling_price: item.selling_price || 0,
              is_new: false  // Explicitly mark as existing item
            });
          }
        }

        const data = {
          supplier_id: supplierId,
          supplier_name: supplierName, // Keep for backward compatibility
          po_number: document.getElementById('purchasePONumber').value || `PO-${Date.now()}`,
          expected_date: document.getElementById('purchaseExpectedDate').value,
          items: finalItems,
          total_amount: total,
          payment_terms: document.getElementById('purchasePaymentTerms').value,
          status: document.getElementById('purchaseStatus').value,
          notes: document.getElementById('purchaseNotes').value || null,
          date: new Date().toISOString()
        };

        const result = await purchasesAPI.create(data);
        showAlert('Purchase order created successfully! 📦', 'success');
        closeNewPurchaseModal();

        // Reload purchases first, then suppliers
        await loadPurchases();
        // Note: Server already updates stock when status is 'received', no need to update again
        await loadSuppliers();
        updateStats();
      } catch (error) {
        showAlert(error.message || 'Failed to create purchase order', 'error');
      } finally {
        // Reset submitting flag after a delay
        setTimeout(() => {
          isSubmitting = false;
        }, 1000);
      }
    });
  }

  // Receive items form submission
  const receiveForm = document.getElementById('receiveItemsForm');
  if (receiveForm) {
    receiveForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const purchaseId = document.getElementById('receivePurchaseId').value;

      // Prevent duplicate operations
      if (processingPurchases.has(purchaseId)) {
        return;
      }

      // Mark as processing
      processingPurchases.add(purchaseId);

      const receivedDate = document.getElementById('receivedDate').value;
      const notes = document.getElementById('receivingNotes').value;

      try {
        // Update purchase status to received - server will handle stock update
        await purchasesAPI.update(purchaseId, {
          status: 'received',
          received_date: receivedDate,
          receiving_notes: notes
        });

        showAlert('Purchase marked as received and stock updated! ✅', 'success');
        closeReceiveModal();
        // Reload purchases first, then suppliers and items
        await loadPurchases();
        await loadSuppliers();
        await loadItems();  // Reload items to reflect updated stock
        updateStats();
      } catch (error) {
        showAlert(error.message || 'Failed to receive purchase', 'error');
      } finally {
        // Remove from processing set after a delay
        setTimeout(() => {
          processingPurchases.delete(purchaseId);
        }, 1000);
      }
    });
  }

  // Supplier form submission
  const supplierForm = document.getElementById('supplierForm');
  if (supplierForm) {
    supplierForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const supplierId = document.getElementById('supplierId').value;
      const data = {
        name: document.getElementById('supplierName').value,
        contact_person: document.getElementById('supplierContactPerson').value,
        email: document.getElementById('supplierEmail').value,
        phone: document.getElementById('supplierPhone').value,
        address: document.getElementById('supplierAddress').value,
        notes: document.getElementById('supplierNotes').value
      };

      try {
        if (supplierId) {
          // Update existing supplier
          await suppliersAPI.update(supplierId, data);
          showAlert('Supplier updated successfully', 'success');
        } else {
          // Add new supplier
          await suppliersAPI.create(data);
          showAlert('Supplier added successfully', 'success');
        }

        closeSupplierModal();
        await loadSuppliers();
        updateStats();
      } catch (error) {
        showAlert(error.message || 'Failed to save supplier', 'error');
      }
    });
  }

  // Auto-fill price and selling price when item entered
  const itemInput = document.getElementById('purchaseItemInput');
  if (itemInput) {
    itemInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      // Find item by name (case-insensitive)
      const item = allItems.find(i => i.name.toLowerCase() === val.toLowerCase());
      if (item) {
        const priceInput = document.getElementById('purchasePrice');
        const sellingPriceInput = document.getElementById('purchaseSellingPrice');

        // Auto-fill unit cost
        if (priceInput) {
          priceInput.value = item.purchase_cost || item.cost || 0;
        }

        // Auto-fill selling price
        if (sellingPriceInput) {
          sellingPriceInput.value = item.selling_price || 0;
        }
      }
    });

    // Also handle when item is selected from datalist (on change event)
    itemInput.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      // Find item by name (case-insensitive)
      const item = allItems.find(i => i.name.toLowerCase() === val.toLowerCase());
      if (item) {
        const priceInput = document.getElementById('purchasePrice');
        const sellingPriceInput = document.getElementById('purchaseSellingPrice');

        // Auto-fill unit cost
        if (priceInput) {
          priceInput.value = item.purchase_cost || item.cost || 0;
        }

        // Auto-fill selling price
        if (sellingPriceInput) {
          sellingPriceInput.value = item.selling_price || 0;
        }
      }
    });
  }

  // Auto-fill supplier contact info when supplier name entered
  const supplierInput = document.getElementById('purchaseSupplierName');
  if (supplierInput) {
    supplierInput.addEventListener('input', (e) => {
      const supplierName = e.target.value.trim();
      const supplier = findMasterSupplierByName(supplierName);
      if (supplier) {
        document.getElementById('purchaseContactPerson').value = supplier.contact_person || '';
        document.getElementById('purchaseEmail').value = supplier.email || '';
        document.getElementById('purchasePhone').value = supplier.phone || '';
      }
    });
  }

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        // For delete purchase modal, use the close function to prevent duplicates
        if (modal.id === 'deletePurchaseModal') {
          closeDeletePurchaseModal();
        } else {
          modal.classList.remove('active');
        }
      }
    });
  });
}

// Update stock for received purchase
async function updateStockForPurchase(purchaseId, forceUpdate = false) {
  try {
    // Fetch purchase details from API to get items
    const purchase = await purchasesAPI.getById(purchaseId);
    if (!purchase || !purchase.items || purchase.items.length === 0) {
      console.warn('Purchase has no items to update stock for');
      return;
    }

    // Reload items to get current stock levels
    await loadItems();

    const poNumber = purchase.po_number || purchase.invoice_number || `PO-${purchaseId}`;

    // Update stock for each item
    for (const pItem of purchase.items) {
      let itemId = pItem.item_id;
      let currentItem = allItems.find(i => i.id === itemId);

      // If item_id is null and is_new is true, create the new item first
      if (!itemId && pItem.is_new && pItem.item_name) {
        // Create new item
        const newItemResult = await itemsAPI.create({
          name: pItem.item_name,
          quantity: 0,
          price: pItem.selling_price || pItem.unit_price,
          cost: pItem.unit_price,
          unit: 'pcs'
        });

        if (newItemResult && newItemResult.id) {
          itemId = newItemResult.id;
          currentItem = newItemResult;
          // Reload items to include the newly created item
          await loadItems();
          currentItem = allItems.find(i => i.id === itemId);
        } else {
          console.error(`Failed to create new item: ${pItem.item_name}`);
          continue;
        }
      }

      if (currentItem) {
        // If forceUpdate is true (when marking as received), always update stock
        if (forceUpdate) {
          const currentStock = parseFloat(currentItem.stock_quantity) || 0;
          const purchaseQty = parseInt(pItem.quantity) || 0;  // Ensure it's a number
          const newStock = currentStock + purchaseQty;

          // Update item stock - API requires name, quantity, and price
          await itemsAPI.update(itemId, {
            name: currentItem.name,
            quantity: newStock,
            price: currentItem.selling_price || currentItem.price || 0,
            cost: currentItem.purchase_cost || currentItem.cost || 0,
            sku: currentItem.sku || null,
            unit: currentItem.unit || 'pcs',
            reorder_point: currentItem.reorder_point || 10
          });

          // Log transaction
          await inventoryAPI.stockIn({
            item_id: itemId,
            quantity: purchaseQty,
            reference: poNumber,
            notes: `Purchase Order Received - ${purchase.supplier_name || 'N/A'}`,
            type: 'IN'
          });
        } else {
          // Not forcing - only update if purchase wasn't already received when created
          const purchaseStatus = purchase.status || 'ordered';
          if (purchaseStatus !== 'received') {
            const currentStock = parseFloat(currentItem.stock_quantity) || 0;
            const purchaseQty = parseInt(pItem.quantity) || 0;  // Ensure it's a number
            const newStock = currentStock + purchaseQty;

            // Update item stock - API requires name, quantity, and price
            await itemsAPI.update(itemId, {
              name: currentItem.name,
              quantity: newStock,
              price: currentItem.selling_price || currentItem.price || 0,
              cost: currentItem.purchase_cost || currentItem.cost || 0,
              sku: currentItem.sku || null,
              unit: currentItem.unit || 'pcs',
              reorder_point: currentItem.reorder_point || 10
            });

            await inventoryAPI.stockIn({
              item_id: itemId,
              quantity: purchaseQty,
              reference: poNumber,
              notes: `Purchase Order Received - ${purchase.supplier_name || 'N/A'}`,
              type: 'IN'
            });
          }
        }
      }
    }

    console.log('Stock levels updated successfully');
  } catch (error) {
    console.error('Error updating stock:', error);
    throw error;
  }
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
