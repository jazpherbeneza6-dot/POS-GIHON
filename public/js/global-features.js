// Global Features: Search, Notifications, User Menu

// ==================== GLOBAL SEARCH ====================
let searchResults = [];
let searchTimeout = null;

// Initialize global search
function initializeGlobalSearch() {
    const searchInput = document.querySelector('.header .search-bar input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performGlobalSearch(e.target.value);
            }, 300); // Debounce 300ms
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performGlobalSearch(e.target.value);
            }
        });

        // Close search results on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-bar')) {
                closeSearchResults();
            }
        });
    }
}

// Perform global search
async function performGlobalSearch(query) {
    if (!query || query.trim().length < 2) {
        closeSearchResults();
        return;
    }

    try {
        // Search in items
        const items = await itemsAPI.search(query);

        searchResults = items.map(item => ({
            type: 'item',
            id: item.id,
            title: item.name,
            subtitle: `SKU: ${item.sku || 'N/A'} | Stock: ${item.stock_quantity || 0}`,
            icon: '📦',
            link: `/items.html?id=${item.id}`
        }));

        displaySearchResults();
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Display search results
function displaySearchResults() {
    let searchResultsContainer = document.getElementById('searchResults');

    if (!searchResultsContainer) {
        // Create search results container
        searchResultsContainer = document.createElement('div');
        searchResultsContainer.id = 'searchResults';
        searchResultsContainer.className = 'search-results-dropdown';

        const searchBar = document.querySelector('.search-bar');
        if (searchBar) {
            searchBar.appendChild(searchResultsContainer);
        }
    }

    if (searchResults.length === 0) {
        searchResultsContainer.innerHTML = `
      <div class="search-result-empty">
        <div style="font-size: 32px; opacity: 0.3; margin-bottom: 8px;">🔍</div>
        <div style="font-size: 14px; color: #868e96;">No results found</div>
      </div>
    `;
        searchResultsContainer.style.display = 'block';
        return;
    }

    searchResultsContainer.innerHTML = `
    <div class="search-results-header">
      <span>Search Results (${searchResults.length})</span>
      <button onclick="closeSearchResults()" style="background: none; border: none; cursor: pointer; color: #868e96;">✕</button>
    </div>
    <div class="search-results-list">
      ${searchResults.map(result => `
        <a href="${result.link}" class="search-result-item">
          <span class="search-result-icon">${result.icon}</span>
          <div class="search-result-content">
            <div class="search-result-title">${result.title}</div>
            <div class="search-result-subtitle">${result.subtitle}</div>
          </div>
        </a>
      `).join('')}
    </div>
  `;

    searchResultsContainer.style.display = 'block';
}

// Close search results
function closeSearchResults() {
    const searchResultsContainer = document.getElementById('searchResults');
    if (searchResultsContainer) {
        searchResultsContainer.style.display = 'none';
    }
}

// ==================== NOTIFICATIONS ====================
let notifications = [];

// Initialize notifications
function initializeNotifications() {
    loadNotifications();
    updateNotificationBadge();

    // Click handler for notification icon
    const notificationIcon = document.querySelector('.notification-icon');
    if (notificationIcon) {
        notificationIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotifications();
        });
    }

    // Close notifications on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.notification-dropdown') && !e.target.closest('.notification-icon')) {
            closeNotifications();
        }
    });

    // Check for new notifications periodically
    setInterval(checkForNotifications, 60000); // Every minute
}

// Load notifications
function loadNotifications() {
    // Load from localStorage or generate sample notifications
    const stored = localStorage.getItem('notifications');
    if (stored) {
        notifications = JSON.parse(stored);
    } else {
        notifications = generateSampleNotifications();
        saveNotifications();
    }
}

// Save notifications
function saveNotifications() {
    localStorage.setItem('notifications', JSON.stringify(notifications));
}

// Generate sample notifications
function generateSampleNotifications() {
    return [
        {
            id: 1,
            type: 'low_stock',
            title: 'Low Stock Alert',
            message: '5 items are running low on stock',
            icon: '⚠️',
            time: new Date().toISOString(),
            read: false,
            link: '/items.html?filter=low-stock'
        },
        {
            id: 2,
            type: 'sale',
            title: 'New Sale',
            message: 'Sale Order #1234 completed - $250.00',
            icon: '💰',
            time: new Date(Date.now() - 3600000).toISOString(),
            read: false,
            link: '/sales.html'
        },
        {
            id: 3,
            type: 'purchase',
            title: 'Purchase Delivered',
            message: 'PO #5678 has been delivered',
            icon: '📦',
            time: new Date(Date.now() - 7200000).toISOString(),
            read: false,
            link: '/purchases.html'
        }
    ];
}

// Check for new notifications
async function checkForNotifications() {
    try {
        // Check for low stock items
        const items = await itemsAPI.getAll();
        const lowStockItems = items.filter(item =>
            (item.stock_quantity || 0) <= (item.reorder_point || 10) &&
            (item.stock_quantity || 0) > 0
        );

        if (lowStockItems.length > 0) {
            // Check if we already have a low stock notification
            const hasLowStockNotif = notifications.some(n =>
                n.type === 'low_stock' && !n.read
            );

            if (!hasLowStockNotif) {
                addNotification({
                    type: 'low_stock',
                    title: 'Low Stock Alert',
                    message: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low on stock`,
                    icon: '⚠️',
                    link: '/items.html?filter=low-stock'
                });
            }
        }
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

// Add notification - supports both formats:
// 1. Object format: addNotification({title, message, type, link, icon})
// 2. Simple format: addNotification(title, message, type)
function addNotification(titleOrNotif, message, type = 'info') {
    let notificationData;
    
    // Check if first argument is an object (object format)
    if (typeof titleOrNotif === 'object' && titleOrNotif !== null && !Array.isArray(titleOrNotif)) {
        // Object format
        notificationData = {
            id: Date.now(),
            ...titleOrNotif,
            time: new Date().toISOString(),
            read: false
        };
    } else {
        // Simple format: (title, message, type)
        const title = titleOrNotif;
        
        // Determine link based on type and title
        let link = null;
        const typeLinks = {
            'low_stock': '/items.html?filter=low-stock',
            'sale': '/sales.html',
            'purchase': '/purchases.html',
            'pending_orders': '/sales.html?tab=pending',
            'cancelled': '/sales.html?tab=cancelled',
            'error': '/items.html',
            'warning': '/sales.html',
            'info': '/'
        };
        
        // Map common notification titles to links
        if (title && typeof title === 'string') {
            if (title.includes('Low Stock') || title.includes('low stock')) {
                link = '/items.html?filter=low-stock';
            } else if (title.includes('Pending') || title.includes('pending')) {
                link = '/sales.html?tab=pending';
            } else if (title.includes('Sale') || title.includes('sale')) {
                link = '/sales.html';
            } else if (title.includes('Purchase') || title.includes('purchase')) {
                link = '/purchases.html';
            } else {
                link = typeLinks[type] || '/';
            }
        } else {
            link = typeLinks[type] || '/';
        }
        
        // Determine icon based on type
        const iconMap = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        
        notificationData = {
            id: Date.now(),
            title: title,
            message: message || title,
            type: type,
            icon: iconMap[type] || 'ℹ️',
            link: link,
            time: new Date().toISOString(),
            read: false
        };
    }
    
    // Ensure link is set based on type if not provided
    if (!notificationData.link) {
        const typeLinks = {
            'low_stock': '/items.html?filter=low-stock',
            'sale': '/sales.html',
            'purchase': '/purchases.html',
            'pending_orders': '/sales.html?tab=pending',
            'cancelled': '/sales.html?tab=cancelled',
            'error': '/items.html',
            'warning': '/sales.html',
            'info': '/'
        };
        notificationData.link = typeLinks[notificationData.type] || '/';
    }

    notifications.unshift(notificationData);

    // Keep only last 50 notifications
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }

    saveNotifications();
    updateNotificationBadge();
}

// Expose addNotification globally
window.addNotification = addNotification;

// Update notification badge
function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    let badge = document.getElementById('notificationBadge');

    if (!badge) {
        const notificationIcon = document.querySelector('.notification-icon');
        if (notificationIcon) {
            badge = document.createElement('span');
            badge.id = 'notificationBadge';
            badge.className = 'notification-badge';
            notificationIcon.style.position = 'relative';
            notificationIcon.appendChild(badge);
        }
    }

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Toggle notifications dropdown
function toggleNotifications() {
    let dropdown = document.getElementById('notificationDropdown');

    if (!dropdown) {
        dropdown = createNotificationDropdown();
    }

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        renderNotifications();
    }
}

// Close notifications
function closeNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// Create notification dropdown
function createNotificationDropdown() {
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdown';
    dropdown.className = 'notification-dropdown';

    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        headerRight.appendChild(dropdown);
    }

    return dropdown;
}

// Render notifications
function renderNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;

    if (notifications.length === 0) {
        dropdown.innerHTML = `
      <div class="notification-header">
        <span>Notifications</span>
      </div>
      <div class="notification-empty">
        <div style="font-size: 48px; opacity: 0.3; margin-bottom: 12px;">🔔</div>
        <div style="font-size: 14px; color: #868e96;">No notifications</div>
      </div>
    `;
        return;
    }

    const unreadCount = notifications.filter(n => !n.read).length;

    dropdown.innerHTML = `
    <div class="notification-header">
      <span>Notifications (${unreadCount} unread)</span>
      ${unreadCount > 0 ? `
        <button onclick="markAllAsRead()" class="mark-all-read-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Mark all as read</span>
        </button>
      ` : ''}
    </div>
    <div class="notification-list">
      ${notifications.map(notif => `
        <div class="notification-item ${notif.read ? 'read' : ''}" 
          onclick="handleNotificationClick(${notif.id})">
          <div class="notification-item-icon">${notif.icon}</div>
          <div class="notification-content">
            <div class="notification-title">${notif.title}</div>
            <div class="notification-message">${notif.message}</div>
            <div class="notification-time">${getTimeAgo(notif.time)}</div>
          </div>
          ${!notif.read ? '<div class="notification-unread-dot"></div>' : ''}
        </div>
      `).join('')}
    </div>
    <div class="notification-footer">
      <button onclick="clearAllNotifications()" class="clear-all-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>Clear All</span>
      </button>
    </div>
  `;
}

// Handle notification click
function handleNotificationClick(notifId) {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;

    // Mark as read
    notif.read = true;
    saveNotifications();
    updateNotificationBadge();
    
    // Close the dropdown
    closeNotifications();

    // Navigate if there's a link
    if (notif.link) {
        window.location.href = notif.link;
    } else {
        // Default navigation based on notification type
        const defaultLinks = {
            'low_stock': '/items.html?filter=low-stock',
            'sale': '/sales.html',
            'purchase': '/purchases.html',
            'pending_orders': '/sales.html?tab=pending',
            'cancelled': '/sales.html?tab=cancelled'
        };
        
        if (defaultLinks[notif.type]) {
            window.location.href = defaultLinks[notif.type];
        }
    }
}

// Mark all as read
function markAllAsRead() {
    notifications.forEach(n => n.read = true);
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
}

// Clear all notifications
function clearAllNotifications() {
    if (confirm('Are you sure you want to clear all notifications?')) {
        notifications = [];
        saveNotifications();
        updateNotificationBadge();
        renderNotifications();
    }
}

// Get time ago string
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric'
    }).format(date);
}

// ==================== USER MENU ====================

// Initialize user menu
function initializeUserMenu() {
    const userProfile = document.querySelector('.user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleUserMenu();
        });
    }

    // Close user menu on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-menu-dropdown') && !e.target.closest('.user-profile')) {
            closeUserMenu();
        }
    });
}

// Toggle user menu
function toggleUserMenu() {
    let dropdown = document.getElementById('userMenuDropdown');

    if (!dropdown) {
        dropdown = createUserMenuDropdown();
    }

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
}

// Close user menu
function closeUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// Create user menu dropdown
function createUserMenuDropdown() {
    const dropdown = document.createElement('div');
    dropdown.id = 'userMenuDropdown';
    dropdown.className = 'user-menu-dropdown';

    dropdown.innerHTML = `
    <div class="user-menu-header">
      <div class="user-menu-avatar">OM</div>
      <div class="user-menu-info">
        <div class="user-menu-name">Operations Manager</div>
        <div class="user-menu-email">admin@gihon.com</div>
      </div>
    </div>
    <div class="user-menu-divider"></div>
    <div class="user-menu-items">
      <a href="/profile.html" class="user-menu-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Profile</span>
      </a>
      <a href="/preferences.html" class="user-menu-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
        </svg>
        <span>Preferences</span>
      </a>
    </div>
    <div class="user-menu-divider"></div>
    <div class="user-menu-items">
      <a href="#" onclick="handleLogout(event)" class="user-menu-item logout">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        <span>Logout</span>
      </a>
    </div>
  `;

    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        headerRight.appendChild(dropdown);
    }

    return dropdown;
}

// Handle logout
function handleLogout(event) {
    event.preventDefault();
    if (confirm('Are you sure you want to logout?')) {
        // Clear any stored session data
        localStorage.removeItem('userSession');
        // Redirect to login page
        window.location.href = '/login.html';
    }
}

// ==================== INITIALIZATION ====================

// Initialize all global features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeGlobalSearch();
    initializeNotifications();
    initializeUserMenu();
});

// ==================== TOAST NOTIFICATIONS ====================

// Track active toasts to prevent duplicates
const activeToasts = new Set();
// Track recent toasts with timestamps for cooldown period
const recentToasts = new Map();

function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container') || createToastContainer();
    
    // Create a unique identifier for this toast (message + type)
    const toastId = `${type}-${message}`;
    const now = Date.now();
    
    // Check if a toast with the same message and type already exists in memory
    if (activeToasts.has(toastId)) {
        // If toast already exists, don't create a duplicate
        return;
    }
    
    // Check cooldown period (prevent same toast within 1 second)
    if (recentToasts.has(toastId)) {
        const lastShown = recentToasts.get(toastId);
        if (now - lastShown < 1000) {
            // Too soon, ignore this toast
            return;
        }
    }
    
    // Check if toast exists in DOM
    const existingToast = container.querySelector(`[data-toast-id="${toastId}"]`);
    if (existingToast) {
        // If toast already exists in DOM, don't create a duplicate
        // Update the timestamp
        recentToasts.set(toastId, now);
        return;
    }
    
    // Mark as active immediately to prevent race conditions (synchronous)
    activeToasts.add(toastId);
    recentToasts.set(toastId, now);
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('data-toast-id', toastId);

    const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const titleMap = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };

    toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || 'ℹ️'}</div>
    <div class="toast-content">
      <div class="toast-title">${title || titleMap[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
            // Remove from active toasts set when toast is removed
            activeToasts.delete(toastId);
            // Clean up old recent toast entries (older than 5 seconds)
            if (recentToasts.has(toastId)) {
                setTimeout(() => {
                    recentToasts.delete(toastId);
                }, 5000);
            }
        }, 300);
    }, 5000);
    
    // Also remove from set when manually closed
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            toast.remove();
            activeToasts.delete(toastId);
            // Clean up recent toast entry
            setTimeout(() => {
                recentToasts.delete(toastId);
            }, 1000);
        };
    }
}

function createToastContainer() {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
    return div;
}

// Override global alert
window.showAlert = (msg, type) => showToast(msg, type || 'info');
window.showToast = showToast;
