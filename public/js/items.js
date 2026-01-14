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

// Manufacturers list (stored locally, can be expanded to backend)
let manufacturers = [];
let editingManufacturerIndex = -1;
let selectedManufacturer = '';

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
function saveNewManufacturer() {
  const nameInput = document.getElementById('newManufacturerName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter a manufacturer name', 'error');
    return;
  }

  if (editingManufacturerIndex >= 0) {
    // Editing existing
    manufacturers[editingManufacturerIndex] = name;
    showToast(`Manufacturer "${name}" updated`, 'success');
  } else {
    // Adding new
    if (manufacturers.includes(name)) {
      showToast('Manufacturer already exists', 'error');
      return;
    }
    manufacturers.push(name);
    showToast(`Manufacturer "${name}" added`, 'success');
  }

  updateManufacturerDropdown();
  document.getElementById('itemManufacturer').value = name;
  renderManufacturersList();
  cancelNewManufacturer();
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
function deleteManufacturer(index) {
  const name = manufacturers[index];
  if (confirm(`Delete manufacturer "${name}"?`)) {
    manufacturers.splice(index, 1);
    updateManufacturerDropdown();
    renderManufacturersList();
    showToast(`Manufacturer "${name}" deleted`, 'success');
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

// Brands list (stored locally, can be expanded to backend)
let brands = [];
let editingBrandIndex = -1;

// Handle Brand dropdown change
function handleBrandChange(select) {
  if (select.value === '__manage__') {
    select.value = ''; // Reset selection
    openManageBrandsModal();
  }
}

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
function saveNewBrand() {
  const nameInput = document.getElementById('newBrandName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter a brand name', 'error');
    return;
  }

  if (editingBrandIndex >= 0) {
    // Editing existing
    brands[editingBrandIndex] = name;
    showToast(`Brand "${name}" updated`, 'success');
  } else {
    // Adding new
    if (brands.includes(name)) {
      showToast('Brand already exists', 'error');
      return;
    }
    brands.push(name);
    showToast(`Brand "${name}" added`, 'success');
  }

  updateBrandDropdown();
  document.getElementById('itemBrand').value = name;
  renderBrandsList();
  cancelNewBrand();
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
function deleteBrand(index) {
  const name = brands[index];
  if (confirm(`Delete brand "${name}"?`)) {
    brands.splice(index, 1);
    updateBrandDropdown();
    renderBrandsList();
    showToast(`Brand "${name}" deleted`, 'success');
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

    itemCheckboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
    });
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
  { id: 'description', label: 'Description', visible: false, locked: false },
  { id: 'dimensions', label: 'Dimensions', visible: false, locked: false },
  { id: 'ean', label: 'EAN', visible: false, locked: false },
  { id: 'isbn', label: 'ISBN', visible: false, locked: false },
  { id: 'manufacturer', label: 'Manufacturer', visible: false, locked: false },
  { id: 'purchase_account', label: 'Purchase Account Name', visible: false, locked: false },
  { id: 'purchase_description', label: 'Purchase Description', visible: false, locked: false },
  { id: 'purchase_rate', label: 'Purchase Rate', visible: false, locked: false },
  { id: 'rate', label: 'Rate', visible: false, locked: false },
  { id: 'type', label: 'Type', visible: false, locked: false },
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
            onclick="event.stopPropagation();"
            onchange="toggleColumnVisibility('${col.id}')">`
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
      <th class="zoho-th-search">🔍</th>
    </tr>
  `;

  thead.innerHTML = headerHTML;
}

// Get the value for a column from an item
function getColumnValue(item, columnId) {
  switch (columnId) {
    case 'name':
      return `
        <div class="zoho-item-row">
          <div class="zoho-item-thumb">🖼️</div>
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
      return item.account_name || '';
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

  // Filter by search term (Name, Description, SKU)
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(item =>
      (item.name && item.name.toLowerCase().includes(searchTerm)) ||
      (item.description && item.description.toLowerCase().includes(searchTerm)) ||
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
    return;
  }

  tbody.innerHTML = filteredItems.map(item => {
    const stock = parseInt(item.stock_quantity) || 0;
    const isSelected = selectedItemId === item.id ? 'selected' : '';

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
      <tr class="${isSelected}" onclick="selectItem(${item.id})">
        <td class="zoho-td-filter"></td>
        <td class="zoho-td-checkbox" onclick="event.stopPropagation();">
          <input type="checkbox" class="item-checkbox" data-item-id="${item.id}">
        </td>
        ${columnCells}
        <td class="zoho-td-search"></td>
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
