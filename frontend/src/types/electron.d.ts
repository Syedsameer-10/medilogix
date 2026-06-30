export {};

type UsbConnectionStatus = 'connected' | 'disconnected';

interface USBDeviceInfo {
  deviceName: string;
  driveType: number;
  driveLetter: string;
  isRemovable: boolean;
  status: UsbConnectionStatus;
  volumeLabel: string;
}

interface USBStatusPayload {
  connected: boolean;
  device: USBDeviceInfo | null;
}

interface PatientImportRecord {
  id: string;
  patientName: '';
  gender: '';
  age: '';
  caseHistory: '';
  description: '';
  testDate: string;
  testDuration: string;
  peakPsi: number;
  averagePsi: number;
  minimumPsi: number;
  sampleCount: number;
  importedAt: string;
  status: 'Pending';
  samples: Array<{ timestamp: string; psi: number }>;
}

interface PatientImportResult {
  errors: Array<{ fileName: string; message: string }>;
  records: PatientImportRecord[];
  txtFilesFound: number;
}

declare global {
  interface Window {
    medilogix?: {
      app: {
        getPlatform: () => Promise<string>;
        getVersion: () => Promise<string>;
      };
      usb: {
        getStatus: () => Promise<USBStatusPayload>;
        importTxtFiles: () => Promise<PatientImportResult>;
        onConnected: (callback: (device: USBDeviceInfo) => void) => () => void;
        onDisconnected: (callback: (device: USBDeviceInfo) => void) => () => void;
        onStatus: (callback: (status: USBStatusPayload) => void) => () => void;
      };
    };
  }
}
