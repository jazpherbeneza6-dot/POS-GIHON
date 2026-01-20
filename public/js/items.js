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
  // Update the selected state
  document.querySelectorAll('.sort-option').forEach(opt => opt.classList.remove('selected'));
  event.target.closest('.sort-option').classList.add('selected');

  // Sort the items
  filters.sort = field;
  loadItems();
  closeMoreDropdown();
  showToast(`Sorted by ${field.replace('_', ' ')}`, 'success');
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
  showToast('Import Items feature coming soon', 'info');
}

function importItemImages() {
  showToast('Import Items Images feature coming soon', 'info');
}

function openExportModal() {
  showToast('Export feature coming soon', 'info');
}

function exportItems() {
  showToast('Export Items feature coming soon', 'info');
}

function exportCurrentView() {
  showToast('Export Current View feature coming soon', 'info');
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

  const newValue = document.getElementById('bulkUpdateValue').value.trim();
  if (!newValue) {
    showToast('Please enter a value', 'error');
    return;
  }

  try {
    let successCount = 0;
    let errorCount = 0;

    // Prepare the update data based on field type
    let updateData = {};

    // Handle numeric fields
    if (['selling_price', 'purchase_cost', 'reorder_point'].includes(selectedBulkField)) {
      const numValue = parseFloat(newValue);
      if (isNaN(numValue)) {
        showToast('Please enter a valid number', 'error');
        return;
      }
      updateData[selectedBulkField === 'selling_price' ? 'price' : selectedBulkField === 'purchase_cost' ? 'cost' : selectedBulkField] = numValue;
    } else if (selectedBulkField === 'returnable') {
      // Handle boolean
      updateData.is_returnable = newValue.toLowerCase() === 'true' || newValue.toLowerCase() === 'yes' || newValue === '1';
    } else {
      // String fields
      updateData[selectedBulkField] = newValue;
    }

    // Update each selected item
    for (const itemId of selectedItems) {
      try {
        // Get the current item data first
        const item = items.find(i => i.id === itemId);
        if (!item) continue;

        // Merge with required fields for the update API
        const fullUpdateData = {
          name: item.name,
          quantity: item.stock_quantity || 0,
          price: item.selling_price || 0,
          ...updateData
        };

        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullUpdateData)
        });

        if (response.ok) {
          successCount++;
        } else {
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

  // Show the overlay
  document.getElementById('itemDetailOverlay').classList.add('active');
}

function closeItemDetailView() {
  document.getElementById('itemDetailOverlay').classList.remove('active');
  currentDetailItemId = null;
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
      <tr class="${isSelected} ${selectedItems.includes(item.id) ? 'selected' : ''}" onclick="selectItem(${item.id})">
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

// Save item (called from Save button)
async function saveItem(event) {
  if (event) event.preventDefault();

  const itemId = document.getElementById('itemId').value;
  const nameInput = document.getElementById('itemName').value.trim();
  const skuInput = document.getElementById('itemSku').value.trim();
  const unitInput = document.getElementById('itemUnit').value || 'pcs';
  const quantityInput = document.getElementById('itemQuantity')?.value || '0';
  const reorderPointInput = document.getElementById('itemReorderPoint')?.value || '10';
  const priceInput = document.getElementById('itemPrice')?.value || '0';
  const costInput = document.getElementById('itemCost')?.value || '0';
  const wholesaleInput = document.getElementById('itemWholesale')?.checked || false;
  const imageUrl = document.getElementById('itemImageUrl')?.value || null;
  const manufacturerInput = document.getElementById('itemManufacturer')?.value || null;
  const brandInput = document.getElementById('itemBrand')?.value || null;

  // Validate inputs
  if (!nameInput) {
    showToast('Item name is required', 'error');
    return;
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
    brand: brandInput
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
    await loadItems();
    renderItemsTable();
  } catch (error) {
    console.error('Error saving item:', error);
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
