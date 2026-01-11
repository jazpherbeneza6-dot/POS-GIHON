// Sales Management with comprehensive features

let sales = [];
let saleItems = [];
let allItems = [];
let currentTab = 'all';
let revenueData = {
  today: 0,
  month: 0,
  total: 0,
  pending: 0
};

// Track processing sales to prevent duplicate operations
const processingSales = new Set();

// Pagination settings
const ITEMS_PER_PAGE = 10;
const paginationState = {
  all: { currentPage: 1, totalPages: 1 },
  completed: { currentPage: 1, totalPages: 1 },
  pending: { currentPage: 1, totalPages: 1 },
  cancelled: { currentPage: 1, totalPages: 1 }
};

// Ensure sales is always an array
if (!Array.isArray(sales)) {
  sales = [];
}

function checkAndGenerateNotifications() {
  // Check for pending orders
  const pendingCount = sales.filter(s => s.status === 'pending').length;
  if (pendingCount > 0) {
    if (window.addNotification) {
      window.addNotification('Pending Orders', `You have ${pendingCount} pending order${pendingCount > 1 ? 's' : ''} awaiting fulfillment.`, 'warning');
    }
  }

  // Check for low stock items
  const lowStockItems = allItems.filter(item => (item.stock_quantity || 0) <= (item.reorder_point || 10));
  if (lowStockItems.length > 0) {
    if (window.addNotification) {
      window.addNotification('Low Stock Alert', `${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low on stock.`, 'error');
    }
  }
}

// Search state
let currentSearchTerm = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();

  // Setup search listener for the new search bar
  const searchInput = document.getElementById('salesSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      renderAllTabs();
    });
  }

  // Wait for layout to be ready to attach header listeners
  document.addEventListener('layoutReady', () => {
    const notificationIcon = document.querySelector('.header-icon.notification-icon');
    if (notificationIcon) {
      notificationIcon.style.cursor = 'pointer';
      // Click listener is handled by notifications.js
    }
  });
});

// formatNumberInput and parseFormattedNumber are now in utils.js
// They are available globally via window.formatNumberInput and window.parseFormattedNumber

// Load all data
async function loadData() {
  try {
    // Load items and sales in parallel, but don't let one failure stop the other
    const results = await Promise.allSettled([
      loadItems(),
      loadSales()
    ]);
    
    // Check for errors
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const name = index === 0 ? 'items' : 'sales';
        console.error(`Error loading ${name}:`, result.reason);
      }
    });
    
    // Always try to calculate revenue and update tabs even if there were errors
    calculateRevenue();
    updateTabCounts();
    setTimeout(checkAndGenerateNotifications, 1000);
  } catch (error) {
    console.error('Error loading data:', error);
    // Ensure UI is updated even on error
    clearLoadingState();
    renderAllTabs();
  }
}

// Load items for sale
async function loadItems() {
  try {
    allItems = await itemsAPI.getAll();
    populateItemSelect();
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Load sales with timeout protection
async function loadSales() {
  try {
    // Ensure sales is initialized as an array
    sales = [];
    
    // Clear loading state immediately
    clearLoadingState();
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout: Sales data took too long to load')), 10000);
    });
    
    const apiPromise = salesAPI.getAll({ limit: 100 });
    const result = await Promise.race([apiPromise, timeoutPromise]);
    
    // Handle different response formats
    if (Array.isArray(result)) {
      sales = result;
    } else if (result && Array.isArray(result.data)) {
      sales = result.data;
    } else if (result && result.sales && Array.isArray(result.sales)) {
      sales = result.sales;
    } else {
      sales = [];
    }
    
    renderAllTabs();
  } catch (error) {
    console.error('Error loading sales:', error);
    // Ensure sales is an empty array on error
    sales = [];
    // Clear loading state and show empty state
    clearLoadingState();
    renderAllTabs();
    
    // Show error message
    const errorMsg = error.message || 'Unknown error';
    if (errorMsg.includes('timeout')) {
      showAlert('Sales data is taking too long to load. Please check your connection or try refreshing the page.', 'error');
    } else {
      showAlert('Failed to load sales: ' + errorMsg, 'error');
    }
  }
}

// Clear loading state from all table bodies
function clearLoadingState() {
  const tableBodies = [
    'allSalesTableBody',
    'completedSalesTableBody',
    'pendingSalesTableBody',
    'cancelledSalesTableBody'
  ];
  
  tableBodies.forEach(id => {
    const tbody = document.getElementById(id);
    if (tbody) {
      // Check if it's still showing loading state
      const loadingText = tbody.textContent || '';
      if (loadingText.includes('Loading')) {
        // Clear it - renderAllTabs will handle rendering
        tbody.innerHTML = '';
      }
    }
  });
}

// Populate item select
function populateItemSelect() {
  const select = document.getElementById('saleItemSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Select Item</option>' +
    allItems.filter(item => (item.stock_quantity || 0) > 0).map(item =>
      `<option value="${item.id}" data-price="${item.selling_price}" data-stock="${item.stock_quantity}">
        ${item.name} (Stock: ${item.stock_quantity || 0})
      </option>`
    ).join('');
}

// Calculate revenue
function calculateRevenue() {
  const today = new Date().toDateString();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  let todayRevenue = 0;
  let monthRevenue = 0;
  let totalRevenue = 0;
  let pendingCount = 0;

  sales.forEach(sale => {
    const saleDate = new Date(sale.date || sale.created_at);
    const amount = parseFloat(sale.total_amount) || 0;
    const status = sale.status || 'completed'; // Default to completed if no status

    // Today's revenue (completed sales only)
    if (saleDate.toDateString() === today && status === 'completed') {
      todayRevenue += amount;
    }

    // This month's revenue (completed sales only)
    if (saleDate.getMonth() === currentMonth &&
      saleDate.getFullYear() === currentYear &&
      status === 'completed') {
      monthRevenue += amount;
    }

    // Total revenue (completed only)
    if (status === 'completed') {
      totalRevenue += amount;
    }

    // Pending count
    if (status === 'pending') {
      pendingCount++;
    }
  });

  // Update UI
  document.getElementById('todayRevenue').textContent = formatCurrency(todayRevenue);
  document.getElementById('monthRevenue').textContent = formatCurrency(monthRevenue);
  document.getElementById('totalSales').textContent = sales.length;
  document.getElementById('pendingOrders').textContent = pendingCount;

  revenueData = {
    today: todayRevenue,
    month: monthRevenue,
    total: totalRevenue,
    pending: pendingCount
  };
}

// Update tab counts
function updateTabCounts() {
  const completed = sales.filter(s => (s.status || 'completed') === 'completed').length;
  const pending = sales.filter(s => s.status === 'pending').length;
  const cancelled = sales.filter(s => s.status === 'cancelled').length;
  document.getElementById('allCount').textContent = sales.length;
  document.getElementById('completedCount').textContent = completed;
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('cancelledCount').textContent = cancelled;
}

// Switch tabs
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.closest('.tab-button').classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Render appropriate table
  renderAllTabs();
}

// Render all tabs
function renderAllTabs() {
  // Ensure sales is an array
  if (!Array.isArray(sales)) {
    sales = [];
  }
  
  // Filter sales based on search term
  let filteredSales = sales;
  if (currentSearchTerm) {
    filteredSales = sales.filter(sale => {
      const searchStr = currentSearchTerm.toLowerCase();
      const customer = (sale.customer_name || '').toLowerCase();
      const orderNum = (sale.receipt_number || sale.order_number || `ORD-${sale.id}`).toLowerCase();
      const status = (sale.status || '').toLowerCase();
      const total = (sale.total_amount || 0).toString();

      return customer.includes(searchStr) ||
        orderNum.includes(searchStr) ||
        status.includes(searchStr) ||
        total.includes(searchStr);
    });
    // Reset to page 1 when searching
    Object.keys(paginationState).forEach(key => {
      paginationState[key].currentPage = 1;
    });
  }

  renderSalesTable('all', filteredSales);
  renderSalesTable('completed', filteredSales.filter(s => s.status === 'completed'));
  renderSalesTable('pending', filteredSales.filter(s => s.status === 'pending'));
  renderSalesTable('cancelled', filteredSales.filter(s => s.status === 'cancelled'));
}

// Change page for a specific tab
function changePage(type, page) {
  if (page < 1 || page > paginationState[type].totalPages) return;
  paginationState[type].currentPage = page;
  renderAllTabs();
}

// Render pagination controls
function renderPagination(type, totalItems) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  paginationState[type].totalPages = totalPages || 1;
  
  // Ensure current page is valid
  if (paginationState[type].currentPage > totalPages) {
    paginationState[type].currentPage = Math.max(1, totalPages);
  }
  
  const currentPage = paginationState[type].currentPage;
  
  // Find or create pagination container
  let paginationContainer = document.getElementById(`${type}Pagination`);
  const tableWrapper = document.querySelector(`#tab-${type} .sales-table-wrapper`);
  
  if (!paginationContainer && tableWrapper) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = `${type}Pagination`;
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
    pagesHtml += `<button class="pagination-btn" onclick="changePage('${type}', 1)">1</button>`;
    if (startPage > 2) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
  }
  
  // Page numbers
  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    pagesHtml += `<button class="pagination-btn ${activeClass}" onclick="changePage('${type}', ${i})">${i}</button>`;
  }
  
  // Last page and ellipsis
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
    pagesHtml += `<button class="pagination-btn" onclick="changePage('${type}', ${totalPages})">${totalPages}</button>`;
  }
  
  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
  
  paginationContainer.innerHTML = `
    <div class="pagination-info">
      Showing ${startItem}-${endItem} of ${totalItems} orders
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn pagination-nav" onclick="changePage('${type}', ${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        ← Prev
      </button>
      ${pagesHtml}
      <button class="pagination-btn pagination-nav" onclick="changePage('${type}', ${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        Next →
      </button>
    </div>
  `;
}

// Render sales table
function renderSalesTable(type, data) {
  const tbody = document.getElementById(`${type}SalesTableBody`);
  if (!tbody) return;
  
  // Calculate pagination
  const totalItems = data.length;
  const currentPage = paginationState[type].currentPage;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = data.slice(startIndex, endIndex);
  
  // Render pagination controls
  renderPagination(type, totalItems);

  if (data.length === 0) {
    // All tabs now have 8 columns (including Status column)
    const colspan = 8;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="empty-state-cell">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">
            No ${type === 'all' ? '' : type} orders found
          </div>
          <div class="empty-state-subtitle">
          ${type === 'all' ? 'No orders yet' : `No ${type} orders at the moment`}
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = paginatedData.map(sale => {
    const orderNumber = sale.receipt_number || sale.order_number || `ORD-${sale.id}`;
    const date = formatDate(sale.date || sale.created_at);
    const customer = sale.customer_name || 'Walk-in Customer';
    const itemCount = sale.items_count || sale.item_count || (sale.items ? sale.items.length : 0);
    const itemsSummary = sale.items_summary || '';
    const total = formatCurrency(sale.total_amount || 0);
    const payment = sale.payment_method || '-';
    const status = sale.status || 'completed';

    // Format items display - show names if available, otherwise show count
    let itemsDisplay = '';
    if (itemsSummary) {
      // Truncate if too long and show tooltip
      const maxLen = 30;
      const displayText = itemsSummary.length > maxLen
        ? itemsSummary.substring(0, maxLen) + '...'
        : itemsSummary;
      itemsDisplay = `<span onclick="event.stopPropagation(); showSaleItemsModal(${sale.id})" 
        class="items-link"
        title="Click to view all items: ${itemsSummary}">${displayText}</span>`;
    } else {
      itemsDisplay = `<span onclick="event.stopPropagation(); showSaleItemsModal(${sale.id})" 
        class="items-link"
        title="Click to view items">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>`;
    }

    let statusBadge = '';
    const statusClass = `status-${status}`;
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    // Different action buttons based on status
    let actionButtons = '';
    if (status === 'pending' || type === 'pending') {
      // Pending orders get Accept and Cancel buttons
      actionButtons = `
        <div class="action-btn-group">
          <button onclick="event.stopPropagation(); acceptSale(${sale.id})" class="action-btn action-btn-accept">
            Accept
          </button>
          <button onclick="event.stopPropagation(); cancelSale(${sale.id})" class="action-btn action-btn-cancel">
            Cancel
          </button>
        </div>
      `;
    } else if (status === 'cancelled' || type === 'cancelled') {
      // Cancelled orders get View and Delete buttons
      actionButtons = `
        <div class="action-btn-group">
          <button onclick="event.stopPropagation(); viewReceipt(${sale.id})" class="action-btn action-btn-view">
            View
          </button>
          <button onclick="event.stopPropagation(); deleteSale(${sale.id})" class="action-btn action-btn-delete">
            Delete
          </button>
        </div>
      `;
    } else {
      // Completed orders get Edit, Receipt, Delete buttons
      actionButtons = `
        <div class="action-btn-group">
          <button onclick="event.stopPropagation(); editSale(${sale.id})" class="action-btn action-btn-edit">
            Edit
          </button>
          <button onclick="event.stopPropagation(); viewReceipt(${sale.id})" class="action-btn action-btn-receipt">
            Receipt
          </button>
          <button onclick="event.stopPropagation(); deleteSale(${sale.id})" class="action-btn action-btn-delete">
            Delete
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td data-label="Order #"><strong>${orderNumber}</strong></td>
        <td data-label="Date">${date}</td>
        <td data-label="Customer">${customer}</td>
        <td data-label="Items">${itemsDisplay}</td>
        <td data-label="Total Amount"><strong>${total}</strong></td>
        <td data-label="Payment">${payment}</td>
        <td data-label="Status">${statusBadge}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');

  // Handle cancelled orders specific columns
  if (type === 'cancelled' && paginatedData.length > 0) {
    tbody.innerHTML = paginatedData.map(sale => {
      const orderNumber = sale.receipt_number || sale.order_number || `ORD-${sale.id}`;
      const date = formatDate(sale.date || sale.created_at);
      const cancelledDate = formatDate(sale.cancelled_date || sale.updated_at);
      const customer = sale.customer_name || 'Walk-in Customer';
      const total = formatCurrency(sale.total_amount || 0);
      const reason = sale.cancellation_reason || 'Not specified';

      return `
        <tr>
          <td data-label="Order #"><strong>${orderNumber}</strong></td>
          <td data-label="Date">${date}</td>
          <td data-label="Customer">${customer}</td>
          <td data-label="Total Amount"><strong>${total}</strong></td>
          <td data-label="Cancelled Date">${cancelledDate}</td>
          <td data-label="Reason">${reason}</td>
          <td>
            <div class="action-btn-group">
              <button class="action-btn action-btn-view" onclick="viewReceipt(${sale.id})">View</button>
              <button class="action-btn action-btn-delete" onclick="deleteSale(${sale.id})">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}



// Add sale item
function addSaleItem() {
  const itemSelect = document.getElementById('saleItemSelect');
  const quantityInput = document.getElementById('saleQuantity');
  const priceInput = document.getElementById('salePrice');

  const itemId = parseInt(itemSelect.value);
  const quantity = parseFormattedNumber(quantityInput.value);
  const price = parseFormattedNumber(priceInput.value);

  if (!itemId || !quantity || quantity <= 0) {
    showAlert('Please select an item and enter quantity', 'error');
    return;
  }

  const item = allItems.find(i => i.id === itemId);
  if (!item) {
    showAlert('Item not found', 'error');
    return;
  }

  // Stock validation
  if (item.stock_quantity < quantity) {
    showAlert(`Insufficient stock! Available: ${item.stock_quantity} ${item.unit || 'units'}`, 'error');
    return;
  }

  const unitPrice = price || item.selling_price || 0;
  const totalPrice = quantity * unitPrice;

  saleItems.push({
    item_id: itemId,
    item_name: item.name,
    quantity: quantity,
    unit_price: unitPrice,
    total_price: totalPrice
  });

  renderSaleItems();
  calculateSaleTotal();

  // Reset inputs
  itemSelect.value = '';
  quantityInput.value = '';
  priceInput.value = '';
}

// Remove sale item
function removeSaleItem(index) {
  saleItems.splice(index, 1);
  renderSaleItems();
  calculateSaleTotal();
}

// Render sale items
function renderSaleItems() {
  const tbody = document.getElementById('saleItemsList');
  if (!tbody) return;

  if (saleItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-message table-empty">
          No items added yet. Add items from above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = saleItems.map((item, index) => `
    <tr>
      <td>${item.item_name}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.unit_price)}</td>
      <td><strong>${formatCurrency(item.total_price)}</strong></td>
      <td>
        <button class="action-btn action-btn-delete" onclick="removeSaleItem(${index})">Remove</button>
      </td>
    </tr>
  `).join('');
}

// Calculate sale total
function calculateSaleTotal() {
  const subtotal = saleItems.reduce((sum, item) => sum + item.total_price, 0);

  // Get discount
  const discountValue = parseFloat(document.getElementById('saleDiscountValue').value) || 0;
  const discountType = document.getElementById('saleDiscountType').value;

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100;
  } else {
    discountAmount = discountValue;
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);

  // Get tax
  const taxRate = parseFloat(document.getElementById('saleTaxRate').value) || 0;
  const taxAmount = (afterDiscount * taxRate) / 100;

  const total = afterDiscount + taxAmount;

  // Update UI
  document.getElementById('saleSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('saleTaxAmount').textContent = formatCurrency(taxAmount);
  document.getElementById('saleTotalAmount').textContent = formatCurrency(total);
}

// Close new sale modal
function closeNewSaleModal() {
  const modal = document.getElementById('newSaleModal');
  modal.classList.remove('active');
  saleItems = [];
}

// View sale details
function viewSaleDetails(saleId) {
  console.log('View sale details:', saleId);
  // Could open a detail modal or navigate to detail page
  viewReceipt(saleId);
}

// View receipt
async function viewReceipt(saleId) {
  try {
    // Open receipt in new window
    window.open(`/receipt.html?id=${saleId}`, '_blank');
  } catch (error) {
    showAlert('Failed to load receipt', 'error');
  }
}

// Edit sale
async function editSale(saleId) {
  try {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
      showAlert('Sale not found', 'error');
      return;
    }

    // Populate the edit form
    document.getElementById('editSaleId').value = sale.id;
    document.getElementById('editReceiptNumber').value = sale.receipt_number || `ORD-${sale.id}`;
    document.getElementById('editCustomerName').value = sale.customer_name || '';
    document.getElementById('editPaymentMethod').value = sale.payment_method || '';
    document.getElementById('editSaleStatus').value = sale.status || 'completed';
    document.getElementById('editSaleNotes').value = sale.notes || '';

    // Show the modal
    document.getElementById('editSaleModal').classList.add('active');
  } catch (error) {
    showAlert('Failed to load sale for editing', 'error');
  }
}

// Close edit sale modal
function closeEditSaleModal() {
  document.getElementById('editSaleModal').classList.remove('active');
}

// Save edited sale
async function saveEditedSale(e) {
  e.preventDefault();

  const saleId = document.getElementById('editSaleId').value;
  
  // Prevent duplicate operations
  if (processingSales.has(saleId)) {
    return;
  }
  
  // Mark as processing
  processingSales.add(saleId);
  
  const data = {
    customer_name: document.getElementById('editCustomerName').value,
    payment_method: document.getElementById('editPaymentMethod').value,
    status: document.getElementById('editSaleStatus').value,
    notes: document.getElementById('editSaleNotes').value
  };

  try {
    await salesAPI.update(saleId, data);
    showAlert('Sale updated successfully! ✅', 'success');
    closeEditSaleModal();
    loadData(); // Reload all data
  } catch (error) {
    showAlert(error.message || 'Failed to update sale', 'error');
  } finally {
    // Remove from processing set after a delay
    setTimeout(() => {
      processingSales.delete(saleId);
    }, 1000);
  }
}

// Accept pending sale - changes status to completed
async function acceptSale(saleId) {
  // Prevent duplicate operations
  if (processingSales.has(saleId)) {
    return;
  }

  const sale = sales.find(s => s.id === saleId);
  const orderNumber = sale ? (sale.receipt_number || `ORD-${sale.id}`) : `ORD-${saleId}`;

  // Use custom alert dialog with new design
  alertDialog.confirmAccept(orderNumber, async function () {
    // Prevent duplicate operations
    if (processingSales.has(saleId)) {
      return;
    }
    
    // Mark as processing
    processingSales.add(saleId);
    
    // User confirmed
    try {
      await salesAPI.update(saleId, { status: 'completed' });
      showAlert('Sale accepted and marked as completed! ✅', 'success');
      loadData();
    } catch (error) {
      showAlert(error.message || 'Failed to accept sale', 'error');
    } finally {
      // Remove from processing set after a delay
      setTimeout(() => {
        processingSales.delete(saleId);
      }, 1000);
    }
  });
}

// Cancel pending sale - changes status to cancelled
async function cancelSale(saleId) {
  // Prevent duplicate operations
  if (processingSales.has(saleId)) {
    return;
  }

  const sale = sales.find(s => s.id === saleId);
  const orderNumber = sale ? (sale.receipt_number || `ORD-${sale.id}`) : `ORD-${saleId}`;

  // Use custom warning dialog with new design
  alertDialog.confirmCancel(orderNumber, async function () {
    // Prevent duplicate operations
    if (processingSales.has(saleId)) {
      return;
    }
    
    // Mark as processing
    processingSales.add(saleId);
    
    // User confirmed cancellation
    try {
      await salesAPI.update(saleId, { status: 'cancelled' });
      showAlert('Sale has been cancelled! ❌', 'success');
      addNotification('Sale Cancelled', `Order ${orderNumber} has been cancelled.`, 'error');
      loadData();
    } catch (error) {
      showAlert(error.message || 'Failed to cancel sale', 'error');
    } finally {
      // Remove from processing set after a delay
      setTimeout(() => {
        processingSales.delete(saleId);
      }, 1000);
    }
  });
}

// Delete sale - shows custom confirmation modal
// Variable to track sale being deleted
let pendingDeleteSaleId = null;

async function deleteSale(saleId) {
  // Prevent duplicate operations
  if (processingSales.has(saleId)) {
    return;
  }

  const sale = sales.find(s => s.id === saleId);
  const orderNumber = sale ? (sale.receipt_number || `ORD-${sale.id}`) : `ORD-${saleId}`;

  // Store the sale ID for confirmation
  pendingDeleteSaleId = saleId;

  // Update modal content
  document.getElementById('deleteSaleOrderNumber').textContent = orderNumber;

  // Set message based on status
  const warningEl = document.getElementById('deleteSaleWarning');
  const warningTextEl = document.getElementById('deleteSaleWarningText');

  if (sale && sale.status === 'pending') {
    document.getElementById('deleteSaleMessage').textContent = 'This action cannot be undone.';
    warningEl.style.display = 'flex';
    warningTextEl.textContent = 'This will restore the stock quantities for all items in this sale.';
  } else {
    document.getElementById('deleteSaleMessage').textContent = 'This will permanently remove the record from the database.';
    warningEl.style.display = 'none';
  }

  // Show the modal
  document.getElementById('deleteSaleModal').classList.add('active');
}

// Close delete confirmation modal
function closeDeleteSaleModal() {
  document.getElementById('deleteSaleModal').classList.remove('active');
  pendingDeleteSaleId = null;
}

// Confirm and execute delete
async function confirmDeleteSale() {
  if (!pendingDeleteSaleId) return;

  const saleId = pendingDeleteSaleId;
  
  // Prevent duplicate operations
  if (processingSales.has(saleId)) {
    return;
  }
  
  // Mark as processing
  processingSales.add(saleId);
  
  // Get the order number before closing modal
  const orderNumber = document.getElementById('deleteSaleOrderNumber').textContent;
  closeDeleteSaleModal();

  try {
    await salesAPI.delete(saleId);
    showAlert('Sale deleted successfully! 🗑️', 'success');

    // Add notification to the notification panel
    if (window.addNotification) {
      window.addNotification('Sale Deleted', `Order ${orderNumber} has been deleted successfully.`, 'error');
    }

    loadData(); // Reload all data
  } catch (error) {
    showAlert(error.message || 'Failed to delete sale', 'error');
  } finally {
    // Remove from processing set after a delay
    setTimeout(() => {
      processingSales.delete(saleId);
    }, 1000);
  }
}

// Make functions globally accessible
window.closeDeleteSaleModal = closeDeleteSaleModal;
window.confirmDeleteSale = confirmDeleteSale;

// Setup event listeners
function setupEventListeners() {
  // Sale form submission
  const form = document.getElementById('newSaleForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (saleItems.length === 0) {
        showAlert('Please add at least one item', 'error');
        return;
      }

      // Calculate totals
      const subtotal = saleItems.reduce((sum, item) => sum + item.total_price, 0);
      const discountValue = parseFloat(document.getElementById('saleDiscountValue').value) || 0;
      const discountType = document.getElementById('saleDiscountType').value;

      let discountAmount = 0;
      if (discountType === 'percent') {
        discountAmount = (subtotal * discountValue) / 100;
      } else {
        discountAmount = discountValue;
      }

      const afterDiscount = Math.max(0, subtotal - discountAmount);
      const taxRate = parseFloat(document.getElementById('saleTaxRate').value) || 0;
      const taxAmount = (afterDiscount * taxRate) / 100;
      const total = afterDiscount + taxAmount;

      const data = {
        customer_name: document.getElementById('saleCustomerName').value || 'Walk-in Customer',
        customer_email: document.getElementById('saleCustomerEmail').value,
        customer_phone: document.getElementById('saleCustomerPhone').value,
        customer_address: document.getElementById('saleCustomerAddress').value,
        items: saleItems.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        })),
        subtotal: subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: total,
        payment_method: document.getElementById('salePaymentMethod').value,
        status: document.getElementById('saleStatus').value,
        notes: document.getElementById('saleNotes').value,
        date: new Date().toISOString()
      };

      try {
        const result = await salesAPI.create(data);
        showAlert('Sale created successfully! 🎉', 'success');
        closeNewSaleModal();
        loadData(); // Reload all data to update dashboard

        // Show receipt modal instead of confirm
        if (result && result.id) {
          showViewReceiptModal(result.id, result.receipt_number || `ORD-${result.id}`);
        }
      } catch (error) {
        showAlert(error.message || 'Failed to create sale', 'error');
      }
    });
  }

  // Variable to track receipt being viewed
  let pendingReceiptSaleId = null;

  // Show view receipt modal
  function showViewReceiptModal(saleId, orderNumber) {
    pendingReceiptSaleId = saleId;
    document.getElementById('receiptOrderNumber').textContent = `Order #${orderNumber}`;
    document.getElementById('viewReceiptModal').classList.add('active');
  }

  // Close view receipt modal
  function closeViewReceiptModal() {
    document.getElementById('viewReceiptModal').classList.remove('active');
    pendingReceiptSaleId = null;
  }

  // Confirm and view receipt
  function confirmViewReceipt() {
    if (!pendingReceiptSaleId) return;

    const saleId = pendingReceiptSaleId;
    closeViewReceiptModal();
    viewReceipt(saleId);
  }

  // Make functions globally accessible
  window.closeViewReceiptModal = closeViewReceiptModal;
  window.confirmViewReceipt = confirmViewReceipt;

  // Auto-fill price when item selected
  const itemSelect = document.getElementById('saleItemSelect');
  if (itemSelect) {
    itemSelect.addEventListener('change', (e) => {
      const option = e.target.options[e.target.selectedIndex];
      const price = option.getAttribute('data-price');
      if (price) {
        document.getElementById('salePrice').value = price;
      }
    });
  }

  // Edit form submission
  const editForm = document.getElementById('editSaleForm');
  if (editForm) {
    editForm.addEventListener('submit', saveEditedSale);
  }

  // Close modal on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
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

// Show sale items modal
async function showSaleItemsModal(saleId) {
  const modal = document.getElementById('saleItemsModal');
  const tbody = document.getElementById('saleItemsModalBody');

  // Show loading
  tbody.innerHTML = '<tr><td colspan="4" class="table-message table-loading">Loading items...</td></tr>';
  modal.classList.add('active');

  try {
    // Fetch sale details with items
    const sale = await salesAPI.getById(saleId);

    // Update header info
    document.getElementById('itemsModalOrderNumber').textContent = sale.receipt_number || `ORD-${sale.id}`;
    document.getElementById('itemsModalCustomer').textContent = sale.customer_name || 'Walk-in Customer';
    document.getElementById('itemsModalTotal').textContent = formatCurrency(sale.total_amount || 0);

    // Render items
    if (sale.items && sale.items.length > 0) {
      tbody.innerHTML = sale.items.map(item => `
        <tr>
          <td class="modal-item-name">${item.item_name || item.name || 'Unknown Item'}</td>
          <td class="modal-item-qty">${item.quantity}</td>
          <td class="modal-item-price">${formatCurrency(item.unit_price || 0)}</td>
          <td class="modal-item-total">${formatCurrency((item.quantity * (item.unit_price || 0)))}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="table-message table-empty">No items found</td></tr>';
    }
  } catch (error) {
    console.error('Error loading sale items:', error);
    tbody.innerHTML = '<tr><td colspan="4" class="table-message table-error">Failed to load items</td></tr>';
  }
}

// Close sale items modal
function closeSaleItemsModal() {
  document.getElementById('saleItemsModal').classList.remove('active');
}

// Make functions globally accessible
window.showSaleItemsModal = showSaleItemsModal;
window.closeSaleItemsModal = closeSaleItemsModal;
