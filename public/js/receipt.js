// Receipt generation and printing

let receiptData = null;

// Utility functions (fallback if utils.js not loaded)
function formatCurrency(amount) {
  // Check if utils.js formatCurrency exists and is different from this function
  if (typeof window.formatCurrency === 'function' && window.formatCurrency !== formatCurrency) {
    return window.formatCurrency(amount);
  }
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount || 0);
}

function formatDate(dateString) {
  // Check if utils.js formatDate exists and is different from this function
  // Also check for a utils.js specific function to avoid recursion
  if (typeof window.formatDate === 'function' && window.formatDate !== formatDate) {
    return window.formatDate(dateString);
  }
  if (!dateString) return 'N/A';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString || 'N/A';
  }
}

// Load receipt data
async function loadReceipt() {
  const urlParams = new URLSearchParams(window.location.search);
  const saleId = urlParams.get('id');
  
  if (!saleId) {
    const receiptItems = document.getElementById('receiptItems');
    if (receiptItems) {
      receiptItems.innerHTML = '<div class="empty-state-text">Receipt ID not provided</div>';
    }
    return;
  }

  try {
    // Try to get receipt data from the receipt endpoint first
    let data;
    try {
      data = await salesAPI.getReceipt(saleId);
    } catch (receiptError) {
      // If receipt endpoint fails, try the regular getById endpoint
      console.warn('Receipt endpoint failed, trying getById:', receiptError);
      const saleData = await salesAPI.getById(saleId);
      // Transform the data to match expected format
      data = {
        sale: saleData,
        items: saleData.items || []
      };
    }
    
    // Validate data structure
    if (!data) {
      throw new Error('No data received from server');
    }
    
    // Handle different response formats
    let receiptDataToRender;
    if (data.sale && Array.isArray(data.items)) {
      // Standard format: { sale: {...}, items: [...] }
      receiptDataToRender = data;
    } else if (data.items && Array.isArray(data.items)) {
      // If sale data is at root level with items
      receiptDataToRender = { sale: data, items: data.items };
    } else if (Array.isArray(data)) {
      // If response is just an array (shouldn't happen but handle it)
      throw new Error('Unexpected data format: received array instead of object');
    } else {
      // If items are nested differently or missing
      const sale = data;
      const items = data.items || [];
      receiptDataToRender = { sale, items };
    }
    
    // Validate sale data exists
    const sale = receiptDataToRender.sale || receiptDataToRender;
    if (!sale || !sale.id) {
      throw new Error('Invalid sale data: missing sale information');
    }
    
    receiptData = receiptDataToRender;
    renderReceipt(receiptDataToRender);
  } catch (error) {
    console.error('Error loading receipt:', error);
    const receiptItems = document.getElementById('receiptItems');
    if (receiptItems) {
      receiptItems.innerHTML = `<div class="empty-state-text" style="color: #d84040; padding: 20px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
        <div>Failed to load receipt</div>
        <div style="font-size: 12px; color: #999; margin-top: 8px;">${error.message || 'Please check the sale ID and try again'}</div>
      </div>`;
    }
  }
}

// Render receipt
function renderReceipt(data) {
  // Handle different data structures
  const sale = data.sale || data;
  const items = data.items || [];
  
  // Validate required data
  if (!sale) {
    throw new Error('Sale data is missing');
  }
  
  const subtotal = Number(sale.subtotal) || 0;
  const discount = Number(sale.discount_amount) || 0;
  const tax = Number(sale.tax_amount) || 0;
  const total = Number(sale.total_amount) || (subtotal - discount + tax);

  // Receipt header
  const receiptNumber = sale.receipt_number || sale.order_number || `ORD-${sale.id}` || 'N/A';
  const receiptDateEl = document.getElementById('receiptDate');
  const receiptNumberEl = document.getElementById('receiptNumber');
  
  if (receiptNumberEl) {
    receiptNumberEl.textContent = `Receipt #: ${receiptNumber}`;
  }
  
  if (receiptDateEl) {
    receiptDateEl.textContent = `Date: ${formatDate(sale.date || sale.created_at || sale.date_created)}`;
  }

  // Receipt items
  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `
      <table style="width: 100%; margin-bottom: 16px;">
        <thead>
          <tr style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
            <th style="text-align: left; padding: 8px 0;">Item</th>
            <th style="text-align: center; padding: 8px 0;">Qty</th>
            <th style="text-align: right; padding: 8px 0;">Price</th>
            <th style="text-align: right; padding: 8px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const itemName = item.item_name || item.name || 'Unknown Item';
            const quantity = item.quantity || 0;
            const unitPrice = item.unit_price || item.price || 0;
            const totalPrice = item.total_price || (quantity * unitPrice);
            return `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 8px 0;">${itemName}</td>
                <td style="text-align: center; padding: 8px 0;">${quantity}</td>
                <td style="text-align: right; padding: 8px 0;">${formatCurrency(unitPrice)}</td>
                <td style="text-align: right; padding: 8px 0;">${formatCurrency(totalPrice)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    itemsHtml = '<div class="empty-state-text" style="padding: 20px; text-align: center; color: #999;">No items found in this receipt</div>';
  }
  
  const receiptItemsEl = document.getElementById('receiptItems');
  if (receiptItemsEl) {
    receiptItemsEl.innerHTML = itemsHtml;
  }

  // Totals
  document.getElementById('receiptSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('receiptDiscount').textContent = formatCurrency(discount);
  document.getElementById('receiptTax').textContent = formatCurrency(tax);
  document.getElementById('receiptTotal').textContent = formatCurrency(total);

  // Customer and payment info
  if (sale.customer_name) {
    document.getElementById('receiptCustomer').textContent = `Customer: ${sale.customer_name}`;
  }
  if (sale.payment_method) {
    document.getElementById('receiptPayment').textContent = `Payment: ${sale.payment_method}`;
  }
}

// Print receipt
function printReceipt() {
  window.print();
}

// Download PDF
function downloadPDF() {
  if (!receiptData) {
    const alertFn = window.showAlert || window.showToast || alert;
    alertFn('Receipt data not loaded', 'error');
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    const alertFn = window.showAlert || window.showToast || alert;
    alertFn('PDF library not loaded', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const sale = receiptData.sale || receiptData;
  const items = receiptData.items || [];
  const subtotal = Number(sale.subtotal) || 0;
  const discount = Number(sale.discount_amount) || 0;
  const tax = Number(sale.tax_amount) || 0;
  const total = Number(sale.total_amount) || (subtotal - discount + tax);

  // Header
  doc.setFontSize(18);
  doc.text('INVENTORY MANAGEMENT', 105, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Receipt', 105, 30, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Receipt #: ${sale.receipt_number}`, 105, 38, { align: 'center' });
  doc.text(`Date: ${formatDate(sale.date)}`, 105, 44, { align: 'center' });

  // Items
  let y = 60;
  doc.setFontSize(10);
  doc.text('Item', 20, y);
  doc.text('Qty', 100, y);
  doc.text('Price', 130, y);
  doc.text('Total', 170, y);
  y += 5;
  doc.line(20, y, 190, y);
  y += 8;

  items.forEach(item => {
    const itemName = item.item_name || item.name || 'Unknown Item';
    const quantity = item.quantity || 0;
    const unitPrice = item.unit_price || item.price || 0;
    const totalPrice = item.total_price || (quantity * unitPrice);
    doc.text(itemName.substring(0, 30), 20, y);
    doc.text(quantity.toString(), 100, y);
    doc.text(formatCurrency(unitPrice), 130, y);
    doc.text(formatCurrency(totalPrice), 170, y);
    y += 8;
  });

  // Total
  y += 5;
  doc.line(20, y, 190, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Subtotal:', 130, y);
  doc.text(formatCurrency(subtotal), 170, y);
  y += 6;
  doc.text('Discount:', 130, y);
  doc.text(formatCurrency(discount), 170, y);
  y += 6;
  doc.text('Tax:', 130, y);
  doc.text(formatCurrency(tax), 170, y);
  y += 8;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Total:', 130, y);
  doc.text(formatCurrency(total), 170, y);

  // Footer
  y += 15;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  if (sale.customer_name) {
    doc.text(`Customer: ${sale.customer_name}`, 20, y);
    y += 6;
  }
  if (sale.payment_method) {
    doc.text(`Payment: ${sale.payment_method}`, 20, y);
    y += 6;
  }
  y += 5;
  doc.text('Thank you for your business!', 105, y, { align: 'center' });

  // Save
  doc.save(`receipt-${sale.receipt_number}.pdf`);
}

// Load receipt on page load
document.addEventListener('DOMContentLoaded', loadReceipt);

