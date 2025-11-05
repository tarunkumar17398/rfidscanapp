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
      console.error('Web Bluetooth not supported');
      return false;
    }

    try {
      this.updateStatus('Searching for scanner...');
      console.log('=== SCANNER CONNECTION START ===');
      
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });

      console.log('Device selected:', device.name, device.id);

      device.addEventListener('gattserverdisconnected', () => {
        console.log('GATT server disconnected');
        this.updateStatus('Disconnected');
        this.gattServer = null;
        this.writeCharacteristic = null;
      });

      this.updateStatus(`Connecting to ${device.name || 'scanner'}...`);
      console.log('Connecting to GATT server...');
      this.gattServer = await device.gatt!.connect();
      console.log('GATT server connected');

      console.log('Getting primary service...');
      const service = await this.gattServer.getPrimaryService(SERVICE_UUID);
      console.log('Service obtained');
      
      console.log('Getting write characteristic...');
      this.writeCharacteristic = await service.getCharacteristic(WRITE_UUID);
      console.log('Write characteristic obtained');
      
      console.log('Getting notify characteristic...');
      const notifyCharacteristic = await service.getCharacteristic(NOTIFY_UUID);
      console.log('Notify characteristic obtained');

      console.log('Setting up notification listener...');
      notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        console.log('🔔 NOTIFICATION RECEIVED - Raw event:', event);
        this.handleRfidData(event as any);
      });
      
      console.log('Starting notifications...');
      await notifyCharacteristic.startNotifications();
      console.log('Notifications started successfully');

      console.log('Sending scan mode command...');
      await this.writeCharacteristic.writeValue(SET_SCAN_MODE_COMMAND as any);
      console.log('Scan mode set');

      this.updateStatus('Connected');
      console.log('=== SCANNER CONNECTED SUCCESSFULLY ===');
      return true;
    } catch (error: any) {
      console.error('Connection error:', error);
      this.updateStatus(`Connection failed: ${error.message}`);
      return false;
    }
  }

  async startScan(): Promise<void> {
    if (!this.writeCharacteristic) {
      console.error('Cannot start scan - not connected');
      this.updateStatus('Not connected');
      return;
    }

    try {
      console.log('📡 Sending START SCAN command...');
      await this.writeCharacteristic.writeValue(START_SCAN_COMMAND as any);
      console.log('START SCAN command sent successfully');
      this.updateStatus('Scanning...');
    } catch (error: any) {
      console.error('Start scan failed:', error);
      this.updateStatus(`Start scan failed: ${error.message}`);
    }
  }

  async stopScan(): Promise<void> {
    if (!this.writeCharacteristic) {
      console.error('Cannot stop scan - not connected');
      this.updateStatus('Not connected');
      return;
    }

    try {
      console.log('⏹️ Sending STOP SCAN command...');
      await this.writeCharacteristic.writeValue(STOP_SCAN_COMMAND as any);
      console.log('STOP SCAN command sent successfully');
      this.updateStatus('Scan stopped');
    } catch (error: any) {
      console.error('Stop scan failed:', error);
      this.updateStatus(`Stop scan failed: ${error.message}`);
    }
  }

  private handleRfidData(event: { target: { value: DataView } }) {
    const value = event.target.value;
    
    console.log('Raw RFID data received, byteLength:', value.byteLength);
    
    // EPC Data Extraction Logic
    const epcLength = value.getUint8(10);
    const epcStartIndex = 11;
    const epcEndIndex = epcStartIndex + epcLength;

    if (value.byteLength < epcEndIndex) {
      console.error('Payload too short for reported EPC length.');
      return;
    }

    const epcDataBytes = new Uint8Array(value.buffer, value.byteOffset + epcStartIndex, epcLength);
    const hexArray: string[] = [];
    for (let i = 0; i < epcDataBytes.length; i++) {
      hexArray.push(('0' + epcDataBytes[i].toString(16)).slice(-2).toUpperCase());
    }
    const rfidTag = hexArray.join('');
    
    console.log('RFID Tag extracted:', rfidTag);

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
