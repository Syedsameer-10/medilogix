import path from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { ImportQueue } from './parser/ImportQueue';
import { MedilogixApiServer } from './server/ApiServer';
import { loadEnvFile } from './server/Env';
import { USBDetector } from './usb/USBDetector';
import { USB_EVENTS, USB_IPC_CHANNELS } from './usb/USBEvents';

const appRoot = app.isPackaged ? path.join(__dirname, '..', '..') : path.join(__dirname, '..', '..', '..');
const frontendRoot = app.isPackaged ? appRoot : path.join(appRoot, 'frontend');
const backendRoot = app.isPackaged ? path.join(appRoot, 'backend') : path.join(appRoot, 'backend');
const iconPath = path.join(frontendRoot, 'build', 'icon.ico');
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const usbDetector = new USBDetector();
const importQueue = new ImportQueue();
let apiServer: MedilogixApiServer | null = null;

function broadcastToRenderer(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    minHeight: 720,
    minWidth: 1180,
    show: false,
    title: 'MediLogiX',
    icon: iconPath,
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
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(frontendRoot, 'dist', 'index.html'));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  if (!app.isPackaged) {
    loadEnvFile(path.join(frontendRoot, '.env'));
    loadEnvFile(path.join(backendRoot, '.env'));
    apiServer = new MedilogixApiServer();
    await apiServer.start();
  }

  ipcMain.handle('api:get-base-url', () => apiServer?.getBaseUrl() ?? '');
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
}).catch((error: unknown) => {
  console.error('[MediLogiX] Failed to start Electron app', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  usbDetector.stop();
  void apiServer?.stop();
});
