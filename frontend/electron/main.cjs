const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { ImportQueue } = require('./parser/ImportQueue.cjs');
const { USBDetector } = require('./usb/USBDetector.cjs');
const { USB_EVENTS, USB_IPC_CHANNELS } = require('./usb/USBEvents.cjs');

const rendererUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const usbDetector = new USBDetector();
const importQueue = new ImportQueue();

function broadcastToRenderer(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function openExternalUrl(url) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    return;
  }

  if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:') {
    void shell.openExternal(parsedUrl.toString());
  }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    minHeight: 720,
    minWidth: 1180,
    show: false,
    title: 'MediLogiX',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle(USB_IPC_CHANNELS.GET_STATUS, () => usbDetector.getStatus());
  ipcMain.handle(USB_IPC_CHANNELS.IMPORT_TXT_FILES, async () => {
    const status = usbDetector.getStatus();

    if (!status.device?.driveLetter) {
      return {
        errors: [{ fileName: 'USB Device', message: 'No removable USB drive connected' }],
        records: [],
        txtFilesFound: 0,
      };
    }

    return importQueue.importFromDrive(status.device.driveLetter);
  });

  usbDetector.on(USB_EVENTS.CONNECTED, (device) => {
    broadcastToRenderer(USB_EVENTS.CONNECTED, device);
  });

  usbDetector.on(USB_EVENTS.DISCONNECTED, (device) => {
    broadcastToRenderer(USB_EVENTS.DISCONNECTED, device);
  });

  usbDetector.on(USB_EVENTS.STATUS, (status) => {
    broadcastToRenderer(USB_EVENTS.STATUS, status);
  });

  usbDetector.start();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  usbDetector.stop();
});
