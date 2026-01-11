/**
 * Utility Functions
 * Centralized utility functions used across the application
 */

// ==================== FORMATTING UTILITIES ====================

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'PHP')
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: currency
  }).format(amount || 0);
}

/**
 * Format date string
 * @param {string|Date} dateString - Date to format
 * @param {object} options - Formatting options
 * @returns {string} Formatted date string
 */
function formatDate(dateString, options = {}) {
  const date = new Date(dateString);
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(date);
}

/**
 * Format number with commas
 * @param {number|string} value - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(value) {
  if (!value) return '0';
  return parseFloat(value).toLocaleString('en-US');
}

/**
 * Parse formatted number (remove commas)
 * @param {string} value - Formatted number string
 * @returns {number} Parsed number
 */
function parseFormattedNumber(value) {
  if (!value) return 0;
  return parseFloat(value.toString().replace(/,/g, '')) || 0;
}

/**
 * Format number input with commas as user types
 * @param {HTMLInputElement} input - Input element
 */
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

// ==================== VALIDATION UTILITIES ====================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
function isValidPhone(phone) {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

/**
 * Validate required fields
 * @param {object} data - Data object to validate
 * @param {array} requiredFields - Array of required field names
 * @returns {object} { valid: boolean, errors: array }
 */
function validateRequired(data, requiredFields) {
  const errors = [];
  requiredFields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push(`${field} is required`);
    }
  });
  return {
    valid: errors.length === 0,
    errors
  };
}

// ==================== DOM UTILITIES ====================

/**
 * Create element with attributes
 * @param {string} tag - HTML tag name
 * @param {object} attributes - Element attributes
 * @param {string} content - Element content
 * @returns {HTMLElement} Created element
 */
function createElement(tag, attributes = {}, content = '') {
  const element = document.createElement(tag);
  Object.keys(attributes).forEach(key => {
    if (key === 'className') {
      element.className = attributes[key];
    } else if (key === 'textContent') {
      element.textContent = attributes[key];
    } else {
      element.setAttribute(key, attributes[key]);
    }
  });
  if (content) {
    element.innerHTML = content;
  }
  return element;
}

/**
 * Show loading state
 * @param {HTMLElement} element - Element to show loading in
 */
function showLoading(element) {
  if (!element) return;
  element.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading...</div>
    </div>
  `;
}

/**
 * Show empty state
 * @param {HTMLElement} element - Element to show empty state in
 * @param {string} message - Empty state message
 * @param {string} icon - Icon emoji
 */
function showEmptyState(element, message = 'No data available', icon = '📭') {
  if (!element) return;
  element.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-text">${message}</div>
    </div>
  `;
}

/**
 * Show error state
 * @param {HTMLElement} element - Element to show error in
 * @param {string} message - Error message
 */
function showErrorState(element, message = 'Failed to load data') {
  if (!element) return;
  element.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-text">${message}</div>
    </div>
  `;
}

// ==================== ARRAY UTILITIES ====================

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ==================== TIME UTILITIES ====================

/**
 * Get time ago string
 * @param {string|Date} dateString - Date to calculate from
 * @returns {string} Time ago string
 */
function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return formatDate(date, {
    month: 'short',
    day: 'numeric'
  });
}

// ==================== MODAL UTILITIES ====================

/**
 * Open modal
 * @param {string} modalId - Modal element ID
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close modal
 * @param {string} modalId - Modal element ID
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Close all modals
 */
function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(modal => {
    modal.classList.remove('active');
  });
  document.body.style.overflow = '';
}

// ==================== EXPORT UTILITIES ====================

/**
 * Export data to CSV
 * @param {array} data - Data array
 * @param {string} filename - Filename
 */
function exportToCSV(data, filename = 'export.csv') {
  if (!data || data.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header] || '';
      return `"${value.toString().replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== STORAGE UTILITIES ====================

/**
 * Save to localStorage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

/**
 * Get from localStorage
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Stored value or default
 */
function getFromStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return defaultValue;
  }
}

/**
 * Remove from localStorage
 * @param {string} key - Storage key
 */
function removeFromStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
}

// ==================== EXPORT TO GLOBAL SCOPE ====================

// Make functions available globally
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatNumber = formatNumber;
window.parseFormattedNumber = parseFormattedNumber;
window.formatNumberInput = formatNumberInput;
window.isValidEmail = isValidEmail;
window.isValidPhone = isValidPhone;
window.validateRequired = validateRequired;
window.createElement = createElement;
window.showLoading = showLoading;
window.showEmptyState = showEmptyState;
window.showErrorState = showErrorState;
window.debounce = debounce;
window.throttle = throttle;
window.getTimeAgo = getTimeAgo;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.exportToCSV = exportToCSV;
window.saveToStorage = saveToStorage;
window.getFromStorage = getFromStorage;
window.removeFromStorage = removeFromStorage;


