const { contextBridge, ipcRenderer } = require('electron');

const usbChannels = {
  connected: 'usb-connected',
  disconnected: 'usb-disconnected',
  status: 'usb-status',
};

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('medilogix', {
  app: {
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
  usb: {
    getStatus: () => ipcRenderer.invoke('usb:get-status'),
    importTxtFiles: () => ipcRenderer.invoke('usb:import-txt-files'),
    onConnected: (callback) => subscribe(usbChannels.connected, callback),
    onDisconnected: (callback) => subscribe(usbChannels.disconnected, callback),
    onStatus: (callback) => subscribe(usbChannels.status, callback),
  },
});
