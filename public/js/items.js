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
let currentView = 'cards'; // 'cards' or 'table'

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

  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    if (typeof showToast === 'function') {
      showToast('Image size must be less than 10MB', 'error');
    } else {
      alert('Image size must be less than 10MB');
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;
    const imageUrlInput = document.getElementById('itemImageUrl');
    const previewImg = document.getElementById('previewImg');
    const imagePreview = document.getElementById('imagePreview');
    const imagePlaceholder = document.getElementById('imagePlaceholder');
    const imageUploadBox = document.getElementById('imageUploadBox');

    if (imageUrlInput) imageUrlInput.value = base64;
    if (previewImg) previewImg.src = base64;
    if (imagePreview) imagePreview.style.display = 'block';
    if (imagePlaceholder) imagePlaceholder.style.display = 'none';
    if (imageUploadBox) {
      imageUploadBox.style.border = '2px solid #d84040';
      imageUploadBox.classList.add('has-image');
    }
  };
  reader.readAsDataURL(file);
}

// Reset image upload section
function resetImageUpload() {
  const imageUrlInput = document.getElementById('itemImageUrl');
  const imageFileInput = document.getElementById('imageFileInput');
  const previewImg = document.getElementById('previewImg');
  const imagePreview = document.getElementById('imagePreview');
  const imagePlaceholder = document.getElementById('imagePlaceholder');
  const imageUploadBox = document.getElementById('imageUploadBox');

  if (imageUrlInput) imageUrlInput.value = '';
  if (imageFileInput) imageFileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (imagePreview) imagePreview.style.display = 'none';
  if (imagePlaceholder) imagePlaceholder.style.display = 'block';
  if (imageUploadBox) {
    imageUploadBox.style.border = '2px dashed rgba(29, 22, 22, 0.2)';
    imageUploadBox.classList.remove('has-image');
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
  // Prevent infinite recursion
  if (isShowingToast) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  isShowingToast = true;

  try {
    // Use global showToast if available
    if (typeof window.showToast === 'function') {
      const globalToast = window.showToast;
      // Only call if it's not this function (check by comparing function bodies or using a marker)
      if (globalToast !== showToast) {
        globalToast(message, type);
        isShowingToast = false;
        return;
      }
    }

    // Fallback: use console
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (type === 'error') {
      console.error(message);
    }
  } finally {
    isShowingToast = false;
  }
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

  // Apply filters
  let filteredItems = [...items];

  // Filter by category
  if (filters.category) {
    filteredItems = filteredItems.filter(item =>
      item.group_id && item.group_id.toString() === filters.category
    );
  }

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
      case 'name':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'stock':
        return (a.stock_quantity || 0) - (b.stock_quantity || 0);
      case 'stock-desc':
        return (b.stock_quantity || 0) - (a.stock_quantity || 0);
      case 'price':
        return (a.selling_price || 0) - (b.selling_price || 0);
      case 'price-desc':
        return (b.selling_price || 0) - (a.selling_price || 0);
      default:
        return 0;
    }
  });

  if (filteredItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">No items found</div>
          <div class="empty-state-text">Try adjusting your filters or add a new item</div>
          <button class="btn btn-primary" onclick="openItemModal()" style="margin-top: 16px;">Add First Item</button>
        </td>
      </tr>
    `;
    return;
  }

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

    // Show action buttons for low stock items or all items
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
        <td data-label="Cost">${Math.floor(item.purchase_cost || 0).toLocaleString()}</td>
        <td data-label="Status">${stockBadge}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

// Select item and show detail panel
async function selectItem(itemId) {
  selectedItemId = itemId;
  renderItemsTable();

  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const panel = document.getElementById('itemDetailPanel');
  const container = document.getElementById('itemsContainer');

  // Show detail panel
  panel.style.display = 'flex';
  container.classList.add('has-detail');
  panel.classList.add('active');

  // Load item details
  await renderItemDetail(item);
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
  const title = document.getElementById('modalTitle');

  if (itemId) {
    title.textContent = 'Edit Item';
    const item = items.find(i => i.id === itemId);
    if (item) {
      document.getElementById('itemId').value = item.id;
      document.getElementById('itemName').value = item.name || '';
      // Auto-generate a fresh SKU when editing
      document.getElementById('itemSku').value = generateSku();
      document.getElementById('itemUnit').value = item.unit || 'pcs';
      document.getElementById('itemQuantity').value = Math.floor(item.stock_quantity || 0);
      document.getElementById('itemReorderPoint').value = Math.floor(item.reorder_point || 20);
      document.getElementById('itemPrice').value = Math.floor(item.selling_price || 0);
      document.getElementById('itemCost').value = Math.floor(item.purchase_cost || 0);
      document.getElementById('itemWholesale').checked = item.can_be_wholesale || false;
      // Load image if exists
      setImagePreview(item.image_url);
    }
  } else {
    title.textContent = 'Add Item';
    form.reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    // Auto-generate unique SKU: SKU-YYYYMMDD-XXXX
    const now = new Date();
    const datePart = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const randomPart = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    document.getElementById('itemSku').value = `SKU-${datePart}-${randomPart}`;
    document.getElementById('itemUnit').value = 'pcs';
    document.getElementById('itemQuantity').value = '';
    document.getElementById('itemReorderPoint').value = '10';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemCost').value = '';
    document.getElementById('itemWholesale').checked = false;
    // Reset image
    resetImageUpload();
  }

  modal.classList.add('active');
}

// Close item modal
function closeItemModal() {
  const modal = document.getElementById('itemModal');
  modal.classList.remove('active');
  document.getElementById('itemForm').reset();
  resetImageUpload();
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
