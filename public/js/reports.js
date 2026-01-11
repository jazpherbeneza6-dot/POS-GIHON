// Reports & Analytics Module

let sales = [];
let purchases = [];
let items = [];
let transactions = [];
let currentReport = null;
let currentChart = null;
let currentChart2 = null;
let filteredData = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    setDefaultDates();
});

// Show alert notification
function showAlert(message, type = 'info') {
    // Create alert container if it doesn't exist
    let container = document.getElementById('alertContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'alertContainer';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }

    const alert = document.createElement('div');
    const bgColor = type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4c6ef5';
    alert.style.cssText = `padding: 14px 20px; border-radius: 10px; color: white; background: ${bgColor}; 
                           font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.2); animation: slideIn 0.3s ease;`;
    alert.textContent = message;
    container.appendChild(alert);

    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// Set default dates (last 30 days)
function setDefaultDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));

    const toDateEl = document.getElementById('filterToDate');
    const fromDateEl = document.getElementById('filterFromDate');

    if (toDateEl) {
        toDateEl.value = today.toISOString().split('T')[0];
        toDateEl.removeAttribute('disabled');
        toDateEl.removeAttribute('readonly');
    }
    if (fromDateEl) {
        fromDateEl.value = thirtyDaysAgo.toISOString().split('T')[0];
        fromDateEl.removeAttribute('disabled');
        fromDateEl.removeAttribute('readonly');
    }
}

// Load all data
async function loadAllData() {
    try {
        await Promise.all([
            loadSales(),
            loadPurchases(),
            loadItems(),
            loadTransactions()
        ]);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Load sales
async function loadSales() {
    try {
        sales = await salesAPI.getAll({ limit: 1000 });
        console.log('Loaded sales:', sales.length, 'records', sales);
    } catch (error) {
        console.error('Error loading sales:', error);
        sales = [];
    }
}

// Load purchases
async function loadPurchases() {
    try {
        purchases = await purchasesAPI.getAll({ limit: 1000 });
    } catch (error) {
        console.error('Error loading purchases:', error);
    }
}

// Load items
async function loadItems() {
    try {
        items = await itemsAPI.getAll();
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

// Load transactions
async function loadTransactions() {
    try {
        transactions = await inventoryAPI.getTransactions({ limit: 1000 });
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Load specific report
async function loadReport(reportType) {
    currentReport = reportType;

    // Hide selection, show detail view first (so elements exist)
    document.getElementById('reportSelectionView').style.display = 'none';
    document.getElementById('reportDetailView').style.display = 'block';

    // Set default dates (elements are now visible)
    setDefaultDates();

    // Clear any previously appended sections first
    clearAppendedSections();

    // Show loading state
    document.getElementById('summaryCards').innerHTML = '<div style="text-align: center; padding: 20px;">Loading data...</div>';
    document.getElementById('tableContainer').innerHTML = '';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('chartContainer2').style.display = 'none';

    try {
        // Load fresh data from API
        console.log('Loading data for report:', reportType);

        if (reportType === 'sales') {
            sales = await salesAPI.getAll({ limit: 1000 });
            console.log('Sales loaded:', sales.length, sales);
        } else if (reportType === 'purchases') {
            purchases = await purchasesAPI.getAll({ limit: 1000 });
        } else if (reportType === 'inventory') {
            items = await itemsAPI.getAll();
        } else if (reportType === 'movements') {
            transactions = await inventoryAPI.getTransactions({ limit: 1000 });
        }

        // Generate report based on type
        switch (reportType) {
            case 'sales':
                generateSalesReport();
                break;
            case 'purchases':
                generatePurchasesReport();
                break;
            case 'inventory':
                generateInventoryReport();
                break;
            case 'movements':
                generateMovementsReport();
                break;
        }
    } catch (error) {
        console.error('Error loading report:', error);
        document.getElementById('summaryCards').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ff6b6b;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 18px; font-weight: 600;">Error Loading Data</div>
                <div style="font-size: 14px; color: #868e96; margin-top: 8px;">${error.message}</div>
            </div>
        `;
    }
}

// Back to reports selection
function backToReports() {
    document.getElementById('reportSelectionView').style.display = 'block';
    document.getElementById('reportDetailView').style.display = 'none';

    // Destroy charts if exists
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    if (currentChart2) {
        currentChart2.destroy();
        currentChart2 = null;
    }

    // Clear any appended sections to prevent duplication
    clearAppendedSections();
}

// Clear appended sections (Top Customers, Top Selling Items)
function clearAppendedSections() {
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) {
        // Remove all siblings after tableContainer that are report sections
        let nextSibling = tableContainer.nextElementSibling;
        while (nextSibling) {
            const temp = nextSibling.nextElementSibling;
            // Check if it's a report section (has specific styling or class)
            if (nextSibling.style && (
                nextSibling.querySelector('h3')?.textContent.includes('Top Customers') ||
                nextSibling.querySelector('h3')?.textContent.includes('Top Selling Items')
            )) {
                nextSibling.remove();
            }
            nextSibling = temp;
        }
    }
}

// Apply quick filters
function applyQuickFilter() {
    const quickFilter = document.getElementById('filterQuick').value;
    const today = new Date();
    let fromDate, toDate;

    toDate = new Date(today);

    switch (quickFilter) {
        case 'today':
            fromDate = new Date(today);
            break;
        case 'yesterday':
            fromDate = new Date(today.getTime() - (24 * 60 * 60 * 1000));
            toDate = new Date(today.getTime() - (24 * 60 * 60 * 1000));
            break;
        case 'thisWeek':
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - today.getDay());
            break;
        case 'lastWeek':
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - today.getDay() - 7);
            toDate = new Date(today);
            toDate.setDate(today.getDate() - today.getDay() - 1);
            break;
        case 'thisMonth':
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'lastMonth':
            fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            toDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'thisYear':
            fromDate = new Date(today.getFullYear(), 0, 1);
            break;
        default:
            return;
    }

    document.getElementById('filterFromDate').value = fromDate.toISOString().split('T')[0];
    document.getElementById('filterToDate').value = toDate.toISOString().split('T')[0];

    applyFilters();
}

// Handle manual date changes
function handleDateChange() {
    // Set Quick Select to "custom" when user manually changes dates
    const quickSelect = document.getElementById('filterQuick');
    if (quickSelect && quickSelect.value !== 'custom') {
        quickSelect.value = 'custom';
    }
    applyFilters();
}

// Apply filters
function applyFilters() {
    if (currentReport) {
        // Regenerate the report with current filters using existing data
        // This is faster than reloading from API
        switch (currentReport) {
            case 'sales':
                generateSalesReport();
                break;
            case 'purchases':
                generatePurchasesReport();
                break;
            case 'inventory':
                generateInventoryReport();
                break;
            case 'movements':
                generateMovementsReport();
                break;
            default:
                // Fallback to reload if report type not recognized
                loadReport(currentReport);
        }
    } else {
        showAlert('Please select a report first', 'warning');
    }
}

// Get filtered date range
function getFilteredData(data, dateField = 'date') {
    const fromDateEl = document.getElementById('filterFromDate');
    const toDateEl = document.getElementById('filterToDate');

    // If no date filters, return all data
    if (!fromDateEl || !toDateEl || !fromDateEl.value || !toDateEl.value) {
        console.log('No date filter applied, returning all data');
        return data || [];
    }

    // Parse filter dates (input type="date" returns YYYY-MM-DD format)
    const fromDateStr = fromDateEl.value; // YYYY-MM-DD
    const toDateStr = toDateEl.value; // YYYY-MM-DD
    
    // Create date objects at start and end of day
    const fromDate = new Date(fromDateStr + 'T00:00:00');
    const toDate = new Date(toDateStr + 'T23:59:59.999');

    console.log('Filtering from', fromDateStr, 'to', toDateStr);
    console.log('Date range:', fromDate, 'to', toDate);

    const filtered = (data || []).filter(item => {
        // Try multiple date field names
        const itemDateStr = item[dateField] || item.created_at || item.date || item.sale_date;
        
        if (!itemDateStr) {
            console.log('Item missing date field:', item);
            return false;
        }
        
        // Parse the item date - handle both ISO strings and other formats
        let itemDate = new Date(itemDateStr);
        
        // Check if date is valid
        if (isNaN(itemDate.getTime())) {
            console.log('Invalid date for item:', item, 'date string:', itemDateStr);
            return false;
        }
        
        // Normalize to date only (ignore time for comparison)
        const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
        const fromDateOnly = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        const toDateOnly = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
        
        // Check if item date is within range
        const isInRange = itemDateOnly >= fromDateOnly && itemDateOnly <= toDateOnly;
        
        if (!isInRange) {
            console.log('Item date out of range:', {
                itemDate: itemDateOnly.toISOString().split('T')[0],
                fromDate: fromDateOnly.toISOString().split('T')[0],
                toDate: toDateOnly.toISOString().split('T')[0],
                item: item
            });
        }
        
        return isInRange;
    });

    console.log(`Filtered ${filtered.length} items from ${data.length} total items`);
    return filtered;
}

// ========== SALES REPORT ==========
async function generateSalesReport() {
    document.getElementById('reportTitle').textContent = '💰 Sales Report';

    console.log('All sales before filter:', sales.length, sales);

    // Check if we have any sales data
    if (!sales || sales.length === 0) {
        document.getElementById('summaryCards').innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #868e96;">
                <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                <div style="font-size: 18px; font-weight: 600;">No Sales Data</div>
                <div style="font-size: 14px; margin-top: 8px;">No sales have been recorded yet.</div>
            </div>
        `;
        document.getElementById('tableContainer').innerHTML = '';
        document.getElementById('chartContainer').style.display = 'none';
        return;
    }

    filteredData = getFilteredData(sales);
    console.log('Filtered sales:', filteredData.length, filteredData);

    // Calculate summaries - only count completed sales for revenue
    const totalSales = filteredData.length;
    const completedSales = filteredData.filter(s => (s.status || 'completed') === 'completed');
    const pendingSales = filteredData.filter(s => s.status === 'pending');
    const cancelledSales = filteredData.filter(s => s.status === 'cancelled');

    // Revenue only counts COMPLETED orders
    const totalRevenue = completedSales.reduce((sum, sale) =>
        sum + (parseFloat(sale.total_amount) || 0), 0);
    const avgOrderValue = completedSales.length > 0 ? totalRevenue / completedSales.length : 0;

    // Calculate subtotal, discount, and tax from completed sales
    const totalSubtotal = completedSales.reduce((sum, sale) =>
        sum + (parseFloat(sale.subtotal) || parseFloat(sale.total_amount) || 0), 0);
    const totalDiscount = completedSales.reduce((sum, sale) =>
        sum + (parseFloat(sale.discount_amount) || 0), 0);
    const totalTax = completedSales.reduce((sum, sale) =>
        sum + (parseFloat(sale.tax_amount) || 0), 0);

    // Pending amount (not counted in revenue)
    const pendingAmount = pendingSales.reduce((sum, sale) =>
        sum + (parseFloat(sale.total_amount) || 0), 0);

    // Calculate payment method breakdown
    const paymentMethods = {};
    completedSales.forEach(sale => {
        const method = sale.payment_method || 'cash';
        paymentMethods[method] = (paymentMethods[method] || 0) + (parseFloat(sale.total_amount) || 0);
    });

    // Get top customers
    const customerSales = {};
    completedSales.forEach(sale => {
        const customer = sale.customer_name || 'Walk-in Customer';
        if (!customerSales[customer]) {
            customerSales[customer] = { count: 0, revenue: 0 };
        }
        customerSales[customer].count++;
        customerSales[customer].revenue += (parseFloat(sale.total_amount) || 0);
    });
    const topCustomers = Object.entries(customerSales)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // Render enhanced summary cards
    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Orders</div>
      <div class="summary-value">${totalSales}</div>
      <div style="font-size: 11px; color: #868e96; margin-top: 4px;">
        ${completedSales.length} completed, ${pendingSales.length} pending, ${cancelledSales.length} cancelled
      </div>
    </div>
    <div class="summary-card" style="border-left-color: #51cf66;">
      <div class="summary-label">Total Revenue</div>
      <div class="summary-value">${formatCurrency(totalRevenue)}</div>
      <div style="font-size: 11px; color: #868e96; margin-top: 4px;">
        Avg: ${formatCurrency(avgOrderValue)}
      </div>
    </div>
    <div class="summary-card" style="border-left-color: #fab005;">
      <div class="summary-label">Subtotal / Discount / Tax</div>
      <div class="summary-value" style="font-size: 20px;">${formatCurrency(totalSubtotal)}</div>
      <div style="font-size: 11px; color: #868e96; margin-top: 4px;">
        Discount: ${formatCurrency(totalDiscount)} | Tax: ${formatCurrency(totalTax)}
      </div>
    </div>
    <div class="summary-card" style="border-left-color: #ff6b6b;">
      <div class="summary-label">Pending Orders</div>
      <div class="summary-value">${formatCurrency(pendingAmount)}</div>
      <div style="font-size: 11px; color: #868e96; margin-top: 4px;">
        ${pendingSales.length} pending order${pendingSales.length !== 1 ? 's' : ''}
      </div>
    </div>
  `;

    // Generate chart with multiple datasets
    generateSalesChart();

    // Generate enhanced table
    generateSalesTable();

    // Generate top customers section
    generateTopCustomersSection(topCustomers);

    // Load and display top-selling items
    loadTopSellingItems();
}

function generateSalesChart() {
    // Show both chart containers
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'block';

    // Separate completed and pending sales
    const completedSales = filteredData.filter(s => (s.status || 'completed') === 'completed');

    // Group completed sales by date for revenue
    const salesByDate = {};
    completedSales.forEach(sale => {
        const date = formatDate(sale.date || sale.created_at);
        if (!salesByDate[date]) {
            salesByDate[date] = { count: 0, revenue: 0 };
        }
        salesByDate[date].count++;
        salesByDate[date].revenue += (parseFloat(sale.total_amount) || 0);
    });

    // Group all sales by date for order count
    const ordersByDate = {};
    filteredData.forEach(sale => {
        const date = formatDate(sale.date || sale.created_at);
        if (!ordersByDate[date]) {
            ordersByDate[date] = 0;
        }
        ordersByDate[date]++;
    });

    const labels = Object.keys(salesByDate).sort();
    const revenueData = labels.map(date => salesByDate[date].revenue || 0);
    const orderCountData = labels.map(date => ordersByDate[date] || 0);

    // Destroy existing charts
    if (currentChart) {
        currentChart.destroy();
    }
    if (currentChart2) {
        currentChart2.destroy();
    }

    // Chart 1: Revenue (Wave/Smooth)
    const ctx1 = document.getElementById('reportChart').getContext('2d');
    currentChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue (Completed)',
                    data: revenueData,
                    borderColor: '#51cf66',
                    backgroundColor: 'rgba(81, 207, 102, 0.2)',
                    tension: 0.5,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#51cf66',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: '#37b24d',
                    pointHoverBorderColor: '#ffffff',
                    cubicInterpolationMode: 'monotone',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: '💰 Sales Revenue Trend',
                    font: { size: 18, weight: 'bold' },
                    padding: { top: 10, bottom: 20 }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            return `Revenue: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return '₱' + value.toLocaleString();
                        },
                        font: { size: 11 }
                    },
                    title: {
                        display: true,
                        text: 'Revenue (PHP)',
                        font: { size: 13, weight: 'bold' }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: { size: 11 }
                    }
                }
            }
        }
    });

    // Chart 2: Order Count (Wave/Smooth)
    const ctx2 = document.getElementById('reportChart2').getContext('2d');
    currentChart2 = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Order Count',
                    data: orderCountData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    tension: 0.5,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: '#5568d3',
                    pointHoverBorderColor: '#ffffff',
                    cubicInterpolationMode: 'monotone',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: '📊 Order Count Trend',
                    font: { size: 18, weight: 'bold' },
                    padding: { top: 10, bottom: 20 }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            return `Orders: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { size: 11 }
                    },
                    title: {
                        display: true,
                        text: 'Number of Orders',
                        font: { size: 13, weight: 'bold' }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function generateSalesTable() {
    // Sort by date descending (newest first)
    const sortedData = [...filteredData].sort((a, b) => {
        const dateA = new Date(a.date || a.created_at);
        const dateB = new Date(b.date || b.created_at);
        return dateB - dateA;
    });

    const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Date</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Subtotal</th>
          <th>Discount</th>
          <th>Tax</th>
          <th>Total</th>
          <th>Payment</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sortedData.map(sale => {
            const status = sale.status || 'completed';
            const statusColor = status === 'completed' ? '#51cf66' : 
                               status === 'pending' ? '#fab005' : 
                               status === 'cancelled' ? '#ff6b6b' : '#868e96';
            const subtotal = parseFloat(sale.subtotal) || parseFloat(sale.total_amount) || 0;
            const discount = parseFloat(sale.discount_amount) || 0;
            const tax = parseFloat(sale.tax_amount) || 0;
            const total = parseFloat(sale.total_amount) || 0;
            
            return `
          <tr>
            <td><strong>${sale.receipt_number || sale.order_number || `ORD-${sale.id}`}</strong></td>
            <td>${formatDate(sale.date || sale.created_at)}</td>
            <td>${sale.customer_name || 'Walk-in Customer'}</td>
            <td>${sale.items_count || sale.item_count || (sale.items ? sale.items.length : 0)}</td>
            <td>${formatCurrency(subtotal)}</td>
            <td style="color: ${discount > 0 ? '#51cf66' : '#868e96'}">${discount > 0 ? '-' : ''}${formatCurrency(discount)}</td>
            <td>${formatCurrency(tax)}</td>
            <td><strong>${formatCurrency(total)}</strong></td>
            <td style="text-transform: capitalize;">${sale.payment_method || 'Cash'}</td>
            <td><span style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${status}</span></td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;

    document.getElementById('tableContainer').innerHTML = filteredData.length > 0
        ? tableHTML
        : '<div class="empty-report"><div class="empty-report-icon">📊</div><div class="empty-report-title">No sales data</div><div class="empty-report-text">No sales found for the selected date range</div></div>';
}

// Generate top customers section
function generateTopCustomersSection(topCustomers) {
    if (topCustomers.length === 0) return;

    // Clear existing top customers section first
    const existingTopCustomers = document.getElementById('topCustomersSection');
    if (existingTopCustomers) {
        existingTopCustomers.remove();
    }

    const customersHTML = `
        <div id="topCustomersSection" style="background: white; border-radius: 16px; padding: 24px; margin-top: 24px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);">
            <h3 style="font-size: 18px; font-weight: 700; color: #1a1f3a; margin-bottom: 16px;">👥 Top Customers</h3>
            <div style="display: grid; gap: 12px;">
                ${topCustomers.map((customer, index) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #667eea;">
                        <div>
                            <div style="font-weight: 600; color: #1a1f3a;">${index + 1}. ${customer.name}</div>
                            <div style="font-size: 12px; color: #868e96; margin-top: 4px;">${customer.count} order${customer.count !== 1 ? 's' : ''}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 700; color: #51cf66; font-size: 16px;">${formatCurrency(customer.revenue)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Append to table container
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) {
        tableContainer.insertAdjacentHTML('afterend', customersHTML);
    }
}

// Load and display top-selling items
async function loadTopSellingItems() {
    try {
        const completedSales = filteredData.filter(s => (s.status || 'completed') === 'completed');
        
        // Fetch items for each completed sale
        const itemSales = {};
        
        for (const sale of completedSales) {
            try {
                const saleDetails = await salesAPI.getById(sale.id);
                if (saleDetails && saleDetails.items) {
                    saleDetails.items.forEach(item => {
                        const itemId = item.item_id;
                        const itemName = item.item_name || 'Unknown Item';
                        const quantity = parseInt(item.quantity) || 0;
                        const revenue = parseFloat(item.total_price) || (parseFloat(item.unit_price) || 0) * quantity;
                        
                        if (!itemSales[itemId]) {
                            itemSales[itemId] = {
                                name: itemName,
                                quantity: 0,
                                revenue: 0,
                                orders: 0
                            };
                        }
                        itemSales[itemId].quantity += quantity;
                        itemSales[itemId].revenue += revenue;
                        itemSales[itemId].orders += 1;
                    });
                }
            } catch (error) {
                console.error(`Error loading sale ${sale.id}:`, error);
            }
        }
        
        // Convert to array and sort by revenue
        const topItems = Object.values(itemSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
        
        if (topItems.length > 0) {
            generateTopSellingItemsSection(topItems);
        }
    } catch (error) {
        console.error('Error loading top-selling items:', error);
    }
}

// Generate top-selling items section
function generateTopSellingItemsSection(topItems) {
    // Clear existing top selling items section first
    const existingTopItems = document.getElementById('topSellingItemsSection');
    if (existingTopItems) {
        existingTopItems.remove();
    }

    const itemsHTML = `
        <div id="topSellingItemsSection" style="background: white; border-radius: 16px; padding: 24px; margin-top: 24px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);">
            <h3 style="font-size: 18px; font-weight: 700; color: #1a1f3a; margin-bottom: 16px;">🔥 Top Selling Items</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Rank</th>
                            <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Item Name</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600; color: #495057;">Quantity Sold</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600; color: #495057;">Orders</th>
                            <th style="padding: 12px; text-align: right; font-weight: 600; color: #495057;">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topItems.map((item, index) => `
                            <tr style="border-bottom: 1px solid #f0f0f0;">
                                <td style="padding: 12px; font-weight: 700; color: #667eea;">#${index + 1}</td>
                                <td style="padding: 12px; font-weight: 500; color: #1a1f3a;">${item.name}</td>
                                <td style="padding: 12px; text-align: right; color: #495057;">${item.quantity}</td>
                                <td style="padding: 12px; text-align: right; color: #495057;">${item.orders}</td>
                                <td style="padding: 12px; text-align: right; font-weight: 700; color: #51cf66;">${formatCurrency(item.revenue)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Append after top customers section or after table container
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) {
        const existingTopCustomers = document.getElementById('topCustomersSection');
        if (existingTopCustomers) {
            existingTopCustomers.insertAdjacentHTML('afterend', itemsHTML);
        } else {
            tableContainer.insertAdjacentHTML('afterend', itemsHTML);
        }
    }
}

// ========== PURCHASES REPORT ==========
function generatePurchasesReport() {
    document.getElementById('reportTitle').textContent = '📦 Purchase Report';

    filteredData = getFilteredData(purchases);

    // Calculate summaries - parse amounts properly
    const totalPurchases = filteredData.length;
    const totalSpent = filteredData.reduce((sum, purchase) =>
        sum + (parseFloat(purchase.total_amount) || 0), 0);
    const avgPurchaseValue = totalPurchases > 0 ? totalSpent / totalPurchases : 0;
    const receivedPurchases = filteredData.filter(p => p.status === 'received').length;

    // Render summary cards
    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Purchases</div>
      <div class="summary-value">${totalPurchases}</div>
    </div>
    <div class="summary-card" style="border-left-color: #ff6b6b;">
      <div class="summary-label">Total Spent</div>
      <div class="summary-value">${formatCurrency(totalSpent)}</div>
    </div>
    <div class="summary-card" style="border-left-color: #fab005;">
      <div class="summary-label">Avg PO Value</div>
      <div class="summary-value">${formatCurrency(avgPurchaseValue)}</div>
    </div>
    <div class="summary-card" style="border-left-color: #51cf66;">
      <div class="summary-label">Received Orders</div>
      <div class="summary-value">${receivedPurchases}</div>
    </div>
  `;

    // Generate chart
    generatePurchasesChart();

    // Generate table
    generatePurchasesTable();
}

function generatePurchasesChart() {
    document.getElementById('chartContainer').style.display = 'block';

    // Group purchases by date
    const purchasesByDate = {};
    filteredData.forEach(purchase => {
        const date = formatDate(purchase.date || purchase.created_at);
        if (!purchasesByDate[date]) {
            purchasesByDate[date] = { count: 0, amount: 0 };
        }
        purchasesByDate[date].count++;
        purchasesByDate[date].amount += (parseFloat(purchase.total_amount) || 0);
    });

    const labels = Object.keys(purchasesByDate).sort();
    const amountData = labels.map(date => purchasesByDate[date].amount);

    const ctx = document.getElementById('reportChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Purchase Amount',
                data: amountData,
                backgroundColor: 'rgba(255, 107, 107, 0.6)',
                borderColor: '#ff6b6b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Purchase Trend',
                    font: { size: 16, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return '₱' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function generatePurchasesTable() {
    const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Date</th>
          <th>Supplier</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${filteredData.map(purchase => `
          <tr>
            <td><strong>${purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`}</strong></td>
            <td>${formatDate(purchase.date || purchase.created_at)}</td>
            <td>${purchase.supplier_name || 'N/A'}</td>
            <td>${purchase.items_count || (purchase.items ? purchase.items.length : 0)}</td>
            <td><strong>${formatCurrency(parseFloat(purchase.total_amount) || 0)}</strong></td>
            <td>${purchase.status || 'ordered'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

    document.getElementById('tableContainer').innerHTML = filteredData.length > 0
        ? tableHTML
        : '<div class="empty-report"><div class="empty-report-icon">📦</div><div class="empty-report-title">No purchase data</div><div class="empty-report-text">No purchases found for the selected date range</div></div>';
}

// ========== INVENTORY VALUATION REPORT ==========
function generateInventoryReport() {
    document.getElementById('reportTitle').textContent = '📊 Inventory Valuation';

    filteredData = items; // No date filter for inventory

    // Calculate summaries
    const totalItems = filteredData.length;
    const totalValue = filteredData.reduce((sum, item) =>
        sum + ((item.stock_quantity || 0) * (item.purchase_cost || 0)), 0);
    const lowStockItems = filteredData.filter(item =>
        (item.stock_quantity || 0) <= (item.reorder_point || 10)).length;

    // Render summary cards
    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Items</div>
      <div class="summary-value">${totalItems}</div>
    </div>
    <div class="summary-card" style="border-left-color: #51cf66;">
      <div class="summary-label">Total Value</div>
      <div class="summary-value">${formatCurrency(totalValue)}</div>
    </div>
    <div class="summary-card" style="border-left-color: #fab005;">
      <div class="summary-label">Low Stock Items</div>
      <div class="summary-value">${lowStockItems}</div>
    </div>
  `;

    // Generate chart
    generateInventoryChart();

    // Generate table
    generateInventoryTable();
}

function generateInventoryChart() {
    document.getElementById('chartContainer').style.display = 'block';

    // Top 10 items by value
    const itemsByValue = [...filteredData]
        .map(item => ({
            name: item.name,
            value: (item.stock_quantity || 0) * (item.purchase_cost || 0)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const labels = itemsByValue.map(item => item.name);
    const values = itemsByValue.map(item => item.value);

    const ctx = document.getElementById('reportChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Value',
                data: values,
                backgroundColor: [
                    '#667eea', '#51cf66', '#fab005', '#ff6b6b', '#4c6ef5',
                    '#f59f00', '#37b24d', '#ee5a6f', '#364fc7', '#e67700'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right'
                },
                title: {
                    display: true,
                    text: 'Top 10 Items by Value',
                    font: { size: 16, weight: 'bold' }
                }
            }
        }
    });
}

function generateInventoryTable() {
    const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Item Name</th>
          <th>SKU</th>
          <th>Category</th>
          <th>Quantity</th>
          <th>Unit Cost</th>
          <th>Total Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${filteredData.map(item => {
        const quantity = item.stock_quantity || 0;
        const cost = item.purchase_cost || 0;
        const value = quantity * cost;
        const isLowStock = quantity <= (item.reorder_point || 10);
        const status = quantity === 0 ? 'Out of Stock' :
            isLowStock ? 'Low Stock' : 'In Stock';

        return `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td>${item.sku || '-'}</td>
              <td>${item.group_name || '-'}</td>
              <td>${quantity}</td>
              <td>${formatCurrency(cost)}</td>
              <td><strong>${formatCurrency(value)}</strong></td>
              <td style="color: ${quantity === 0 ? '#ff6b6b' : isLowStock ? '#fab005' : '#51cf66'}">
                ${status}
              </td>
            </tr>
          `;
    }).join('')}
      </tbody>
    </table>
  `;

    document.getElementById('tableContainer').innerHTML = filteredData.length > 0
        ? tableHTML
        : '<div class="empty-report"><div class="empty-report-icon">📊</div><div class="empty-report-title">No inventory data</div><div class="empty-report-text">No items found in inventory</div></div>';
}

// ========== STOCK MOVEMENTS REPORT ==========
function generateMovementsReport() {
    document.getElementById('reportTitle').textContent = '🔄 Stock Movement Logs';

    filteredData = getFilteredData(transactions, 'date');

    // Calculate summaries
    const totalMovements = filteredData.length;
    const stockIn = filteredData.filter(t => t.type === 'IN' || t.type === 'in').length;
    const stockOut = filteredData.filter(t => t.type === 'OUT' || t.type === 'out').length;
    const adjustments = filteredData.filter(t => t.type === 'ADJUSTMENT' || t.type === 'adjustment').length;

    // Render summary cards
    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Movements</div>
      <div class="summary-value">${totalMovements}</div>
    </div>
    <div class="summary-card" style="border-left-color: #51cf66;">
      <div class="summary-label">Stock In</div>
      <div class="summary-value">${stockIn}</div>
    </div>
    <div class="summary-card" style="border-left-color: #ff6b6b;">
      <div class="summary-label">Stock Out</div>
      <div class="summary-value">${stockOut}</div>
    </div>
    <div class="summary-card" style="border-left-color: #4c6ef5;">
      <div class="summary-label">Adjustments</div>
      <div class="summary-value">${adjustments}</div>
    </div>
  `;

    // Generate chart
    generateMovementsChart();

    // Generate table
    generateMovementsTable();
}

function generateMovementsChart() {
    document.getElementById('chartContainer').style.display = 'block';

    // Group movements by date and type
    const movementsByDate = {};
    filteredData.forEach(tx => {
        const date = formatDate(tx.date || tx.created_at);
        if (!movementsByDate[date]) {
            movementsByDate[date] = { in: 0, out: 0 };
        }

        const type = (tx.type || '').toLowerCase();
        if (type === 'in') {
            movementsByDate[date].in++;
        } else if (type === 'out') {
            movementsByDate[date].out++;
        }
    });

    const labels = Object.keys(movementsByDate).sort();
    const inData = labels.map(date => movementsByDate[date].in);
    const outData = labels.map(date => movementsByDate[date].out);

    const ctx = document.getElementById('reportChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Stock In',
                    data: inData,
                    backgroundColor: 'rgba(81, 207, 102, 0.6)',
                    borderColor: '#51cf66',
                    borderWidth: 2
                },
                {
                    label: 'Stock Out',
                    data: outData,
                    backgroundColor: 'rgba(255, 107, 107, 0.6)',
                    borderColor: '#ff6b6b',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Stock Movement Trend',
                    font: { size: 16, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function generateMovementsTable() {
    const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Item</th>
          <th>Quantity</th>
          <th>Reference</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${filteredData.map(tx => {
        const type = (tx.type || 'in').toLowerCase();
        const typeColor = type === 'in' ? '#51cf66' :
            type === 'out' ? '#ff6b6b' : '#4c6ef5';

        return `
            <tr>
              <td>${formatDateTime(tx.date || tx.created_at)}</td>
              <td style="color: ${typeColor}; font-weight: 700;">
                ${type.toUpperCase()}
              </td>
              <td>${tx.item_name || 'N/A'}</td>
              <td><strong>${tx.quantity}</strong></td>
              <td>${tx.reference || '-'}</td>
              <td>${tx.notes || '-'}</td>
            </tr>
          `;
    }).join('')}
      </tbody>
    </table>
  `;

    document.getElementById('tableContainer').innerHTML = filteredData.length > 0
        ? tableHTML
        : '<div class="empty-report"><div class="empty-report-icon">🔄</div><div class="empty-report-title">No movement data</div><div class="empty-report-text">No stock movements found for the selected date range</div></div>';
}

// ========== EXPORT FUNCTIONS ==========
function exportToPDF() {
    try {
        if (filteredData.length === 0) {
            showAlert('No data to export', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Add title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        const reportTitle = document.getElementById('reportTitle').textContent.replace(/[^\x00-\x7F]/g, ''); // Remove special chars
        doc.text(reportTitle, 105, 20, { align: 'center' });

        // Add date range
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const fromDate = document.getElementById('filterFromDate').value || 'N/A';
        const toDate = document.getElementById('filterToDate').value || 'N/A';
        doc.text(`Date Range: ${fromDate} to ${toDate}`, 105, 28, { align: 'center' });

        // Prepare table data based on report type
        let headers = [];
        let rows = [];

        switch (currentReport) {
            case 'sales':
                headers = ['Order #', 'Date', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment', 'Status'];
                rows = filteredData.map(sale => {
                    const subtotal = parseFloat(sale.subtotal) || parseFloat(sale.total_amount) || 0;
                    const discount = parseFloat(sale.discount_amount) || 0;
                    const tax = parseFloat(sale.tax_amount) || 0;
                    const total = parseFloat(sale.total_amount) || 0;
                    
                    return [
                        sale.receipt_number || sale.order_number || `ORD-${sale.id}`,
                        formatDate(sale.date || sale.created_at),
                        sale.customer_name || 'Walk-in Customer',
                        sale.items_count || sale.item_count || (sale.items ? sale.items.length : 0),
                        formatCurrency(subtotal),
                        formatCurrency(discount),
                        formatCurrency(tax),
                        formatCurrency(total),
                        (sale.payment_method || 'Cash').charAt(0).toUpperCase() + (sale.payment_method || 'Cash').slice(1),
                        (sale.status || 'completed').charAt(0).toUpperCase() + (sale.status || 'completed').slice(1)
                    ];
                });
                break;

            case 'purchases':
                headers = ['PO Number', 'Date', 'Supplier', 'Items', 'Total', 'Status'];
                rows = filteredData.map(purchase => [
                    purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`,
                    formatDate(purchase.date || purchase.created_at),
                    purchase.supplier_name || 'N/A',
                    purchase.items_count || (purchase.items ? purchase.items.length : 0),
                    formatCurrency(parseFloat(purchase.total_amount) || 0),
                    (purchase.status || 'ordered').charAt(0).toUpperCase() + (purchase.status || 'ordered').slice(1)
                ]);
                break;

            case 'inventory':
                headers = ['Item Name', 'SKU', 'Category', 'Quantity', 'Unit Cost', 'Total Value', 'Status'];
                rows = filteredData.map(item => {
                    const quantity = item.stock_quantity || 0;
                    const cost = item.purchase_cost || 0;
                    const value = quantity * cost;
                    const isLowStock = quantity <= (item.reorder_point || 10);
                    const status = quantity === 0 ? 'Out of Stock' :
                        isLowStock ? 'Low Stock' : 'In Stock';

                    return [
                        item.name,
                        item.sku || '-',
                        item.group_name || '-',
                        quantity.toString(),
                        formatCurrency(cost),
                        formatCurrency(value),
                        status
                    ];
                });
                break;

            case 'movements':
                headers = ['Date', 'Type', 'Item', 'Quantity', 'Reference', 'Notes'];
                rows = filteredData.map(tx => [
                    formatDateTime(tx.date || tx.created_at),
                    (tx.type || 'IN').toUpperCase(),
                    tx.item_name || 'N/A',
                    tx.quantity.toString(),
                    tx.reference || '-',
                    tx.notes || '-'
                ]);
                break;

            default:
                showAlert('Unknown report type', 'error');
                return;
        }

        // Generate table using autoTable
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 35,
            theme: 'striped',
            headStyles: {
                fillColor: [102, 126, 234],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                fontSize: 9,
                textColor: [0, 0, 0]
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
            styles: {
                cellPadding: 3,
                overflow: 'linebreak',
                cellWidth: 'wrap'
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 'auto' }
            }
        });

        // Save PDF
        const reportName = currentReport || 'report';
        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`${reportName}-report-${dateStr}.pdf`);

        showAlert('Report exported to PDF successfully! 📄', 'success');
    } catch (error) {
        console.error('PDF export error:', error);
        showAlert('Failed to export PDF. Make sure you have data to export.', 'error');
    }
}

function exportToCSV() {
    if (filteredData.length === 0) {
        showAlert('No data to export', 'error');
        return;
    }

    let csv = '';
    let headers = [];
    let rows = [];

    // Generate CSV based on report type
    switch (currentReport) {
        case 'sales':
            headers = ['Order #', 'Date', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment', 'Status'];
            rows = filteredData.map(sale => {
                const subtotal = parseFloat(sale.subtotal) || parseFloat(sale.total_amount) || 0;
                const discount = parseFloat(sale.discount_amount) || 0;
                const tax = parseFloat(sale.tax_amount) || 0;
                const total = parseFloat(sale.total_amount) || 0;
                
                return [
                    sale.receipt_number || sale.order_number || `ORD-${sale.id}`,
                    formatDate(sale.date || sale.created_at),
                    sale.customer_name || 'Walk-in Customer',
                    sale.items_count || sale.item_count || (sale.items ? sale.items.length : 0),
                    subtotal,
                    discount,
                    tax,
                    total,
                    sale.payment_method || 'Cash',
                    sale.status || 'completed'
                ];
            });
            break;

        case 'purchases':
            headers = ['PO Number', 'Date', 'Supplier', 'Items', 'Total', 'Status'];
            rows = filteredData.map(purchase => [
                purchase.po_number || purchase.invoice_number || `PO-${purchase.id}`,
                formatDate(purchase.date || purchase.created_at),
                purchase.supplier_name || 'N/A',
                purchase.items_count || (purchase.items ? purchase.items.length : 0),
                purchase.total_amount || 0,
                purchase.status || 'ordered'
            ]);
            break;

        case 'inventory':
            headers = ['Item Name', 'SKU', 'Category', 'Quantity', 'Unit Cost', 'Total Value', 'Status'];
            rows = filteredData.map(item => {
                const quantity = item.stock_quantity || 0;
                const cost = item.purchase_cost || 0;
                const value = quantity * cost;
                const isLowStock = quantity <= (item.reorder_point || 10);
                const status = quantity === 0 ? 'Out of Stock' :
                    isLowStock ? 'Low Stock' : 'In Stock';

                return [
                    item.name,
                    item.sku || '-',
                    item.group_name || '-',
                    quantity,
                    cost,
                    value,
                    status
                ];
            });
            break;

        case 'movements':
            headers = ['Date', 'Type', 'Item', 'Quantity', 'Reference', 'Notes'];
            rows = filteredData.map(tx => [
                formatDateTime(tx.date || tx.created_at),
                (tx.type || 'IN').toUpperCase(),
                tx.item_name || 'N/A',
                tx.quantity,
                tx.reference || '-',
                tx.notes || '-'
            ]);
            break;
    }

    // Create CSV string
    csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentReport}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showAlert('Report exported to CSV successfully! 📊', 'success');
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
