// Barcode scanner using QuaggaJS

let scannerActive = false;
let scannerInstance = null;

// Initialize scanner
function initScanner() {
  if (typeof Quagga === 'undefined') {
    console.error('QuaggaJS not loaded');
    return;
  }

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector('#scanner-container'),
      constraints: {
        width: 640,
        height: 480,
        facingMode: "environment"
      }
    },
    decoder: {
      readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader"]
    }
  }, (err) => {
    if (err) {
      console.error('Scanner initialization error:', err);
      showAlert('Failed to initialize camera. Please check permissions.', 'error');
      return;
    }
    Quagga.start();
    scannerActive = true;
  });

  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    handleBarcodeScanned(code);
  });
}

// Start scanner
function startScanner() {
  const container = document.getElementById('scanner-container');
  if (!container) return;

  if (scannerActive) {
    stopScanner();
  }

  initScanner();
}

// Stop scanner
function stopScanner() {
  if (scannerActive && Quagga) {
    Quagga.stop();
    scannerActive = false;
  }
}

// Handle scanned barcode
async function handleBarcodeScanned(code) {
  stopScanner();
  
  try {
    const item = await barcodeAPI.scan(code);
    if (item && window.onBarcodeScanned) {
      window.onBarcodeScanned(item, code);
    } else {
      showAlert(`Item found: ${item.name}`, 'success');
    }
  } catch (error) {
    showAlert('Item not found for this barcode', 'error');
    // Restart scanner after a delay
    setTimeout(() => {
      if (!scannerActive) {
        startScanner();
      }
    }, 2000);
  }
}

// Manual barcode entry
function enterBarcodeManually() {
  const code = prompt('Enter barcode:');
  if (code) {
    handleBarcodeScanned(code);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopScanner();
});

