// Barcode generation using JsBarcode

// Generate barcode SVG
function generateBarcodeSVG(code, format = 'CODE128') {
  if (typeof JsBarcode === 'undefined') {
    console.error('JsBarcode not loaded');
    return null;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: format,
    width: 2,
    height: 50,
    displayValue: true
  });
  return svg;
}

// Generate barcode image
function generateBarcodeImage(code, format = 'CODE128') {
  const svg = generateBarcodeSVG(code, format);
  if (!svg) return null;

  const svgString = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  return url;
}

// Display barcode in element
function displayBarcode(elementId, code, format = 'CODE128') {
  const element = document.getElementById(elementId);
  if (!element) return;

  const svg = generateBarcodeSVG(code, format);
  if (svg) {
    element.innerHTML = '';
    element.appendChild(svg);
  }
}

// Download barcode as image
function downloadBarcode(code, format = 'CODE128', filename = 'barcode') {
  const url = generateBarcodeImage(code, format);
  if (!url) return;

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.svg`;
  link.click();
  
  URL.revokeObjectURL(url);
}

