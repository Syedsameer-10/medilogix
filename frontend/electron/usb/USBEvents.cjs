const USB_EVENTS = {
  CONNECTED: 'usb-connected',
  DISCONNECTED: 'usb-disconnected',
  STATUS: 'usb-status',
};

const USB_IPC_CHANNELS = {
  GET_STATUS: 'usb:get-status',
  IMPORT_TXT_FILES: 'usb:import-txt-files',
};

module.exports = { USB_EVENTS, USB_IPC_CHANNELS };
