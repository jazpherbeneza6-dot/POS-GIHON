/**
 * Global Toast Notification System
 * Loaded via layout.js — available on every page as window.showToast(message, type)
 */
(function () {
    // Inject CSS once
    const style = document.createElement('style');
    style.textContent = `
        .gihon-toast-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
        }
        .gihon-toast {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            font-family: 'Inter', -apple-system, sans-serif;
            color: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.18);
            pointer-events: auto;
            animation: gihonToastIn 0.3s ease;
            max-width: 480px;
            line-height: 1.4;
        }
        .gihon-toast.success { background: #16a34a; }
        .gihon-toast.error   { background: #dc2626; }
        .gihon-toast.info    { background: #2563eb; }
        .gihon-toast.warning { background: #d97706; }
        .gihon-toast-icon {
            flex-shrink: 0;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .gihon-toast-icon svg { width: 18px; height: 18px; }
        .gihon-toast-msg { flex: 1; }
        .gihon-toast-close {
            flex-shrink: 0;
            background: none;
            border: none;
            color: rgba(255,255,255,0.7);
            font-size: 18px;
            cursor: pointer;
            padding: 0 0 0 8px;
            line-height: 1;
        }
        .gihon-toast-close:hover { color: #fff; }
        .gihon-toast.removing {
            opacity: 0;
            transform: translateY(-12px);
            transition: opacity 0.25s ease, transform 0.25s ease;
        }
        @keyframes gihonToastIn {
            from { opacity: 0; transform: translateY(-16px); }
            to   { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // SVG icons per type
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
        error:   '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info:    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    // Lazy-create container
    function getContainer() {
        let c = document.getElementById('gihonToastContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'gihonToastContainer';
            c.className = 'gihon-toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    /**
     * Show a toast notification.
     * @param {string} message - The message to display
     * @param {string} [type='success'] - 'success' | 'error' | 'info' | 'warning'
     * @param {number} [duration=3000] - Auto-dismiss in ms
     */
    window.showToast = function (message, type, duration) {
        type = type || 'success';
        duration = duration || 3000;
        if (!['success','error','info','warning'].includes(type)) type = 'success';

        const container = getContainer();
        const toast = document.createElement('div');
        toast.className = 'gihon-toast ' + type;
        toast.innerHTML =
            '<span class="gihon-toast-icon">' + (icons[type] || icons.success) + '</span>' +
            '<span class="gihon-toast-msg">' + message + '</span>' +
            '<button class="gihon-toast-close" onclick="this.parentElement.classList.add(\'removing\');setTimeout(()=>this.parentElement.remove(),250)">&times;</button>';
        container.appendChild(toast);

        // Auto-dismiss
        setTimeout(function () {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(function () { toast.remove(); }, 250);
            }
        }, duration);
    };

    // Also expose showVendorToast as alias (backward compat)
    window.showVendorToast = window.showToast;
})();
