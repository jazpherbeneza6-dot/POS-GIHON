// Custom Alert Dialog System - Matching Design

class AlertDialog {
  constructor() {
    this.createDialogHTML();
  }

  createDialogHTML() {
    // Check if dialog already exists
    if (document.getElementById('alertOverlay')) return;

    const overlayHTML = `
      <div id="alertOverlay" class="alert-overlay">
        <div id="alertDialog" class="alert-dialog">
          <div class="alert-header">
            <h3 class="alert-title">
              <span class="alert-title-icon" id="alertTitleIcon"></span>
              <span id="alertTitle">Alert</span>
            </h3>
            <button class="alert-close-btn" id="alertCloseBtn">&times;</button>
          </div>
          <div class="alert-body">
            <div class="alert-body-icon" id="alertBodyIcon"></div>
            <p class="alert-message" id="alertMessage"></p>
            <p class="alert-order-number" id="alertOrderNumber"></p>
            <p class="alert-submessage" id="alertSubmessage"></p>
          </div>
          <div class="alert-footer" id="alertFooter">
            <button class="alert-btn alert-btn-cancel" id="alertCancel">Cancel</button>
            <button class="alert-btn alert-btn-confirm" id="alertConfirm">
              <span id="alertConfirmIcon"></span>
              <span id="alertConfirmText">OK</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', overlayHTML);

    // Add event listeners
    this.overlay = document.getElementById('alertOverlay');
    this.dialog = document.getElementById('alertDialog');
    this.cancelBtn = document.getElementById('alertCancel');
    this.confirmBtn = document.getElementById('alertConfirm');
    this.closeBtn = document.getElementById('alertCloseBtn');

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide(false);
      }
    });

    // Close button
    this.closeBtn.addEventListener('click', () => {
      this.hide(false);
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.hide(false);
      }
    });
  }

  show(options = {}) {
    const {
      type = 'confirm',
      title = 'Confirmation',
      titleIcon = '',
      message = '',
      orderNumber = '',
      submessage = '',
      confirmText = 'OK',
      confirmIcon = '',
      cancelText = 'Cancel',
      showCancel = true,
      onConfirm = () => { },
      onCancel = () => { }
    } = options;

    // Set content
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('alertSubmessage').textContent = submessage;
    document.getElementById('alertConfirmText').textContent = confirmText;
    document.getElementById('alertCancel').textContent = cancelText;

    // Order number
    const orderEl = document.getElementById('alertOrderNumber');
    orderEl.textContent = orderNumber;
    orderEl.style.display = orderNumber ? 'block' : 'none';

    // Set icons
    const titleIconMap = {
      confirm: '❓',
      success: '✅',
      warning: '⚠️',
      error: '🗑️'
    };

    const bodyIconMap = {
      confirm: '❓',
      success: '✅',
      warning: '⚠️',
      error: '⚠️'
    };

    document.getElementById('alertTitleIcon').textContent = titleIcon || titleIconMap[type] || '';
    document.getElementById('alertBodyIcon').textContent = bodyIconMap[type] || '⚠️';
    document.getElementById('alertConfirmIcon').textContent = confirmIcon;

    // Set dialog type class
    this.dialog.className = `alert-dialog ${type}`;

    // Show/hide cancel button
    this.cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';

    // Set up callbacks
    this.confirmCallback = onConfirm;
    this.cancelCallback = onCancel;

    // Remove old listeners and add new ones
    const newConfirmBtn = this.confirmBtn.cloneNode(true);
    const newCancelBtn = this.cancelBtn.cloneNode(true);
    this.confirmBtn.parentNode.replaceChild(newConfirmBtn, this.confirmBtn);
    this.cancelBtn.parentNode.replaceChild(newCancelBtn, this.cancelBtn);
    this.confirmBtn = newConfirmBtn;
    this.cancelBtn = newCancelBtn;

    this.confirmBtn.addEventListener('click', () => this.hide(true));
    this.cancelBtn.addEventListener('click', () => this.hide(false));

    // Show overlay
    this.overlay.classList.add('active');
  }

  hide(confirmed) {
    this.overlay.classList.remove('active');

    setTimeout(() => {
      if (confirmed && this.confirmCallback) {
        this.confirmCallback();
      } else if (!confirmed && this.cancelCallback) {
        this.cancelCallback();
      }
    }, 300);
  }

  // Accept sale confirmation
  confirmAccept(orderNumber, onConfirm, onCancel) {
    this.show({
      type: 'confirm',
      title: 'Accept Sale',
      titleIcon: '✅',
      message: 'Are you sure you want to accept this sale?',
      orderNumber: orderNumber,
      submessage: 'This will mark the sale as completed.',
      confirmText: 'Accept Sale',
      confirmIcon: '✅',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm,
      onCancel
    });
  }

  // Cancel sale confirmation
  confirmCancel(orderNumber, onConfirm, onCancel) {
    this.show({
      type: 'warning',
      title: 'Cancel Sale',
      titleIcon: '⚠️',
      message: 'Are you sure you want to cancel this sale?',
      orderNumber: orderNumber,
      submessage: 'This will mark the sale as cancelled.',
      confirmText: 'Cancel Sale',
      confirmIcon: '⚠️',
      cancelText: 'Keep Sale',
      showCancel: true,
      onConfirm,
      onCancel
    });
  }

  // Delete confirmation
  confirmDelete(orderNumber, onConfirm, onCancel) {
    this.show({
      type: 'error',
      title: 'Delete Sale',
      titleIcon: '🗑️',
      message: 'Are you sure you want to delete this sale?',
      orderNumber: orderNumber,
      submessage: 'This will permanently remove the record from the database.',
      confirmText: 'Delete Sale',
      confirmIcon: '🗑️',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm,
      onCancel
    });
  }

  // Generic confirm
  confirm(message, submessage = '', onConfirm, onCancel) {
    this.show({
      type: 'confirm',
      title: 'Confirmation Required',
      message,
      submessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm,
      onCancel
    });
  }

  // Success alert
  success(message, submessage = '', onConfirm) {
    this.show({
      type: 'success',
      title: 'Success',
      titleIcon: '✅',
      message,
      submessage,
      confirmText: 'Great!',
      showCancel: false,
      onConfirm
    });
  }

  // Warning alert
  warning(message, submessage = '', onConfirm, onCancel) {
    this.show({
      type: 'warning',
      title: 'Warning',
      titleIcon: '⚠️',
      message,
      submessage,
      confirmText: 'Proceed',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm,
      onCancel
    });
  }

  // Error alert
  error(message, submessage = '', onConfirm) {
    this.show({
      type: 'error',
      title: 'Error',
      titleIcon: '❌',
      message,
      submessage,
      confirmText: 'OK',
      showCancel: false,
      onConfirm
    });
  }
}

// Initialize global alert dialog
window.alertDialog = new AlertDialog();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AlertDialog;
}
