/**
 * Application Core Functions
 * Main application initialization and common functions
 */

// ==================== SIDEBAR FUNCTIONS ====================

/**
 * Toggle sidebar for mobile
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}

/**
 * Close sidebar
 */
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

/**
 * Toggle submenu
 * @param {HTMLElement} element - Submenu button element
 */
function toggleSubmenu(element) {
  if (element) {
    element.classList.toggle('expanded');
  }
}

/**
 * Show alert/toast notification
 * Uses the unified toast system from global-features.js
 * @param {string} message - Alert message
 * @param {string} type - Alert type (success, error, warning, info)
 */
function showAlert(message, type = 'info') {
  // Use the unified toast function from global-features.js
  if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    // Fallback if global-features.js not loaded
    console.warn('showToast not available, using console fallback');
    console[type === 'error' ? 'error' : 'log'](message);
  }
}

// ==================== MODAL HANDLERS ====================

/**
 * Close modal on outside click
 */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    closeAllModals();
  }
});

/**
 * Close modal on Escape key
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});

// ==================== INITIALIZATION ====================

/**
 * Initialize application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  // Close sidebar on mobile when clicking outside
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (window.innerWidth <= 768 && sidebar && overlay) {
      if (!e.target.closest('#sidebar') && 
          !e.target.closest('.sidebar-toggle') &&
          sidebar.classList.contains('open')) {
        closeSidebar();
      }
    }
  });
});


