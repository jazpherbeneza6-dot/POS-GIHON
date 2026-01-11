/**
 * Global Notification System
 * Handles notification UI, storage, and logic across all pages.
 */

const notificationsState = {
    items: []
};

// Make functions available globally
window.toggleNotificationPanel = toggleNotificationPanel;
window.addNotification = addNotification;
window.markAsRead = markAsRead;
window.clearAllNotifications = clearAllNotifications;

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    if (panel && overlay) {
        const isOpening = !panel.classList.contains('active');
        panel.classList.toggle('active');
        overlay.classList.toggle('active');

        if (isOpening) {
            // Mark all as read when opening the panel
            let hasUnread = false;
            notificationsState.items.forEach(n => {
                if (!n.read) {
                    n.read = true;
                    hasUnread = true;
                }
            });

            if (hasUnread) {
                updateNotificationUI();
                saveNotifications();
            }
        }
    }
}

function addNotification(title, message, type = 'info', link = null) {
    // Don't add duplicate notifications (same title and message within 5 seconds)
    const recentDuplicate = notificationsState.items.find(n =>
        n.title === title &&
        n.message === message &&
        (Date.now() - new Date(n.time).getTime()) < 5000
    );

    if (recentDuplicate) {
        console.log('Duplicate notification ignored:', title);
        return;
    }

    // Determine link based on type if not provided
    let notificationLink = link;
    if (!notificationLink) {
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
        if (title.includes('Low Stock') || title.includes('low stock')) {
            notificationLink = '/items.html?filter=low-stock';
        } else if (title.includes('Pending') || title.includes('pending')) {
            notificationLink = '/sales.html?tab=pending';
        } else if (title.includes('Sale') || title.includes('sale')) {
            notificationLink = '/sales.html';
        } else if (title.includes('Purchase') || title.includes('purchase')) {
            notificationLink = '/purchases.html';
        } else {
            notificationLink = typeLinks[type] || '/';
        }
    }

    const notification = {
        id: Date.now(),
        title,
        message,
        type,
        link: notificationLink,
        time: new Date().toISOString(),
        read: false
    };

    notificationsState.items.unshift(notification);
    updateNotificationUI();
    saveNotifications();

    // Show badge animation if on current page
    const icon = document.querySelector('.header-icon.notification-icon');
    if (icon) {
        icon.classList.add('has-notification');
        setTimeout(() => icon.classList.remove('has-notification'), 2000);
    }
}

function loadNotifications() {
    const stored = localStorage.getItem('salesNotifications');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // Filter out old notifications (older than 7 days)
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            notificationsState.items = parsed.filter(n =>
                new Date(n.time).getTime() > oneWeekAgo
            );
            // Save back if we filtered any out
            if (notificationsState.items.length !== parsed.length) {
                saveNotifications();
            }
        } catch (e) {
            console.error('Failed to parse notifications', e);
            notificationsState.items = [];
            localStorage.removeItem('salesNotifications');
        }
    }
    updateNotificationUI();
}

function saveNotifications() {
    // Keep last 30 notifications only
    if (notificationsState.items.length > 30) {
        notificationsState.items = notificationsState.items.slice(0, 30);
    }
    localStorage.setItem('salesNotifications', JSON.stringify(notificationsState.items));
}

function clearAllNotifications() {
    notificationsState.items = [];
    saveNotifications();
    updateNotificationUI();
    toggleNotificationPanel(); // Close panel after clearing
}

function updateNotificationUI() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');

    // Count only unread notifications
    const unreadCount = notificationsState.items.filter(n => !n.read).length;

    // Update badge - only show if there are unread notifications
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }

    if (!list) return;

    if (notificationsState.items.length === 0) {
        list.innerHTML = `
            <div class="no-notifications">
                <span>🔔</span>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }

    // Add clear all button at top if there are notifications
    let clearButton = notificationsState.items.length > 0
        ? `<div style="padding: 8px 16px; text-align: right; border-bottom: 1px solid #f0f0f0;">
             <button onclick="clearAllNotifications()" style="background: none; border: none; color: #667eea; cursor: pointer; font-size: 12px; font-weight: 600;">Clear All</button>
           </div>`
        : '';

    list.innerHTML = clearButton + notificationsState.items.map(n => {
        const timeAgo = getTimeAgo(new Date(n.time));
        const readClass = n.read ? 'read' : 'unread';
        const icon = n.type === 'success' ? '✅' : n.type === 'error' ? '❌' : n.type === 'warning' ? '⚠️' : 'ℹ️';
        return `
            <div class="notification-item ${n.type} ${readClass}" onclick="handleNotificationClick(${n.id})">
                <div class="notification-item-icon">${icon}</div>
                <div class="notification-content">
                    <div class="notification-item-title">${n.title}</div>
                    <div class="notification-item-message">${n.message}</div>
                    <div class="notification-item-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
}

function markAsRead(id) {
    const notification = notificationsState.items.find(n => n.id === id);
    if (notification && !notification.read) {
        notification.read = true;
        updateNotificationUI();
        saveNotifications();
    }
}

// Handle notification click - navigate to link
function handleNotificationClick(id) {
    const notification = notificationsState.items.find(n => n.id === id);
    if (!notification) return;

    // Mark as read
    notification.read = true;
    updateNotificationUI();
    saveNotifications();

    // Close the notification panel
    toggleNotificationPanel();

    // Navigate if there's a link
    if (notification.link) {
        window.location.href = notification.link;
    } else {
        // Default navigation based on type
        const defaultLinks = {
            'low_stock': '/items.html?filter=low-stock',
            'sale': '/sales.html',
            'purchase': '/purchases.html',
            'pending_orders': '/sales.html?tab=pending',
            'cancelled': '/sales.html?tab=cancelled',
            'error': '/items.html',
            'warning': '/sales.html',
            'info': '/'
        };
        
        if (defaultLinks[notification.type]) {
            window.location.href = defaultLinks[notification.type];
        }
    }
}

// Make function globally available
window.handleNotificationClick = handleNotificationClick;

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// Initialize
function initNotificationsHelper() {
    // Load notifications
    loadNotifications();

    // Attach listeners
    const notificationIcon = document.getElementById('headerNotificationIcon') || document.querySelector('.header-icon.notification-icon');
    if (notificationIcon) {
        notificationIcon.style.cursor = 'pointer';

        // Remove old listeners by cloning
        const newIcon = notificationIcon.cloneNode(true);
        notificationIcon.parentNode.replaceChild(newIcon, notificationIcon);

        newIcon.addEventListener('click', toggleNotificationPanel);

        // Update UI again
        updateNotificationUI();
    }
}

// Run immediately if document is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initNotificationsHelper();
} else {
    document.addEventListener('DOMContentLoaded', initNotificationsHelper);
}

// Also listen for layoutReady
document.addEventListener('layoutReady', initNotificationsHelper);

