/// <reference path="../types/bluetooth.d.ts" />

// Web Bluetooth RFID Scanner for Chafon H102
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const WRITE_UUID = '0000ffe3-0000-1000-8000-00805f9b34fb';
const NOTIFY_UUID = '0000ffe4-0000-1000-8000-00805f9b34fb';

function calculateCrc16(bytes: Uint8Array): number {
  let crc = 0xFFFF;
  const poly = 0x8408;

  for (let i = 0; i < bytes.length; i++) {
    let byteValue = bytes[i];
    if (byteValue < 0) {
      byteValue += 256;
    }
    crc ^= byteValue;

    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc >>= 1;
        crc ^= poly;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

function finalizeCommand(baseCmd: Uint8Array): Uint8Array {
  const crc = calculateCrc16(baseCmd);
  const finalCmd = new Uint8Array(baseCmd.length + 2);
  finalCmd.set(baseCmd, 0);
  finalCmd[baseCmd.length] = (crc >> 8) & 0xFF;
  finalCmd[baseCmd.length + 1] = crc & 0xFF;
  return finalCmd;
}

const START_SCAN_BASE = new Uint8Array([0xCF, 0xFF, 0x00, 0x01, 0x05, 0x01, 0x00, 0x00, 0x00, 0x01]);
const START_SCAN_COMMAND = finalizeCommand(START_SCAN_BASE);

const STOP_SCAN_BASE = new Uint8Array([0xCF, 0xFF, 0x00, 0x02, 0x00]);
const STOP_SCAN_COMMAND = finalizeCommand(STOP_SCAN_BASE);

const SET_SCAN_MODE_BASE = new Uint8Array([0xCF, 0xFF, 0x00, 0x8E, 0x09, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SET_SCAN_MODE_COMMAND = finalizeCommand(SET_SCAN_MODE_BASE);

export class RFIDScanner {
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private onTagScanned: ((tagId: string) => void) | null = null;
  private onStatusChange: ((status: string) => void) | null = null;

  setOnTagScanned(callback: (tagId: string) => void) {
    this.onTagScanned = callback;
  }

  setOnStatusChange(callback: (status: string) => void) {
    this.onStatusChange = callback;
  }

  async connect(): Promise<boolean> {
    if (!navigator.bluetooth) {
      this.updateStatus('Web Bluetooth not supported');
      return false;
    }

    try {
      this.updateStatus('Searching for scanner...');
      
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });

      device.addEventListener('gattserverdisconnected', () => {
        this.updateStatus('Disconnected');
        this.gattServer = null;
        this.writeCharacteristic = null;
      });

      this.updateStatus(`Connecting to ${device.name || 'scanner'}...`);
      this.gattServer = await device.gatt!.connect();

      const service = await this.gattServer.getPrimaryService(SERVICE_UUID);
      this.writeCharacteristic = await service.getCharacteristic(WRITE_UUID);
      const notifyCharacteristic = await service.getCharacteristic(NOTIFY_UUID);

      notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        this.handleRfidData(event as any);
      });
      await notifyCharacteristic.startNotifications();

      await this.writeCharacteristic.writeValue(SET_SCAN_MODE_COMMAND as any);

      this.updateStatus('Connected');
      return true;
    } catch (error: any) {
      this.updateStatus(`Connection failed: ${error.message}`);
      return false;
    }
  }

  async startScan(): Promise<void> {
    if (!this.writeCharacteristic) {
      this.updateStatus('Not connected');
      return;
    }

    try {
      await this.writeCharacteristic.writeValue(START_SCAN_COMMAND as any);
      this.updateStatus('Scanning...');
    } catch (error: any) {
      this.updateStatus(`Start scan failed: ${error.message}`);
    }
  }

  async stopScan(): Promise<void> {
    if (!this.writeCharacteristic) {
      this.updateStatus('Not connected');
      return;
    }

    try {
      await this.writeCharacteristic.writeValue(STOP_SCAN_COMMAND as any);
      this.updateStatus('Scan stopped');
    } catch (error: any) {
      this.updateStatus(`Stop scan failed: ${error.message}`);
    }
  }

  private handleRfidData(event: { target: { value: DataView } }) {
    const value = event.target.value;
    const epcLength = value.getUint8(10);
    const epcStartIndex = 11;
    const epcEndIndex = epcStartIndex + epcLength;

    if (value.byteLength < epcEndIndex) {
      return;
    }

    const epcDataBytes = new Uint8Array(value.buffer, value.byteOffset + epcStartIndex, epcLength);
    const hexArray: string[] = [];
    for (let i = 0; i < epcDataBytes.length; i++) {
      hexArray.push(('0' + epcDataBytes[i].toString(16)).slice(-2).toUpperCase());
    }
    const rfidTag = hexArray.join('');

    if (this.onTagScanned) {
      this.onTagScanned(rfidTag);
    }
  }

  private updateStatus(status: string) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  disconnect() {
    if (this.gattServer) {
      this.gattServer.disconnect();
    }
  }
}
