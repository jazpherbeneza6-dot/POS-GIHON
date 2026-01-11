// API communication layer

const API_BASE = '';

// Generic API call function
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const text = await response.text();

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const error = JSON.parse(text);
        errorMessage = error.error || error.message || 'Request failed';
      } catch (e) {
        errorMessage = text || 'Request failed';
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses
    if (!text) {
      return { success: true };
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: true, message: text };
    }
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Items API
const itemsAPI = {
  getAll: () => apiCall('/api/items'),
  getById: (id) => apiCall(`/api/items/${id}`),
  search: (query) => apiCall(`/api/items/search?q=${encodeURIComponent(query)}`),
  create: (data) => apiCall('/api/items', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/items/${id}`, {
    method: 'DELETE'
  }),
  getGroups: () => apiCall('/api/items/groups/list'),
  createGroup: (data) => apiCall('/api/items/groups', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

// Inventory API
const inventoryAPI = {
  stockIn: (data) => apiCall('/api/inventory/stock-in', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  stockOut: (data) => apiCall('/api/inventory/stock-out', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiCall(`/api/inventory/transactions?${query}`);
  },
  getStock: (itemId) => apiCall(`/api/inventory/stock/${itemId}`),
  adjust: (data) => apiCall('/api/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  transfer: (data) => apiCall('/api/inventory/transfer', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

// Warehouse API
const warehouseAPI = {
  getAll: () => apiCall('/api/warehouses'),
  getById: (id) => apiCall(`/api/warehouses/${id}`),
  create: (data) => apiCall('/api/warehouses', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/warehouses/${id}`, {
    method: 'DELETE'
  }),
  getStock: (id) => apiCall(`/api/warehouses/${id}/stock`)
};

// Batch API
const batchAPI = {
  getAll: () => apiCall('/api/batches'),
  getById: (id) => apiCall(`/api/batches/${id}`),
  create: (data) => apiCall('/api/batches', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/batches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/batches/${id}`, {
    method: 'DELETE'
  }),
  getByItem: (itemId) => apiCall(`/api/batches/item/${itemId}`)
};

// Sales API
const salesAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiCall(`/api/sales?${query}`);
  },
  getById: (id) => apiCall(`/api/sales/${id}`),
  create: (data) => apiCall('/api/sales', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/sales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/sales/${id}`, {
    method: 'DELETE'
  }),
  getReceipt: (id) => apiCall(`/api/sales/receipt/${id}`)
};

// Purchases API
const purchasesAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiCall(`/api/purchases?${query}`);
  },
  getById: (id) => apiCall(`/api/purchases/${id}`),
  create: (data) => apiCall('/api/purchases', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/purchases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/purchases/${id}`, {
    method: 'DELETE'
  })
};

// Suppliers API
const suppliersAPI = {
  getAll: () => apiCall('/api/suppliers'),
  getById: (id) => apiCall(`/api/suppliers/${id}`),
  create: (data) => apiCall('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/api/suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/api/suppliers/${id}`, {
    method: 'DELETE'
  })
};

// Dashboard API
const dashboardAPI = {
  getTopSelling: (period = 'month') => apiCall(`/api/dashboard/top-selling?period=${period}`),
  getTopStocked: (sort = 'quantity') => apiCall(`/api/dashboard/top-stocked?sort=${sort}`),
  getSalesSummary: (period = 'month') => apiCall(`/api/dashboard/sales-summary?period=${period}`),
  getSalesTrend: (period = 'month') => apiCall(`/api/dashboard/sales-trend?period=${period}`),
  getPurchaseSummary: (period = 'month') => apiCall(`/api/dashboard/purchase-summary?period=${period}`),
  getPurchaseTrend: (period = 'month') => apiCall(`/api/dashboard/purchase-trend?period=${period}`),
  getPendingActions: () => apiCall('/api/dashboard/pending-actions')
};

// Barcode API
const barcodeAPI = {
  scan: (code) => apiCall(`/api/barcode/scan/${code}`),
  generate: (data) => apiCall('/api/barcode/generate', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

