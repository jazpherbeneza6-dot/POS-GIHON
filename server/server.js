const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const database = require('./database');

const app = express();
const PORT = 4001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database
database.init().then(() => {
  console.log('Database initialized successfully');
}).catch(err => {
  console.error('Database initialization error:', err);
});

// API Routes
app.use('/api/items', require('./routes/items'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/purchase-receives', require('./routes/purchase-receives'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/barcode', require('./routes/barcode'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/manufacturers', require('./routes/manufacturers'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales-orders', require('./routes/sales-orders'));
app.use('/api/salespersons', require('./routes/salespersons'));
app.use('/api/delivery-methods', require('./routes/delivery-methods'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/sales-receipts', require('./routes/sales-receipts'));
app.use('/api/payments-received', require('./routes/payments-received'));
app.use('/api/payments-made', require('./routes/payments-made'));
app.use('/api/vendor-credits', require('./routes/vendor-credits'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/sales-returns', require('./routes/sales-returns'));
app.use('/api/bills', require('./routes/bills'));

// Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n========================================');
  console.log('Inventory Management System Started!');
  console.log('========================================');
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`LAN access:   http://${localIP}:${PORT}`);
  console.log('========================================\n');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;

