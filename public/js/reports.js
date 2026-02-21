// Reports & Analytics Module

let sales = [];
let purchases = [];
let items = [];
let transactions = [];
let adjustments = [];
let adjustmentItems = [];
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
            loadTransactions(),
            loadAdjustments()
        ]);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Load sales
async function loadSales() {
    try {
        sales = await salesAPI.getAll({ limit: 1000 });
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

// Load adjustments
async function loadAdjustments() {
    try {
        const res = await fetch('/api/inventory/adjustments?limit=1000');
        if (res.ok) {
            adjustments = await res.json();
        }
        // Load all adjustment items for detailed reports
        adjustmentItems = [];
        for (const adj of adjustments) {
            if (adj.status === 'adjusted') {
                try {
                    const detailRes = await fetch(`/api/inventory/adjustments/${adj.id}`);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        if (detail.items) {
                            detail.items.forEach(item => {
                                adjustmentItems.push({
                                    ...item,
                                    adjustment_date: adj.adjustment_date,
                                    reference_number: adj.reference_number,
                                    reason: adj.reason,
                                    description: adj.description,
                                    adjustment_status: adj.status,
                                    mode: adj.mode
                                });
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error loading adjustment detail:', e);
                }
            }
        }
    } catch (error) {
        console.error('Error loading adjustments:', error);
        adjustments = [];
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
        if (reportType === 'sales') {
            sales = await salesAPI.getAll({ limit: 1000 });
        } else if (reportType === 'purchases') {
            purchases = await purchasesAPI.getAll({ limit: 1000 });
        } else if (reportType === 'inventory' || reportType === 'valuation-summary' || reportType === 'stock-summary' || reportType === 'turnover-qty' || reportType === 'turnover-amount' || reportType === 'committed-stock') {
            items = await itemsAPI.getAll();
            await loadAdjustments();
            transactions = await inventoryAPI.getTransactions({ limit: 1000 });
            sales = await salesAPI.getAll({ limit: 1000 });
            purchases = await purchasesAPI.getAll({ limit: 1000 });
        } else if (reportType === 'movements') {
            transactions = await inventoryAPI.getTransactions({ limit: 1000 });
        } else if (reportType === 'adjustment-summary' || reportType === 'adjustment-details' || reportType === 'aging-summary' || reportType === 'fifo' || reportType === 'packing-history') {
            await loadAdjustments();
            items = await itemsAPI.getAll();
            transactions = await inventoryAPI.getTransactions({ limit: 1000 });
            purchases = await purchasesAPI.getAll({ limit: 1000 });
            sales = await salesAPI.getAll({ limit: 1000 });
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
            case 'committed-stock':
                generateCommittedStockReport();
                break;
            case 'packing-history':
                generatePackingHistoryReport();
                break;
            case 'aging-summary':
                generateAgingSummaryReport();
                break;
            case 'stock-summary':
                generateStockSummaryReport();
                break;
            case 'adjustment-summary':
                generateAdjustmentSummaryReport();
                break;
            case 'adjustment-details':
                generateAdjustmentDetailsReport();
                break;
            case 'turnover-qty':
                generateTurnoverByQtyReport();
                break;
            case 'valuation-summary':
                generateValuationSummaryReport();
                break;
            case 'fifo':
                generateFifoReport();
                break;
            case 'turnover-amount':
                generateTurnoverByAmountReport();
                break;
            case 'sales-item':
                generateSalesByItemReport();
                break;
            default:
                document.getElementById('summaryCards').innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #868e96;"><div style="font-size: 48px; margin-bottom: 16px;">🚧</div><div style="font-size: 18px; font-weight: 600;">Report Coming Soon</div><div style="font-size: 14px; margin-top: 8px;">This report type is under development.</div></div>';
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
        switch (currentReport) {
            case 'sales': generateSalesReport(); break;
            case 'purchases': generatePurchasesReport(); break;
            case 'inventory': generateInventoryReport(); break;
            case 'movements': generateMovementsReport(); break;
            case 'committed-stock': generateCommittedStockReport(); break;
            case 'packing-history': generatePackingHistoryReport(); break;
            case 'aging-summary': generateAgingSummaryReport(); break;
            case 'stock-summary': generateStockSummaryReport(); break;
            case 'adjustment-summary': generateAdjustmentSummaryReport(); break;
            case 'adjustment-details': generateAdjustmentDetailsReport(); break;
            case 'turnover-qty': generateTurnoverByQtyReport(); break;
            case 'valuation-summary': generateValuationSummaryReport(); break;
            case 'fifo': generateFifoReport(); break;
            case 'turnover-amount': generateTurnoverByAmountReport(); break;
            case 'sales-item': generateSalesByItemReport(); break;
            default: loadReport(currentReport);
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
        return data || [];
    }

    // Parse filter dates (input type="date" returns YYYY-MM-DD format)
    const fromDateStr = fromDateEl.value; // YYYY-MM-DD
    const toDateStr = toDateEl.value; // YYYY-MM-DD

    // Create date objects at start and end of day
    const fromDate = new Date(fromDateStr + 'T00:00:00');
    const toDate = new Date(toDateStr + 'T23:59:59.999');

    const filtered = (data || []).filter(item => {
        // Try multiple date field names
        const itemDateStr = item[dateField] || item.created_at || item.date || item.sale_date;

        if (!itemDateStr) {
            return false;
        }

        // Parse the item date - handle both ISO strings and other formats
        let itemDate = new Date(itemDateStr);

        // Check if date is valid
        if (isNaN(itemDate.getTime())) {
            return false;
        }

        // Normalize to date only (ignore time for comparison)
        const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
        const fromDateOnly = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        const toDateOnly = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

        // Check if item date is within range
        const isInRange = itemDateOnly >= fromDateOnly && itemDateOnly <= toDateOnly;

        return isInRange;
    });

    return filtered;
}

// ========== SALES REPORT ==========
async function generateSalesReport() {
    document.getElementById('reportTitle').textContent = '💰 Sales Report';

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
                        label: function (context) {
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
                        label: function (context) {
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

// ========== INVENTORY SUMMARY REPORT (Zoho-style) ==========
function generateInventoryReport() {
    document.getElementById('reportTitle').textContent = 'Inventory Summary';

    // Hide charts and summary cards – Zoho-style uses a clean tabular layout
    document.getElementById('summaryCards').innerHTML = '';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('chartContainer2').style.display = 'none';

    // Build per-item data map
    const itemMap = {};
    (items || []).forEach(item => {
        itemMap[item.id] = {
            name: item.name || '-',
            sku: item.sku || '',
            reorderLevel: parseFloat(item.reorder_level) || 0,
            stockOnHand: parseFloat(item.stock_quantity) || 0,
            unit: item.unit || item.uom || 'pcs',
            quantityOrdered: 0,  // from pending purchase orders
            quantityIn: 0,       // total received
            quantityOut: 0,      // total dispatched
            committedStock: 0,   // from pending/confirmed sales
            inTransit: 0         // ordered but not yet received
        };
    });

    // Calculate Quantity In & Quantity Out from transactions
    (transactions || []).forEach(tx => {
        const id = tx.item_id;
        if (!itemMap[id]) return;
        const qty = parseFloat(tx.quantity) || 0;
        const type = (tx.type || '').toUpperCase();
        if (type === 'IN' || type === 'PURCHASE') {
            itemMap[id].quantityIn += qty;
        } else if (type === 'OUT' || type === 'SALE') {
            itemMap[id].quantityOut += Math.abs(qty);
        } else if (type === 'ADJUSTMENT') {
            if (qty > 0) itemMap[id].quantityIn += qty;
            else itemMap[id].quantityOut += Math.abs(qty);
        }
    });

    // Also count from adjustment items directly
    (adjustmentItems || []).forEach(ai => {
        const id = ai.item_id;
        if (!itemMap[id]) return;
        const qty = parseFloat(ai.quantity_adjusted) || 0;
        if (qty > 0) itemMap[id].quantityIn += qty;
        else itemMap[id].quantityOut += Math.abs(qty);
    });

    // Committed stock from pending/confirmed sales
    (sales || []).forEach(sale => {
        const status = (sale.status || '').toLowerCase();
        if (status === 'pending' || status === 'processing' || status === 'confirmed') {
            if (sale.items) {
                sale.items.forEach(si => {
                    if (itemMap[si.item_id]) {
                        itemMap[si.item_id].committedStock += parseFloat(si.quantity) || 0;
                    }
                });
            }
        }
    });

    // Quantity Ordered & In-Transit from pending purchases
    (purchases || []).forEach(purchase => {
        const status = (purchase.status || '').toLowerCase();
        if (status === 'pending' || status === 'ordered' || status === 'issued') {
            if (purchase.items) {
                purchase.items.forEach(pi => {
                    if (itemMap[pi.item_id]) {
                        itemMap[pi.item_id].quantityOrdered += parseFloat(pi.quantity) || 0;
                        itemMap[pi.item_id].inTransit += parseFloat(pi.quantity) || 0;
                    }
                });
            }
        }
    });

    // Calculate available for sale
    const rows = Object.values(itemMap);
    rows.forEach(r => {
        r.availableForSale = r.stockOnHand - r.committedStock;
    });

    // Calculate totals
    const totals = {
        reorderLevel: rows.reduce((s, r) => s + r.reorderLevel, 0),
        quantityOrdered: rows.reduce((s, r) => s + r.quantityOrdered, 0),
        quantityIn: rows.reduce((s, r) => s + r.quantityIn, 0),
        quantityOut: rows.reduce((s, r) => s + r.quantityOut, 0),
        stockOnHand: rows.reduce((s, r) => s + r.stockOnHand, 0),
        committedStock: rows.reduce((s, r) => s + r.committedStock, 0),
        availableForSale: rows.reduce((s, r) => s + r.availableForSale, 0),
        inTransit: rows.reduce((s, r) => s + r.inTransit, 0)
    };

    // Format number to 2 decimal places
    const fmt = (n) => parseFloat(n).toFixed(2);

    // Current date for header
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Build Zoho-style report
    const reportHTML = `
    <div style="padding: 20px 0;">
      <!-- Report Header -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 13px; color: #868e96; text-transform: uppercase; letter-spacing: 1px;">SOLO</div>
        <div style="font-size: 20px; font-weight: 700; color: #212529; margin-top: 4px;">Inventory Summary</div>
        <div style="font-size: 13px; color: #868e96; margin-top: 4px;">As of ${dateStr}</div>
      </div>

      <!-- Report Table -->
      <table class="data-table" style="font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="text-align: left; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Item Name ↕</th>
            <th style="text-align: left; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">SKU</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Reorder Level</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Quantity Ordered</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Quantity In</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Quantity Out</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Stock on Hand</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Committed Stock</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Available for Sale</th>
            <th style="text-align: right; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">In-Transit</th>
            <th style="text-align: left; color: #4c6ef5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Unit</th>
          </tr>
        </thead>
        <tbody>
          ${rows.sort((a, b) => a.name.localeCompare(b.name)).map(r => `
          <tr style="border-bottom: 1px solid #f1f3f5;">
            <td style="text-align: left; padding: 10px 12px; color: #212529;">${r.name}</td>
            <td style="text-align: left; padding: 10px 12px; color: #495057;">${r.sku}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.reorderLevel)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.quantityOrdered)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.quantityIn)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.quantityOut)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #212529; font-weight: 500;">${fmt(r.stockOnHand)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.committedStock)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.availableForSale)}</td>
            <td style="text-align: right; padding: 10px 12px; color: #495057;">${fmt(r.inTransit)}</td>
            <td style="text-align: left; padding: 10px 12px; color: #868e96;">${r.unit}</td>
          </tr>
          `).join('')}
          <tr style="background: #f8f9fa; border-top: 2px solid #dee2e6; font-weight: 700;">
            <td style="text-align: left; padding: 12px; color: #212529;">Total</td>
            <td></td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.reorderLevel)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.quantityOrdered)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.quantityIn)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.quantityOut)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.stockOnHand)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.committedStock)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.availableForSale)}</td>
            <td style="text-align: right; padding: 12px; color: #212529;">${fmt(totals.inTransit)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`;

    document.getElementById('tableContainer').innerHTML = rows.length > 0
        ? reportHTML
        : '<div class="empty-report"><div class="empty-report-icon">📦</div><div class="empty-report-title">No Inventory Data</div><div class="empty-report-text">No items have been added yet.</div></div>';
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

// ========== COMMITTED STOCK DETAILS REPORT ==========
function generateCommittedStockReport() {
    document.getElementById('reportTitle').textContent = '📋 Committed Stock Details';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    // For committed stock: items that have been sold but may still have pending orders
    // We calculate based on sales items vs current stock levels
    const itemMap = {};
    (items || []).forEach(item => {
        itemMap[item.id] = {
            name: item.name, sku: item.sku || '-', category: item.group_name || item.category || 'Uncategorized',
            currentStock: parseFloat(item.stock_quantity) || 0,
            cost: parseFloat(item.purchase_cost) || 0,
            committedQty: 0,
            purchaseOrderQty: 0,
            availableForSale: 0
        };
    });

    // Count committed quantities from sales
    (sales || []).forEach(sale => {
        const status = (sale.status || '').toLowerCase();
        // Only count pending/processing sales as committed
        if (status === 'pending' || status === 'processing' || status === 'confirmed') {
            if (sale.items) {
                sale.items.forEach(si => {
                    if (itemMap[si.item_id]) {
                        itemMap[si.item_id].committedQty += parseFloat(si.quantity) || 0;
                    }
                });
            }
        }
    });

    // Count incoming from purchases
    (purchases || []).forEach(purchase => {
        const status = (purchase.status || '').toLowerCase();
        if (status === 'pending' || status === 'ordered') {
            if (purchase.items) {
                purchase.items.forEach(pi => {
                    if (itemMap[pi.item_id]) {
                        itemMap[pi.item_id].purchaseOrderQty += parseFloat(pi.quantity) || 0;
                    }
                });
            }
        }
    });

    const rows = Object.values(itemMap).filter(i => i.currentStock > 0 || i.committedQty > 0 || i.purchaseOrderQty > 0);
    rows.forEach(r => {
        r.availableForSale = r.currentStock - r.committedQty;
    });

    const totalStock = rows.reduce((s, r) => s + r.currentStock, 0);
    const totalCommitted = rows.reduce((s, r) => s + r.committedQty, 0);
    const totalPO = rows.reduce((s, r) => s + r.purchaseOrderQty, 0);
    const totalAvailable = rows.reduce((s, r) => s + r.availableForSale, 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Stock on Hand</div><div class="summary-value">${totalStock.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #ff922b;"><div class="summary-label">Committed Stock</div><div class="summary-value" style="color:#ff922b;">${totalCommitted.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Incoming (PO)</div><div class="summary-value" style="color:#4c6ef5;">${totalPO.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Available for Sale</div><div class="summary-value" style="color:#51cf66;">${totalAvailable.toLocaleString()}</div></div>`;

    // Chart
    const top10 = [...rows].filter(r => r.committedQty > 0).sort((a, b) => b.committedQty - a.committedQty).slice(0, 10);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    if (top10.length > 0) {
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(r => r.name.length > 18 ? r.name.substring(0, 18) + '...' : r.name),
                datasets: [
                    { label: 'Stock on Hand', data: top10.map(r => r.currentStock), backgroundColor: 'rgba(102,126,234,0.7)' },
                    { label: 'Committed', data: top10.map(r => r.committedQty), backgroundColor: 'rgba(255,146,43,0.7)' },
                    { label: 'Available', data: top10.map(r => r.availableForSale), backgroundColor: 'rgba(81,207,102,0.7)' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Top 10 Items with Committed Stock', font: { size: 16, weight: 'bold' } } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } else {
        document.getElementById('chartContainer').style.display = 'none';
    }

    // Table
    document.getElementById('tableContainer').innerHTML = rows.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Category</th><th>Stock on Hand</th><th>Committed Qty</th><th>Incoming (PO)</th><th>Available for Sale</th>
    </tr></thead><tbody>
    ${rows.sort((a, b) => b.committedQty - a.committedQty).map(r => `<tr>
      <td><strong>${r.name}</strong></td><td>${r.sku}</td><td>${r.category}</td>
      <td>${r.currentStock.toLocaleString()}</td>
      <td style="color:#ff922b;font-weight:600;">${r.committedQty.toLocaleString()}</td>
      <td style="color:#4c6ef5;">${r.purchaseOrderQty.toLocaleString()}</td>
      <td style="color:${r.availableForSale >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${r.availableForSale.toLocaleString()}</td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">📋</div><div class="empty-report-title">No Committed Stock</div><div class="empty-report-text">No items currently have committed stock.</div></div>';
}

// ========== PACKING HISTORY REPORT ==========
function generatePackingHistoryReport() {
    document.getElementById('reportTitle').textContent = '📦 Packing History';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    // Packing history: We show all sales transactions as packing/fulfillment records
    // including adjustments that affect stock
    const packingRecords = [];

    (sales || []).forEach(sale => {
        if (sale.items) {
            sale.items.forEach(si => {
                packingRecords.push({
                    date: sale.date || sale.created_at,
                    type: 'Sale',
                    reference: `SO-${sale.id}`,
                    customerVendor: sale.customer_name || 'Walk-in Customer',
                    itemName: si.item_name || si.name || 'Item',
                    quantity: parseFloat(si.quantity) || 0,
                    status: sale.status || 'completed',
                    source: 'sale'
                });
            });
        }
    });

    // Purchases as receiving/unpacking
    (purchases || []).forEach(purchase => {
        if (purchase.items) {
            purchase.items.forEach(pi => {
                packingRecords.push({
                    date: purchase.date || purchase.created_at,
                    type: 'Purchase',
                    reference: `PO-${purchase.po_number || purchase.id}`,
                    customerVendor: purchase.supplier_name || 'Supplier',
                    itemName: pi.item_name || pi.name || 'Item',
                    quantity: parseFloat(pi.quantity) || 0,
                    status: purchase.status || 'received',
                    source: 'purchase'
                });
            });
        }
    });

    // Adjustments
    adjustmentItems.forEach(ai => {
        packingRecords.push({
            date: ai.adjustment_date,
            type: 'Adjustment',
            reference: ai.reference_number || '-',
            customerVendor: ai.reason || 'Adjustment',
            itemName: ai.item_name || 'Item',
            quantity: parseFloat(ai.quantity_adjusted) || 0,
            status: ai.adjustment_status || 'adjusted',
            source: 'adjustment'
        });
    });

    // Sort by date descending
    packingRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalPacked = packingRecords.filter(r => r.source === 'sale').reduce((s, r) => s + r.quantity, 0);
    const totalReceived = packingRecords.filter(r => r.source === 'purchase').reduce((s, r) => s + r.quantity, 0);
    const totalAdjusted = packingRecords.filter(r => r.source === 'adjustment').reduce((s, r) => s + Math.abs(r.quantity), 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Records</div><div class="summary-value">${packingRecords.length}</div></div>
    <div class="summary-card" style="border-left-color: #ff6b6b;"><div class="summary-label">Qty Packed (Sales)</div><div class="summary-value" style="color:#ff6b6b;">${totalPacked.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Qty Received (Purchases)</div><div class="summary-value" style="color:#51cf66;">${totalReceived.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Qty Adjusted</div><div class="summary-value" style="color:#4c6ef5;">${totalAdjusted.toLocaleString()}</div></div>`;

    // Chart - by type
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Packed (Sales)', 'Received (Purchases)', 'Adjusted'],
            datasets: [{
                data: [totalPacked, totalReceived, totalAdjusted],
                backgroundColor: ['#ff6b6b', '#51cf66', '#4c6ef5']
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Packing History by Type', font: { size: 16, weight: 'bold' } },
                legend: { position: 'right' }
            }
        }
    });

    // Table
    document.getElementById('tableContainer').innerHTML = packingRecords.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Date</th><th>Type</th><th>Reference</th><th>Customer/Vendor</th><th>Item Name</th><th>Quantity</th><th>Status</th>
    </tr></thead><tbody>
    ${packingRecords.map(r => {
        const typeColor = r.source === 'sale' ? '#ff6b6b' : r.source === 'purchase' ? '#51cf66' : '#4c6ef5';
        const typeBg = r.source === 'sale' ? '#fff5f5' : r.source === 'purchase' ? '#f0fff4' : '#edf2ff';
        return `<tr>
          <td>${formatDateTime(r.date)}</td>
          <td><span style="background:${typeBg};color:${typeColor};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">${r.type}</span></td>
          <td><strong>${r.reference}</strong></td>
          <td>${r.customerVendor}</td>
          <td>${r.itemName}</td>
          <td style="font-weight:600;color:${r.quantity >= 0 ? '#51cf66' : '#ff6b6b'};">${r.quantity >= 0 ? '+' : ''}${r.quantity.toLocaleString()}</td>
          <td><span style="background:#f0f4ff;color:#4c6ef5;padding:2px 8px;border-radius:4px;font-size:12px;">${r.status}</span></td>
        </tr>`;
    }).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">📦</div><div class="empty-report-title">No Packing History</div><div class="empty-report-text">No packing or stock movement records found.</div></div>';
}

// ========== INVENTORY AGING SUMMARY REPORT ==========
function generateAgingSummaryReport() {
    document.getElementById('reportTitle').textContent = '⏳ Inventory Aging Summary';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const now = new Date();
    const agingBuckets = { '0-30 Days': 0, '31-60 Days': 0, '61-90 Days': 0, '91-180 Days': 0, '180+ Days': 0 };
    const agingValue = { '0-30 Days': 0, '31-60 Days': 0, '61-90 Days': 0, '91-180 Days': 0, '180+ Days': 0 };
    const itemsAging = [];

    (items || []).forEach(item => {
        const qty = parseFloat(item.stock_quantity) || 0;
        if (qty <= 0) return;
        const cost = parseFloat(item.purchase_cost) || 0;
        const lastUpdated = new Date(item.updated_at || item.created_at || now);
        const daysHeld = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
        let bucket;
        if (daysHeld <= 30) bucket = '0-30 Days';
        else if (daysHeld <= 60) bucket = '31-60 Days';
        else if (daysHeld <= 90) bucket = '61-90 Days';
        else if (daysHeld <= 180) bucket = '91-180 Days';
        else bucket = '180+ Days';

        agingBuckets[bucket] += qty;
        agingValue[bucket] += qty * cost;
        itemsAging.push({ name: item.name, sku: item.sku, qty, cost, value: qty * cost, daysHeld, bucket });
    });

    const totalQty = Object.values(agingBuckets).reduce((s, v) => s + v, 0);
    const totalVal = Object.values(agingValue).reduce((s, v) => s + v, 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Stock Qty</div>
      <div class="summary-value">${totalQty.toLocaleString()}</div>
    </div>
    <div class="summary-card" style="border-left-color: #51cf66;">
      <div class="summary-label">Total Value</div>
      <div class="summary-value">${formatCurrency(totalVal)}</div>
    </div>
    <div class="summary-card" style="border-left-color: #fab005;">
      <div class="summary-label">Aged 90+ Days</div>
      <div class="summary-value">${(agingBuckets['91-180 Days'] + agingBuckets['180+ Days']).toLocaleString()}</div>
    </div>
    <div class="summary-card" style="border-left-color: #ff6b6b;">
      <div class="summary-label">Aged 180+ Days</div>
      <div class="summary-value">${agingBuckets['180+ Days'].toLocaleString()}</div>
    </div>`;

    // Chart
    const labels = Object.keys(agingBuckets);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Quantity',
                data: labels.map(l => agingBuckets[l]),
                backgroundColor: ['#51cf66', '#fab005', '#ff922b', '#ff6b6b', '#cc5de8']
            }, {
                label: 'Value (₱)',
                data: labels.map(l => agingValue[l]),
                backgroundColor: ['rgba(81,207,102,0.4)', 'rgba(250,176,5,0.4)', 'rgba(255,146,43,0.4)', 'rgba(255,107,107,0.4)', 'rgba(204,93,232,0.4)'],
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Inventory Aging Distribution', font: { size: 16, weight: 'bold' } } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Quantity' } }, y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Value (₱)' }, grid: { drawOnChartArea: false } } }
        }
    });

    // Table
    const sorted = [...itemsAging].sort((a, b) => b.daysHeld - a.daysHeld);
    document.getElementById('tableContainer').innerHTML = sorted.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Quantity</th><th>Unit Cost</th><th>Total Value</th><th>Days Held</th><th>Age Bucket</th>
    </tr></thead><tbody>
    ${sorted.map(i => `<tr>
      <td><strong>${i.name}</strong></td><td>${i.sku || '-'}</td>
      <td>${i.qty.toLocaleString()}</td><td>${formatCurrency(i.cost)}</td>
      <td><strong>${formatCurrency(i.value)}</strong></td>
      <td style="color: ${i.daysHeld > 90 ? '#ff6b6b' : i.daysHeld > 60 ? '#fab005' : '#51cf66'}">${i.daysHeld}</td>
      <td>${i.bucket}</td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">⏳</div><div class="empty-report-title">No Aging Data</div><div class="empty-report-text">No items with stock found.</div></div>';
}

// ========== STOCK SUMMARY REPORT ==========
function generateStockSummaryReport() {
    document.getElementById('reportTitle').textContent = '📦 Stock Summary';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const startDate = document.getElementById('startDate') ? new Date(document.getElementById('startDate').value + 'T00:00:00') : null;
    const endDate = document.getElementById('endDate') ? new Date(document.getElementById('endDate').value + 'T23:59:59') : null;

    // Build per-item summary
    const itemMap = {};
    (items || []).forEach(item => {
        itemMap[item.id] = {
            name: item.name, sku: item.sku || '-', category: item.group_name || item.category || 'Uncategorized',
            currentStock: parseFloat(item.stock_quantity) || 0,
            cost: parseFloat(item.purchase_cost) || 0,
            stockIn: 0, stockOut: 0, adjustIn: 0, adjustOut: 0
        };
    });

    // Process transactions
    (transactions || []).forEach(tx => {
        const txDate = new Date(tx.date || tx.created_at);
        if (startDate && txDate < startDate) return;
        if (endDate && txDate > endDate) return;
        const id = tx.item_id;
        if (!itemMap[id]) return;
        const qty = parseFloat(tx.quantity) || 0;
        const type = (tx.type || '').toUpperCase();
        if (type === 'IN') itemMap[id].stockIn += qty;
        else if (type === 'OUT') itemMap[id].stockOut += Math.abs(qty);
        else if (type === 'ADJUSTMENT') {
            if (qty > 0) itemMap[id].adjustIn += qty;
            else itemMap[id].adjustOut += Math.abs(qty);
        }
    });

    const rows = Object.values(itemMap).filter(i => i.currentStock > 0 || i.stockIn > 0 || i.stockOut > 0 || i.adjustIn > 0 || i.adjustOut > 0);
    rows.forEach(r => {
        r.totalIn = r.stockIn + r.adjustIn;
        r.totalOut = r.stockOut + r.adjustOut;
        r.openingStock = r.currentStock - r.totalIn + r.totalOut;
    });

    const totalIn = rows.reduce((s, r) => s + r.totalIn, 0);
    const totalOut = rows.reduce((s, r) => s + r.totalOut, 0);
    const totalClosing = rows.reduce((s, r) => s + r.currentStock, 0);
    const totalAdjust = rows.reduce((s, r) => s + r.adjustIn - r.adjustOut, 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Stock In</div><div class="summary-value" style="color:#51cf66;">+${totalIn.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #ff6b6b;"><div class="summary-label">Total Stock Out</div><div class="summary-value" style="color:#ff6b6b;">-${totalOut.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Net Adjustments</div><div class="summary-value" style="color:#4c6ef5;">${totalAdjust >= 0 ? '+' : ''}${totalAdjust.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Closing Stock</div><div class="summary-value">${totalClosing.toLocaleString()}</div></div>`;

    // Chart
    const top10 = [...rows].sort((a, b) => b.currentStock - a.currentStock).slice(0, 10);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(r => r.name.length > 20 ? r.name.substring(0, 20) + '...' : r.name),
            datasets: [
                { label: 'Stock In', data: top10.map(r => r.totalIn), backgroundColor: 'rgba(81,207,102,0.7)' },
                { label: 'Stock Out', data: top10.map(r => r.totalOut), backgroundColor: 'rgba(255,107,107,0.7)' },
                { label: 'Adjustments', data: top10.map(r => r.adjustIn - r.adjustOut), backgroundColor: 'rgba(76,110,245,0.7)' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Top 10 Items - Stock Movement', font: { size: 16, weight: 'bold' } } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // Table
    document.getElementById('tableContainer').innerHTML = rows.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Opening Stock</th><th>Stock In</th><th>Stock Out</th><th>Adjust (+)</th><th>Adjust (-)</th><th>Closing Stock</th>
    </tr></thead><tbody>
    ${rows.sort((a, b) => a.name.localeCompare(b.name)).map(r => `<tr>
      <td><strong>${r.name}</strong></td><td>${r.sku}</td>
      <td>${r.openingStock.toLocaleString()}</td>
      <td style="color:#51cf66;font-weight:600;">+${r.stockIn.toLocaleString()}</td>
      <td style="color:#ff6b6b;font-weight:600;">-${r.stockOut.toLocaleString()}</td>
      <td style="color:#4c6ef5;">+${r.adjustIn.toLocaleString()}</td>
      <td style="color:#cc5de8;">-${r.adjustOut.toLocaleString()}</td>
      <td><strong>${r.currentStock.toLocaleString()}</strong></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">📦</div><div class="empty-report-title">No Stock Data</div><div class="empty-report-text">No stock movements found for the selected period.</div></div>';
}

// ========== INVENTORY ADJUSTMENT SUMMARY REPORT ==========
function generateAdjustmentSummaryReport() {
    document.getElementById('reportTitle').textContent = '📝 Inventory Adjustment Summary';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const filteredAdj = adjustments.filter(a => a.status === 'adjusted');

    const totalAdj = filteredAdj.length;
    const positiveAdj = filteredAdj.filter(a => parseFloat(a.total_quantity_change) > 0);
    const negativeAdj = filteredAdj.filter(a => parseFloat(a.total_quantity_change) < 0);
    const netQty = filteredAdj.reduce((s, a) => s + parseFloat(a.total_quantity_change || 0), 0);
    const netVal = filteredAdj.reduce((s, a) => s + parseFloat(a.total_value_change || 0), 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Adjustments</div><div class="summary-value">${totalAdj}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Positive Adjustments</div><div class="summary-value" style="color:#51cf66;">${positiveAdj.length}</div></div>
    <div class="summary-card" style="border-left-color: #ff6b6b;"><div class="summary-label">Negative Adjustments</div><div class="summary-value" style="color:#ff6b6b;">${negativeAdj.length}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Net Value Change</div><div class="summary-value" style="color:${netVal >= 0 ? '#51cf66' : '#ff6b6b'};">${formatCurrency(netVal)}</div></div>`;

    // Chart by reason
    const byReason = {};
    filteredAdj.forEach(a => {
        const reason = a.reason || 'No Reason';
        if (!byReason[reason]) byReason[reason] = { count: 0, qtyChange: 0, valChange: 0 };
        byReason[reason].count++;
        byReason[reason].qtyChange += parseFloat(a.total_quantity_change || 0);
        byReason[reason].valChange += parseFloat(a.total_value_change || 0);
    });

    const labels = Object.keys(byReason);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: labels.map(l => byReason[l].count),
                backgroundColor: ['#667eea', '#51cf66', '#fab005', '#ff6b6b', '#4c6ef5', '#cc5de8', '#ff922b', '#20c997']
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Adjustments by Reason', font: { size: 16, weight: 'bold' } },
                legend: { position: 'right' }
            }
        }
    });

    // Table
    document.getElementById('tableContainer').innerHTML = filteredAdj.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Date</th><th>Reference #</th><th>Reason</th><th>Mode</th><th>Qty Change</th><th>Value Change</th><th>Status</th>
    </tr></thead><tbody>
    ${filteredAdj.sort((a, b) => new Date(b.adjustment_date) - new Date(a.adjustment_date)).map(a => {
        const qtyChange = parseFloat(a.total_quantity_change || 0);
        const valChange = parseFloat(a.total_value_change || 0);
        return `<tr>
          <td>${formatDateTime(a.adjustment_date)}</td>
          <td><strong>${a.reference_number || '-'}</strong></td>
          <td>${a.reason || '-'}</td>
          <td><span style="background:${a.mode === 'quantity' ? '#e3f2fd' : '#f3e5f5'};padding:2px 8px;border-radius:4px;font-size:12px;">${a.mode || 'quantity'}</span></td>
          <td style="color:${qtyChange >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${qtyChange >= 0 ? '+' : ''}${qtyChange.toLocaleString()}</td>
          <td style="color:${valChange >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${formatCurrency(valChange)}</td>
          <td><span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;font-size:12px;">Adjusted</span></td>
        </tr>`;
    }).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">📝</div><div class="empty-report-title">No Adjustment Data</div><div class="empty-report-text">No inventory adjustments have been recorded yet.</div></div>';
}

// ========== INVENTORY ADJUSTMENT DETAILS REPORT ==========
function generateAdjustmentDetailsReport() {
    document.getElementById('reportTitle').textContent = '📋 Inventory Adjustment Details';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('chartContainer2').style.display = 'none';

    const filtered = adjustmentItems.filter(i => i.adjustment_status === 'adjusted');

    const totalItems = filtered.length;
    const totalQtyChange = filtered.reduce((s, i) => s + parseFloat(i.quantity_adjusted || 0), 0);
    const totalValueChange = filtered.reduce((s, i) => s + parseFloat(i.value_change || 0), 0);
    const uniqueItems = new Set(filtered.map(i => i.item_id)).size;

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Line Items</div><div class="summary-value">${totalItems}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Unique Items Adjusted</div><div class="summary-value">${uniqueItems}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Net Qty Change</div><div class="summary-value" style="color:${totalQtyChange >= 0 ? '#51cf66' : '#ff6b6b'};">${totalQtyChange >= 0 ? '+' : ''}${totalQtyChange.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #fab005;"><div class="summary-label">Net Value Change</div><div class="summary-value" style="color:${totalValueChange >= 0 ? '#51cf66' : '#ff6b6b'};">${formatCurrency(totalValueChange)}</div></div>`;

    // Table
    document.getElementById('tableContainer').innerHTML = filtered.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Date</th><th>Reference #</th><th>Item Name</th><th>Reason</th><th>Qty on Hand</th><th>Qty Adjusted</th><th>New Quantity</th><th>Unit Cost</th><th>Value Change</th>
    </tr></thead><tbody>
    ${filtered.sort((a, b) => new Date(b.adjustment_date) - new Date(a.adjustment_date)).map(i => {
        const qtyAdj = parseFloat(i.quantity_adjusted || 0);
        const valChange = parseFloat(i.value_change || 0);
        return `<tr>
          <td>${formatDateTime(i.adjustment_date)}</td>
          <td><strong>${i.reference_number || '-'}</strong></td>
          <td><strong>${i.item_name || '-'}</strong></td>
          <td>${i.reason || '-'}</td>
          <td>${parseFloat(i.quantity_on_hand || 0).toLocaleString()}</td>
          <td style="color:${qtyAdj >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${qtyAdj >= 0 ? '+' : ''}${qtyAdj.toLocaleString()}</td>
          <td><strong>${parseFloat(i.new_quantity || 0).toLocaleString()}</strong></td>
          <td>${formatCurrency(parseFloat(i.unit_cost || 0))}</td>
          <td style="color:${valChange >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${formatCurrency(valChange)}</td>
        </tr>`;
    }).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">📋</div><div class="empty-report-title">No Adjustment Details</div><div class="empty-report-text">No adjustment line items found.</div></div>';
}

// ========== INVENTORY TURNOVER BY QUANTITY REPORT ==========
function generateTurnoverByQtyReport() {
    document.getElementById('reportTitle').textContent = '🔄 Inventory Turnover by Quantity';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const itemMap = {};
    (items || []).forEach(item => {
        itemMap[item.id] = {
            name: item.name, sku: item.sku || '-', category: item.group_name || item.category || '-',
            currentStock: parseFloat(item.stock_quantity) || 0,
            cost: parseFloat(item.purchase_cost) || 0,
            qtySold: 0, qtyPurchased: 0, qtyAdjusted: 0
        };
    });

    // Count sold quantities from sales items
    (sales || []).forEach(sale => {
        if (sale.items) {
            sale.items.forEach(si => {
                if (itemMap[si.item_id]) {
                    itemMap[si.item_id].qtySold += parseFloat(si.quantity) || 0;
                }
            });
        }
    });

    // Count purchased quantities
    (purchases || []).forEach(purchase => {
        if (purchase.items) {
            purchase.items.forEach(pi => {
                if (itemMap[pi.item_id]) {
                    itemMap[pi.item_id].qtyPurchased += parseFloat(pi.quantity) || 0;
                }
            });
        }
    });

    // Count adjustments
    adjustmentItems.forEach(ai => {
        if (itemMap[ai.item_id]) {
            itemMap[ai.item_id].qtyAdjusted += parseFloat(ai.quantity_adjusted) || 0;
        }
    });

    const rows = Object.values(itemMap).filter(i => i.qtySold > 0 || i.qtyPurchased > 0 || i.qtyAdjusted !== 0 || i.currentStock > 0);
    rows.forEach(r => {
        const avgStock = r.currentStock > 0 ? r.currentStock : 1;
        r.totalMoved = r.qtySold + Math.abs(r.qtyAdjusted);
        r.turnoverRate = (r.qtySold / avgStock).toFixed(2);
    });

    const totalSold = rows.reduce((s, r) => s + r.qtySold, 0);
    const totalPurchased = rows.reduce((s, r) => s + r.qtyPurchased, 0);
    const totalAdjusted = rows.reduce((s, r) => s + r.qtyAdjusted, 0);
    const avgTurnover = rows.length > 0 ? (rows.reduce((s, r) => s + parseFloat(r.turnoverRate), 0) / rows.length).toFixed(2) : '0';

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Qty Sold</div><div class="summary-value">${totalSold.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Total Qty Purchased</div><div class="summary-value">${totalPurchased.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Net Qty Adjusted</div><div class="summary-value" style="color:${totalAdjusted >= 0 ? '#51cf66' : '#ff6b6b'};">${totalAdjusted >= 0 ? '+' : ''}${totalAdjusted.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Avg Turnover Rate</div><div class="summary-value">${avgTurnover}x</div></div>`;

    // Chart - Top 10 by turnover
    const top10 = [...rows].sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate)).slice(0, 10);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(r => r.name.length > 18 ? r.name.substring(0, 18) + '...' : r.name),
            datasets: [{
                label: 'Turnover Rate',
                data: top10.map(r => r.turnoverRate),
                backgroundColor: '#667eea',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { title: { display: true, text: 'Top 10 Items by Turnover Rate', font: { size: 16, weight: 'bold' } }, legend: { display: false } },
            scales: { x: { beginAtZero: true, title: { display: true, text: 'Turnover Rate (times)' } } }
        }
    });

    // Table
    document.getElementById('tableContainer').innerHTML = rows.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Current Stock</th><th>Qty Sold</th><th>Qty Purchased</th><th>Qty Adjusted</th><th>Turnover Rate</th>
    </tr></thead><tbody>
    ${rows.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate)).map(r => `<tr>
      <td><strong>${r.name}</strong></td><td>${r.sku}</td>
      <td>${r.currentStock.toLocaleString()}</td>
      <td>${r.qtySold.toLocaleString()}</td>
      <td>${r.qtyPurchased.toLocaleString()}</td>
      <td style="color:${r.qtyAdjusted >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${r.qtyAdjusted >= 0 ? '+' : ''}${r.qtyAdjusted.toLocaleString()}</td>
      <td><strong>${r.turnoverRate}x</strong></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">🔄</div><div class="empty-report-title">No Turnover Data</div><div class="empty-report-text">No movement data available.</div></div>';
}

// ========== INVENTORY VALUATION SUMMARY REPORT ==========
function generateValuationSummaryReport() {
    document.getElementById('reportTitle').textContent = '💰 Inventory Valuation Summary';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const categoryMap = {};
    (items || []).forEach(item => {
        const cat = item.group_name || item.category || 'Uncategorized';
        if (!categoryMap[cat]) categoryMap[cat] = { items: 0, totalQty: 0, totalValue: 0, itemsList: [] };
        const qty = parseFloat(item.stock_quantity) || 0;
        const cost = parseFloat(item.purchase_cost) || 0;
        const value = qty * cost;
        categoryMap[cat].items++;
        categoryMap[cat].totalQty += qty;
        categoryMap[cat].totalValue += value;
        categoryMap[cat].itemsList.push({ name: item.name, sku: item.sku, qty, cost, value });
    });

    const totalItems = (items || []).length;
    const totalQty = Object.values(categoryMap).reduce((s, c) => s + c.totalQty, 0);
    const totalValue = Object.values(categoryMap).reduce((s, c) => s + c.totalValue, 0);
    const totalAdjValue = adjustmentItems.reduce((s, ai) => s + parseFloat(ai.value_change || 0), 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Items</div><div class="summary-value">${totalItems}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Total Stock Qty</div><div class="summary-value">${totalQty.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Total Stock Value</div><div class="summary-value">${formatCurrency(totalValue)}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Adjustment Impact</div><div class="summary-value" style="color:${totalAdjValue >= 0 ? '#51cf66' : '#ff6b6b'};">${formatCurrency(totalAdjValue)}</div></div>`;

    // Pie chart by category
    const cats = Object.keys(categoryMap).sort();
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: cats,
            datasets: [{
                data: cats.map(c => categoryMap[c].totalValue),
                backgroundColor: ['#667eea', '#51cf66', '#fab005', '#ff6b6b', '#4c6ef5', '#cc5de8', '#ff922b', '#20c997', '#e64980', '#f59f00']
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Valuation by Category', font: { size: 16, weight: 'bold' } },
                legend: { position: 'right' },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } }
            }
        }
    });

    // Table grouped by category
    let tableRows = '';
    cats.forEach(cat => {
        const c = categoryMap[cat];
        tableRows += `<tr style="background:#f0f4ff;"><td colspan="6" style="font-weight:700;font-size:14px;padding:12px;">${cat} (${c.items} items)</td></tr>`;
        c.itemsList.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            tableRows += `<tr><td style="padding-left:24px;">${item.name}</td><td>${item.sku || '-'}</td><td>${item.qty.toLocaleString()}</td><td>${formatCurrency(item.cost)}</td><td><strong>${formatCurrency(item.value)}</strong></td><td>${((item.value / (totalValue || 1)) * 100).toFixed(1)}%</td></tr>`;
        });
        tableRows += `<tr style="background:#f8f9fa;font-weight:600;"><td style="padding-left:24px;">Subtotal</td><td></td><td>${c.totalQty.toLocaleString()}</td><td></td><td><strong>${formatCurrency(c.totalValue)}</strong></td><td>${((c.totalValue / (totalValue || 1)) * 100).toFixed(1)}%</td></tr>`;
    });

    document.getElementById('tableContainer').innerHTML = cats.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Quantity</th><th>Unit Cost</th><th>Total Value</th><th>% of Total</th>
    </tr></thead><tbody>${tableRows}</tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">💰</div><div class="empty-report-title">No Valuation Data</div><div class="empty-report-text">No items found in inventory.</div></div>';
}

// ========== FIFO COST LOT TRACKING REPORT ==========
function generateFifoReport() {
    document.getElementById('reportTitle').textContent = '📊 FIFO Cost Lot Tracking';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('chartContainer2').style.display = 'none';

    // Build FIFO lots from purchases (product in) and sales (product out)
    const productIn = [];
    const productOut = [];

    // Purchases as product in
    (purchases || []).forEach(p => {
        if (p.items) {
            p.items.forEach(pi => {
                productIn.push({
                    date: p.date || p.created_at,
                    transaction: `PO: ${p.po_number || p.id}`,
                    receivedFrom: p.supplier_name || 'Supplier',
                    itemName: pi.item_name || pi.name || 'Item',
                    itemId: pi.item_id,
                    quantity: parseFloat(pi.quantity) || 0,
                    costPerUnit: parseFloat(pi.unit_price) || 0,
                    total: (parseFloat(pi.quantity) || 0) * (parseFloat(pi.unit_price) || 0)
                });
            });
        }
    });

    // Positive adjustments as product in
    adjustmentItems.filter(ai => parseFloat(ai.quantity_adjusted) > 0).forEach(ai => {
        productIn.push({
            date: ai.adjustment_date,
            transaction: `ADJ: ${ai.reference_number}`,
            receivedFrom: 'Adjustment',
            itemName: ai.item_name,
            itemId: ai.item_id,
            quantity: parseFloat(ai.quantity_adjusted),
            costPerUnit: parseFloat(ai.unit_cost) || 0,
            total: parseFloat(ai.quantity_adjusted) * (parseFloat(ai.unit_cost) || 0)
        });
    });

    // Sales as product out
    (sales || []).forEach(s => {
        if (s.items) {
            s.items.forEach(si => {
                productOut.push({
                    date: s.date || s.created_at,
                    transaction: `SO: ${s.id}`,
                    dispersedTo: s.customer_name || 'Customer',
                    itemName: si.item_name || si.name || 'Item',
                    itemId: si.item_id,
                    qtyDispersed: parseFloat(si.quantity) || 0
                });
            });
        }
    });

    // Negative adjustments as product out
    adjustmentItems.filter(ai => parseFloat(ai.quantity_adjusted) < 0).forEach(ai => {
        productOut.push({
            date: ai.adjustment_date,
            transaction: `ADJ: ${ai.reference_number}`,
            dispersedTo: 'Adjustment',
            itemName: ai.item_name,
            itemId: ai.item_id,
            qtyDispersed: Math.abs(parseFloat(ai.quantity_adjusted))
        });
    });

    productIn.sort((a, b) => new Date(a.date) - new Date(b.date));
    productOut.sort((a, b) => new Date(a.date) - new Date(b.date));

    const totalIn = productIn.reduce((s, p) => s + p.quantity, 0);
    const totalInValue = productIn.reduce((s, p) => s + p.total, 0);
    const totalOut = productOut.reduce((s, p) => s + p.qtyDispersed, 0);
    const balance = totalIn - totalOut;

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Product In</div><div class="summary-value" style="color:#51cf66;">${totalIn.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Total In Value</div><div class="summary-value">${formatCurrency(totalInValue)}</div></div>
    <div class="summary-card" style="border-left-color: #ff6b6b;"><div class="summary-label">Total Product Out</div><div class="summary-value" style="color:#ff6b6b;">${totalOut.toLocaleString()}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Balance</div><div class="summary-value">${balance.toLocaleString()}</div></div>`;

    // Build FIFO table matching the existing fifo-report.html layout
    const maxRows = Math.max(productIn.length, productOut.length);

    let tableBody = '';
    for (let i = 0; i < maxRows; i++) {
        const pIn = productIn[i];
        const pOut = productOut[i];
        tableBody += '<tr>';
        if (pIn) {
            tableBody += `<td>${formatDate(pIn.date)}</td><td>${pIn.transaction}</td><td>${pIn.receivedFrom}</td><td>${pIn.itemName}</td><td>${pIn.quantity.toLocaleString()}</td><td>${formatCurrency(pIn.costPerUnit)}</td><td><strong>${formatCurrency(pIn.total)}</strong></td>`;
        } else {
            tableBody += '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
        }
        if (pOut) {
            tableBody += `<td>${formatDate(pOut.date)}</td><td>${pOut.transaction}</td><td>${pOut.dispersedTo}</td><td>${pOut.qtyDispersed.toLocaleString()}</td>`;
        } else {
            tableBody += '<td></td><td></td><td></td><td></td>';
        }
        tableBody += '</tr>';
    }

    document.getElementById('tableContainer').innerHTML = maxRows > 0 ? `
    <table class="data-table">
      <thead>
        <tr style="background:#e8f0fe;">
          <th colspan="7" style="color:#4285f4;text-align:center;border-right:2px solid #4285f4;">PRODUCT IN</th>
          <th colspan="4" style="color:#666;text-align:center;">PRODUCT OUT</th>
        </tr>
        <tr>
          <th>Date</th><th>Transaction</th><th>Received From</th><th>Item Name</th><th>Quantity</th><th>Cost/Unit</th><th style="border-right:2px solid #4285f4;">Total</th>
          <th>Date</th><th>Transaction</th><th>Dispersed To</th><th>Qty Dispersed</th>
        </tr>
      </thead>
      <tbody>${tableBody}</tbody>
    </table>` : '<div class="empty-report"><div class="empty-report-icon">📊</div><div class="empty-report-title">No FIFO Data</div><div class="empty-report-text">No purchase or sales transactions found.</div></div>';
}

// ========== INVENTORY TURNOVER BY AMOUNT REPORT ==========
function generateTurnoverByAmountReport() {
    document.getElementById('reportTitle').textContent = '💹 Inventory Turnover by Amount';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('chartContainer2').style.display = 'none';

    const itemMap = {};
    (items || []).forEach(item => {
        itemMap[item.id] = {
            name: item.name, sku: item.sku || '-', category: item.group_name || item.category || '-',
            currentStock: parseFloat(item.stock_quantity) || 0,
            cost: parseFloat(item.purchase_cost) || 0,
            sellingPrice: parseFloat(item.selling_price) || 0,
            amountSold: 0, amountPurchased: 0, adjustmentValue: 0
        };
    });

    // Sales amounts
    (sales || []).forEach(sale => {
        if (sale.items) {
            sale.items.forEach(si => {
                if (itemMap[si.item_id]) {
                    itemMap[si.item_id].amountSold += (parseFloat(si.quantity) || 0) * (parseFloat(si.unit_price) || 0);
                }
            });
        }
    });

    // Purchase amounts
    (purchases || []).forEach(purchase => {
        if (purchase.items) {
            purchase.items.forEach(pi => {
                if (itemMap[pi.item_id]) {
                    itemMap[pi.item_id].amountPurchased += (parseFloat(pi.quantity) || 0) * (parseFloat(pi.unit_price) || 0);
                }
            });
        }
    });

    // Adjustment values
    adjustmentItems.forEach(ai => {
        if (itemMap[ai.item_id]) {
            itemMap[ai.item_id].adjustmentValue += parseFloat(ai.value_change || 0);
        }
    });

    const rows = Object.values(itemMap).filter(i => i.amountSold > 0 || i.amountPurchased > 0 || i.adjustmentValue !== 0);
    rows.forEach(r => {
        r.stockValue = r.currentStock * r.cost;
        r.turnoverAmount = r.amountSold;
        r.turnoverRate = r.stockValue > 0 ? (r.amountSold / r.stockValue).toFixed(2) : '0.00';
    });

    const totalSold = rows.reduce((s, r) => s + r.amountSold, 0);
    const totalPurchased = rows.reduce((s, r) => s + r.amountPurchased, 0);
    const totalAdjValue = rows.reduce((s, r) => s + r.adjustmentValue, 0);
    const totalStockVal = rows.reduce((s, r) => s + r.stockValue, 0);

    document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Sales Amount</div><div class="summary-value">${formatCurrency(totalSold)}</div></div>
    <div class="summary-card" style="border-left-color: #51cf66;"><div class="summary-label">Total Purchase Amount</div><div class="summary-value">${formatCurrency(totalPurchased)}</div></div>
    <div class="summary-card" style="border-left-color: #4c6ef5;"><div class="summary-label">Adjustment Value Impact</div><div class="summary-value" style="color:${totalAdjValue >= 0 ? '#51cf66' : '#ff6b6b'};">${formatCurrency(totalAdjValue)}</div></div>
    <div class="summary-card" style="border-left-color: #667eea;"><div class="summary-label">Current Stock Value</div><div class="summary-value">${formatCurrency(totalStockVal)}</div></div>`;

    // Chart
    const top10 = [...rows].sort((a, b) => b.amountSold - a.amountSold).slice(0, 10);
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(r => r.name.length > 18 ? r.name.substring(0, 18) + '...' : r.name),
            datasets: [
                { label: 'Sales Amount', data: top10.map(r => r.amountSold), backgroundColor: 'rgba(81,207,102,0.7)' },
                { label: 'Stock Value', data: top10.map(r => r.stockValue), backgroundColor: 'rgba(102,126,234,0.7)' },
                { label: 'Adjustment Value', data: top10.map(r => Math.abs(r.adjustmentValue)), backgroundColor: 'rgba(255,107,107,0.5)' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Top 10 Items by Sales Amount', font: { size: 16, weight: 'bold' } } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } }
        }
    });

    // Table
    document.getElementById('tableContainer').innerHTML = rows.length > 0 ? `
    <table class="data-table"><thead><tr>
      <th>Item Name</th><th>SKU</th><th>Sales Amount</th><th>Purchase Amount</th><th>Adjustment Value</th><th>Stock Value</th><th>Turnover Rate</th>
    </tr></thead><tbody>
    ${rows.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate)).map(r => `<tr>
      <td><strong>${r.name}</strong></td><td>${r.sku}</td>
      <td>${formatCurrency(r.amountSold)}</td>
      <td>${formatCurrency(r.amountPurchased)}</td>
      <td style="color:${r.adjustmentValue >= 0 ? '#51cf66' : '#ff6b6b'};font-weight:600;">${formatCurrency(r.adjustmentValue)}</td>
      <td>${formatCurrency(r.stockValue)}</td>
      <td><strong>${r.turnoverRate}x</strong></td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty-report"><div class="empty-report-icon">💹</div><div class="empty-report-title">No Turnover Data</div><div class="empty-report-text">No financial movement data available.</div></div>';
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

// ========== SALES BY ITEM REPORT ==========
async function generateSalesByItemReport() {
    document.getElementById('reportTitle').textContent = 'Sales by Item';
    document.getElementById('summaryCards').innerHTML = '';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('chartContainer2').style.display = 'none';

    // Get date range
    const fromDateEl = document.getElementById('filterFromDate');
    const toDateEl = document.getElementById('filterToDate');
    const fromDate = fromDateEl ? fromDateEl.value : '';
    const toDate = toDateEl ? toDateEl.value : '';

    // Format display dates
    const fromDisplay = fromDate ? new Date(fromDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const toDisplay = toDate ? new Date(toDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    // Fetch data from API
    let reportData = [];
    try {
        let url = '/api/sales/reports/sales-by-item';
        if (fromDate && toDate) {
            url += `?from=${fromDate}&to=${toDate}`;
        }
        const res = await fetch(url);
        if (res.ok) {
            reportData = await res.json();
        }
    } catch (e) {
        console.error('Error fetching sales by item:', e);
    }

    // Calculate totals
    let totalQty = 0;
    let totalAmt = 0;
    reportData.forEach(item => {
        totalQty += parseFloat(item.quantity_sold) || 0;
        totalAmt += parseFloat(item.total_amount) || 0;
    });

    // Build Zoho-style report
    const tableContainer = document.getElementById('tableContainer');
    tableContainer.innerHTML = `
    <div style="background:white; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;">
        <!-- Report Header -->
        <div style="text-align:center; padding:30px 24px 20px;">
            <div style="font-size:12px; color:#4285f4; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">SOLO</div>
            <div style="font-size:18px; font-weight:700; color:#333; margin-bottom:6px;">Sales by Item</div>
            <div style="font-size:13px; color:#666;">From <span style="color:#4285f4; font-weight:600;">${fromDisplay}</span> To <span style="color:#4285f4; font-weight:600;">${toDisplay}</span></div>
        </div>

        <!-- Report Table -->
        <table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr style="border-top:1px solid #e0e0e0; border-bottom:1px solid #e0e0e0;">
                    <th style="text-align:left; padding:12px 20px; font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px;">ITEM NAME ⇅</th>
                    <th style="text-align:left; padding:12px 16px; font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px;">SKU</th>
                    <th style="text-align:right; padding:12px 16px; font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px;">QUANTITY SOLD</th>
                    <th style="text-align:right; padding:12px 16px; font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px;">AMOUNT</th>
                    <th style="text-align:right; padding:12px 20px; font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px;">AVERAGE PRICE</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.length === 0 ? `
                    <tr><td colspan="5" style="text-align:center; padding:40px; color:#999; font-size:14px;">No sales data found for the selected period.</td></tr>
                ` : reportData.map(item => {
        const qty = parseFloat(item.quantity_sold) || 0;
        const amt = parseFloat(item.total_amount) || 0;
        const avg = parseFloat(item.average_price) || 0;
        return `
                        <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:14px 20px; font-size:13px; color:#333;">${item.item_name}</td>
                            <td style="padding:14px 16px; font-size:13px; color:#333;">${item.sku || ''}</td>
                            <td style="padding:14px 16px; font-size:13px; color:#4285f4; text-align:right;">${qty.toFixed(2)}</td>
                            <td style="padding:14px 16px; font-size:13px; color:#4285f4; text-align:right;">PHP${amt.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="padding:14px 20px; font-size:13px; color:#4285f4; text-align:right;">PHP${avg.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `;
    }).join('')}
                <!-- TOTAL ROW -->
                ${reportData.length > 0 ? `
                <tr style="border-top:2px solid #e0e0e0; background:#f9fafb;">
                    <td style="padding:14px 20px; font-size:13px; font-weight:700; color:#333;">Total</td>
                    <td style="padding:14px 16px;"></td>
                    <td style="padding:14px 16px; font-size:13px; font-weight:700; color:#333; text-align:right;">${totalQty.toFixed(2)}</td>
                    <td style="padding:14px 16px; font-size:13px; font-weight:700; color:#333; text-align:right;">PHP${totalAmt.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding:14px 20px;"></td>
                </tr>
                ` : ''}
            </tbody>
        </table>
    </div>
    `;
}
