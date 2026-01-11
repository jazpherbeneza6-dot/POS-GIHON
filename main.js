const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Start the Express server
require('./server/server.js');

let mainWindow;

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        icon: path.join(__dirname, 'public/images/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        backgroundColor: '#f8f9fa'
    });

    // Remove the menu bar for cleaner look
    Menu.setApplicationMenu(null);

    // Load the app from the local server
    mainWindow.loadURL('http://localhost:4000');

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create window when Electron is ready
app.whenReady().then(() => {
    // Wait a moment for server to start
    setTimeout(createWindow, 1500);
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    app.quit();
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
