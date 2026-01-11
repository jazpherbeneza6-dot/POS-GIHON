// Dashboard functionality

let currentStockedTab = 'quantity';

// Load dashboard data
async function loadDashboard() {
  await Promise.all([
    loadTopSelling(),
    loadTopStocked(),
    loadSalesSummary(),
    loadPurchaseSummary(),
    loadPendingActions()
  ]);
}

// Load top selling items
async function loadTopSelling() {
  try {
    const filter = document.getElementById('topSellingFilter')?.value || 'month';
    const items = await dashboardAPI.getTopSelling(filter);
    const container = document.getElementById('topSellingContent');

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💡</div>
          <div class="empty-state-text">You do not have any top selling items yet.</div>
        </div>
      `;
      return;
    }

    const html = `
      <ul class="top-selling-list">
        ${items.map(item => `
          <li class="top-selling-item">
            <div class="top-selling-info">
              <div class="top-selling-name">${item.name}</div>
              <div class="top-selling-details">SKU: ${item.sku || 'N/A'}</div>
            </div>
            <div class="top-selling-stats">
              <div class="top-selling-quantity">${item.total_quantity_sold || 0}</div>
              <div class="top-selling-revenue">${formatCurrency(item.total_revenue || 0)}</div>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading top selling items:', error);
    document.getElementById('topSellingContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">Error loading data</div>
      </div>
    `;
  }
}

// Load top stocked items
async function loadTopStocked() {
  try {
    const items = await dashboardAPI.getTopStocked(currentStockedTab);
    const container = document.getElementById('topStockedContent');

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💡</div>
          <div class="empty-state-text">No sales recorded during this period.</div>
        </div>
      `;
      return;
    }

    const html = `
      <ul class="stocked-list">
        ${items.map(item => `
          <li class="stocked-item">
            <div class="stocked-info">
              <div class="stocked-name">${item.name}</div>
              <div class="stocked-sku">SKU: ${item.sku || 'N/A'}</div>
            </div>
            <div class="stocked-stats">
              <div class="stocked-quantity">${item.stock_quantity || 0}</div>
              <div class="stocked-value">${formatCurrency(item.total_value || 0)}</div>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading top stocked items:', error);
    document.getElementById('topStockedContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">Error loading data</div>
      </div>
    `;
  }
}

// Store chart instance for cleanup
let salesTrendChart = null;

// Load sales summary
async function loadSalesSummary() {
  try {
    const filter = document.getElementById('salesSummaryFilter')?.value || 'month';

    // Fetch both summary and trend data
    const [summary, trendData] = await Promise.all([
      dashboardAPI.getSalesSummary(filter),
      dashboardAPI.getSalesTrend(filter)
    ]);

    const container = document.getElementById('salesSummaryContent');
    const completedOrders = summary.completed_orders ?? summary.total_sales ?? 0;

    const html = `
      <div class="sales-summary-layout">
        <div class="summary-stats-grid">
          <div class="summary-stat-card stat-sales">
            <div class="stat-label">Total Sales</div>
            <div class="stat-value">${summary.total_sales || 0}</div>
          </div>
          <div class="summary-stat-card stat-revenue">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value">${formatCurrency(summary.total_revenue || 0)}</div>
          </div>
          <div class="summary-stat-card stat-average">
            <div class="stat-label">Avg Order Value</div>
            <div class="stat-value">${formatCurrency(summary.average_sale || 0)}</div>
          </div>
          <div class="summary-stat-card stat-completed">
            <div class="stat-label">Completed Orders</div>
            <div class="stat-value">${completedOrders}</div>
          </div>
        </div>

        <div class="sales-trend-card">
          <div class="sales-trend-header">
            <div class="sales-trend-title">Sales Trend</div>
            <div class="trend-legend">
              <span class="legend-dot"></span>
              <span>Revenue</span>
            </div>
          </div>
          <div class="sales-trend-chart-container">
            <canvas id="salesTrendChart"></canvas>
          </div>
        </div>
      </div>
    `;
    container.innerHTML = html;

    // Render the chart
    renderSalesTrendChart(trendData, filter);
  } catch (error) {
    console.error('Error loading sales summary:', error);
  }
}

// Render sales trend chart
function renderSalesTrendChart(trendData, period) {
  const ctx = document.getElementById('salesTrendChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (salesTrendChart) {
    salesTrendChart.destroy();
    salesTrendChart = null;
  }

  // Prepare chart data
  const labels = trendData.map(item => item.label);
  const revenueData = trendData.map(item => parseFloat(item.total_revenue) || 0);

  // If no data, show empty state
  if (trendData.length === 0) {
    ctx.parentElement.innerHTML = `
      <div class="trend-empty-state">
        <div class="trend-grid-lines"></div>
        <div class="trend-empty-text">No sales data for this period</div>
      </div>
    `;
    return;
  }

  salesTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Revenue',
        data: revenueData,
        borderColor: '#4775F8',
        backgroundColor: function (context) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) {
            return 'rgba(71, 117, 248, 0.3)';
          }
          // Create gradient from blue to white/transparent
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(71, 117, 248, 0.5)');
          gradient.addColorStop(0.5, 'rgba(71, 117, 248, 0.25)');
          gradient.addColorStop(1, 'rgba(71, 117, 248, 0.02)');
          return gradient;
        },
        borderWidth: 4,
        fill: true,
        tension: 0.5,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(26, 31, 58, 0.9)',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function (context) {
              return '₱' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          display: false,
          grid: {
            display: false
          }
        },
        y: {
          display: false,
          beginAtZero: true,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Store purchase chart instance
let purchaseTrendChart = null;

// Load purchase summary
async function loadPurchaseSummary() {
  try {
    const filter = document.getElementById('purchaseSummaryFilter')?.value || 'month';

    // Fetch both summary and trend data
    const [summary, trendData] = await Promise.all([
      dashboardAPI.getPurchaseSummary(filter),
      dashboardAPI.getPurchaseTrend(filter)
    ]);

    const container = document.getElementById('purchaseSummaryContent');

    const html = `
      <div class="sales-summary-layout">
        <div class="summary-stats-grid">
          <div class="summary-stat-card stat-purchases">
            <div class="stat-label">Total Purchases</div>
            <div class="stat-value">${summary.total_purchases || 0}</div>
          </div>
          <div class="summary-stat-card stat-spent">
            <div class="stat-label">Total Spent</div>
            <div class="stat-value">${formatCurrency(summary.total_spent || 0)}</div>
          </div>
          <div class="summary-stat-card stat-avg-purchase">
            <div class="stat-label">Avg Order Value</div>
            <div class="stat-value">${formatCurrency(summary.average_purchase || 0)}</div>
          </div>
        </div>

        <div class="sales-trend-card">
          <div class="sales-trend-header">
            <div class="sales-trend-title">Purchase Trend</div>
            <div class="trend-legend">
              <span class="legend-dot purchase-legend"></span>
              <span>Spending</span>
            </div>
          </div>
          <div class="sales-trend-chart-container">
            <canvas id="purchaseTrendChart"></canvas>
          </div>
        </div>
      </div>
    `;
    container.innerHTML = html;

    // Render the chart
    renderPurchaseTrendChart(trendData, filter);
  } catch (error) {
    console.error('Error loading purchase summary:', error);
  }
}

// Render purchase trend chart
function renderPurchaseTrendChart(trendData, period) {
  const ctx = document.getElementById('purchaseTrendChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (purchaseTrendChart) {
    purchaseTrendChart.destroy();
    purchaseTrendChart = null;
  }

  // Prepare chart data
  const labels = trendData.map(item => item.label);
  const spendingData = trendData.map(item => parseFloat(item.total_spent) || 0);

  // If no data, show empty state
  if (trendData.length === 0) {
    ctx.parentElement.innerHTML = `
      <div class="trend-empty-state">
        <div class="trend-grid-lines"></div>
        <div class="trend-empty-text">No purchase data for this period</div>
      </div>
    `;
    return;
  }

  purchaseTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spending',
        data: spendingData,
        borderColor: '#51cf66',
        backgroundColor: function (context) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) {
            return 'rgba(81, 207, 102, 0.3)';
          }
          // Create gradient from green to white/transparent
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(81, 207, 102, 0.5)');
          gradient.addColorStop(0.5, 'rgba(81, 207, 102, 0.25)');
          gradient.addColorStop(1, 'rgba(81, 207, 102, 0.02)');
          return gradient;
        },
        borderWidth: 4,
        fill: true,
        tension: 0.5,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(26, 31, 58, 0.9)',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function (context) {
              return '₱' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          display: false,
          grid: {
            display: false
          }
        },
        y: {
          display: false,
          beginAtZero: true,
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Load pending actions
async function loadPendingActions() {
  try {
    const data = await dashboardAPI.getPendingActions();
    const container = document.getElementById('pendingActionsContent');

    const html = `
      <div class="pending-section">
        <div class="pending-section-title">🛒 SALES</div>
        <ul class="pending-list">
          <li class="pending-item">
            <span class="pending-label">Recent Sales (24h)</span>
            <span class="pending-value">${data.recentSales?.count || 0}</span>
          </li>
          <li class="pending-item">
            <span class="pending-label">Revenue (24h)</span>
            <span class="pending-value">${formatCurrency(data.recentSales?.total || 0)}</span>
          </li>
        </ul>
      </div>
      <div class="pending-section">
        <div class="pending-section-title">🛍️ PURCHASES</div>
        <ul class="pending-list">
          <li class="pending-item">
            <span class="pending-label">Recent Purchases (24h)</span>
            <span class="pending-value">${data.recentPurchases?.count || 0}</span>
          </li>
          <li class="pending-item">
            <span class="pending-label">Total (24h)</span>
            <span class="pending-value">${formatCurrency(data.recentPurchases?.total || 0)}</span>
          </li>
        </ul>
      </div>
      ${data.lowStockItems && data.lowStockItems.length > 0 ? `
        <div class="pending-section">
          <div class="pending-section-title">⚠️ LOW STOCK</div>
          <ul class="pending-list">
            ${data.lowStockItems.slice(0, 5).map(item => `
              <li class="pending-item pending-item-with-actions">
                <div class="pending-item-content">
                  <span class="pending-label">${item.name}</span>
                  <span class="pending-value">${item.stock_quantity}</span>
                </div>
                <div class="pending-item-actions">
                  <button class="btn-icon btn-edit" onclick="editLowStockItem(${item.id})" title="Edit Item">
                    ✏️ Edit
                  </button>
                  <button class="btn-icon btn-delete" onclick="deleteLowStockItem(${item.id})" title="Delete Item">
                    🗑️ Delete
                  </button>
                </div>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `;
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading pending actions:', error);
  }
}

// Switch tab
function switchTab(tab) {
  // Tab switching logic
  document.querySelectorAll('.stocked-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
}

// Switch stocked tab
function switchStockedTab(sort) {
  currentStockedTab = sort;
  document.querySelectorAll('.stocked-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadTopStocked();
}

// Edit low stock item
function editLowStockItem(itemId) {
  // Navigate to items page with the item pre-selected and edit modal open
  window.location.href = `/items.html?item_id=${itemId}&edit=true`;
}

// Delete low stock item
async function deleteLowStockItem(itemId) {
  if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
    return;
  }

  try {
    await itemsAPI.delete(itemId);
    showAlert('Item deleted successfully', 'success');
    // Reload pending actions to refresh the list
    loadPendingActions();
  } catch (error) {
    console.error('Error deleting item:', error);
    showAlert('Failed to delete item', 'error');
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('topSellingContent')) {
    loadDashboard();

    // Add filter change listeners
    const topSellingFilter = document.getElementById('topSellingFilter');
    if (topSellingFilter) {
      topSellingFilter.addEventListener('change', loadTopSelling);
    }

    const salesSummaryFilter = document.getElementById('salesSummaryFilter');
    if (salesSummaryFilter) {
      salesSummaryFilter.addEventListener('change', loadSalesSummary);
    }

    const purchaseSummaryFilter = document.getElementById('purchaseSummaryFilter');
    if (purchaseSummaryFilter) {
      purchaseSummaryFilter.addEventListener('change', loadPurchaseSummary);
    }
  }
});

