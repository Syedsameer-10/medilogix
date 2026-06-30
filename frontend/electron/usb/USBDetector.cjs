const { execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { USB_EVENTS } = require('./USBEvents.cjs');

class USBDetector extends EventEmitter {
  currentDevice = null;
  intervalId = null;
  knownDrives = new Map();
  pollIntervalMs;

  constructor(pollIntervalMs = 2500) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  start() {
    if (this.intervalId) {
      return;
    }

    void this.checkForDriveChanges();
    this.intervalId = setInterval(() => {
      void this.checkForDriveChanges();
    }, this.pollIntervalMs);
  }

  stop() {
    if (!this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  getStatus() {
    return {
      connected: Boolean(this.currentDevice),
      device: this.currentDevice,
    };
  }

  async checkForDriveChanges() {
    const nextDrives = await this.getWindowsDriveSnapshot();

    nextDrives.forEach((drive, driveLetter) => {
      if (!this.knownDrives.has(driveLetter) && drive.isRemovable) {
        this.currentDevice = this.toUSBDevice(drive, 'connected');
        this.emit(USB_EVENTS.CONNECTED, this.currentDevice);
      }
    });

    this.knownDrives.forEach((drive, driveLetter) => {
      if (!nextDrives.has(driveLetter) && this.currentDevice?.driveLetter === drive.driveLetter) {
        const disconnectedDevice = this.toUSBDevice(drive, 'disconnected');
        this.currentDevice = this.findFirstRemovableDrive(nextDrives);
        this.emit(USB_EVENTS.DISCONNECTED, disconnectedDevice);
      }
    });

    if (!this.currentDevice) {
      this.currentDevice = this.findFirstRemovableDrive(nextDrives);
      if (this.currentDevice) {
        this.emit(USB_EVENTS.CONNECTED, this.currentDevice);
      }
    }

    this.knownDrives = nextDrives;
    this.emit(USB_EVENTS.STATUS, this.getStatus());
  }

  findFirstRemovableDrive(drives) {
    const firstRemovableDrive = Array.from(drives.values()).find((drive) => drive.isRemovable);
    return firstRemovableDrive ? this.toUSBDevice(firstRemovableDrive, 'connected') : null;
  }

  toUSBDevice(drive, status) {
    return {
      ...drive,
      status,
    };
  }

  getWindowsDriveSnapshot() {
    if (process.platform !== 'win32') {
      return Promise.resolve(new Map());
    }

    const powershellScript = `
      $usbLetters = @{};
      Get-CimInstance Win32_DiskDrive |
        Where-Object { $_.InterfaceType -eq 'USB' } |
        ForEach-Object {
          Get-CimAssociatedInstance -InputObject $_ -ResultClassName Win32_DiskPartition |
            ForEach-Object {
              Get-CimAssociatedInstance -InputObject $_ -ResultClassName Win32_LogicalDisk |
                ForEach-Object { $usbLetters[$_.DeviceID] = $true }
            }
        };

      Get-CimInstance Win32_LogicalDisk |
        Where-Object { $_.DeviceID } |
        ForEach-Object {
          [pscustomobject]@{
            DeviceID = $_.DeviceID;
            VolumeName = $_.VolumeName;
            DriveType = [int]$_.DriveType;
            IsRemovable = ($_.DriveType -eq 2 -or $usbLetters.ContainsKey($_.DeviceID));
          }
        } |
        ConvertTo-Json -Compress
    `;

    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', powershellScript],
        { windowsHide: true },
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve(new Map());
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            const drives = Array.isArray(parsed) ? parsed : [parsed];
            const driveMap = new Map();

            drives.forEach((drive) => {
              if (!drive.DeviceID) {
                return;
              }

              const volumeLabel = drive.VolumeName || 'MEDILAB DEVICE';
              const driveLetter = `${drive.DeviceID}\\`;

              driveMap.set(driveLetter, {
                deviceName: volumeLabel,
                driveLetter,
                driveType: drive.DriveType ?? 0,
                isRemovable: Boolean(drive.IsRemovable),
                volumeLabel,
              });
            });

            resolve(driveMap);
          } catch {
            resolve(new Map());
          }
        },
      );
    });
  }
}

module.exports = { USBDetector };
