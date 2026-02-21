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

const GET_BATTERY_BASE = new Uint8Array([0xCF, 0xFF, 0x00, 0x83, 0x00]);
const GET_BATTERY_COMMAND = finalizeCommand(GET_BATTERY_BASE);

// Session control commands (0x8C - Set Inventory Parameters)
// Format: [Header, Addr, Cmd, Len, Session, Target, ...reserved]
const createSessionCommand = (session: number): Uint8Array => {
  // Session: 0=S0, 1=S1, 2=S2, 3=S3
  // Target: 0=A, 1=B (we use 0 for default)
  const base = new Uint8Array([0xCF, 0xFF, 0x00, 0x8C, 0x09, session, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return finalizeCommand(base);
};

export type SessionMode = 'S0' | 'S1' | 'S2' | 'S3';

export interface TagReadData {
  tagId: string;
  rssi: number;
}

export class RFIDScanner {
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private onTagScanned: ((data: TagReadData) => void) | null = null;
  private onStatusChange: ((status: string) => void) | null = null;
  private onBatteryUpdate: ((percentage: number) => void) | null = null;
  private batteryCheckInterval: number | null = null;

  setOnTagScanned(callback: (data: TagReadData) => void) {
    this.onTagScanned = callback;
  }

  setOnStatusChange(callback: (status: string) => void) {
    this.onStatusChange = callback;
  }

  setOnBatteryUpdate(callback: (percentage: number) => void) {
    this.onBatteryUpdate = callback;
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
        // Clear battery monitoring on disconnect
        if (this.batteryCheckInterval) {
          clearInterval(this.batteryCheckInterval);
          this.batteryCheckInterval = null;
        }
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

      await notifyCharacteristic.startNotifications();
      console.log('Notifications started');
      
      notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleRfidData.bind(this));
      
      // Set device to scan mode (0x01) for optimal performance
      console.log('Setting device to scan mode...');
      await this.writeCharacteristic!.writeValue(SET_SCAN_MODE_COMMAND as any);
      console.log('Scan mode set');
      
      this.updateStatus('Connected');
      console.log('=== SCANNER CONNECTION COMPLETE ===');

      // Start battery monitoring
      await this.startBatteryMonitoring();

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

  async setSession(session: SessionMode): Promise<void> {
    if (!this.writeCharacteristic) {
      console.error('Cannot set session - not connected');
      return;
    }

    const sessionMap = { 'S0': 0, 'S1': 1, 'S2': 2, 'S3': 3 };
    const sessionValue = sessionMap[session];

    try {
      console.log(`📡 Setting session to ${session}...`);
      const command = createSessionCommand(sessionValue);
      await this.writeCharacteristic.writeValue(command as any);
      console.log(`Session set to ${session} successfully`);
      this.updateStatus(`Session: ${session}`);
    } catch (error: any) {
      console.error('Set session failed:', error);
      this.updateStatus(`Set session failed: ${error.message}`);
    }
  }

  private async startBatteryMonitoring() {
    console.log('🔋 Starting battery monitoring...');
    // Get initial battery level
    await this.checkBattery();
    
    // Check battery every 30 seconds
    this.batteryCheckInterval = window.setInterval(async () => {
      console.log('🔋 Periodic battery check (30s interval)...');
      await this.checkBattery();
    }, 30000);
    console.log('✅ Battery monitoring started with 30s interval');
  }

  private async checkBattery() {
    if (!this.writeCharacteristic) {
      console.warn('⚠️ Cannot check battery - no write characteristic');
      return;
    }
    
    try {
      console.log('🔋 Requesting battery level...');
      await this.writeCharacteristic.writeValue(GET_BATTERY_COMMAND as any);
      console.log('✅ Battery command sent successfully');
    } catch (error: any) {
      console.error('❌ Battery check failed:', error);
    }
  }

  private handleRfidData(event: { target: { value: DataView } }) {
    const value = event.target.value;
    
    // Log all incoming data for debugging
    const bytes = Array.from(new Uint8Array(value.buffer)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('📥 Raw data received:', bytes, 'Length:', value.byteLength);
    
    // Check if this is a battery response (command 0x83)
    if (value.byteLength >= 7 && value.getUint8(3) === 0x83) {
      const batteryPercentage = value.getUint8(6);  // Battery % is at byte 6 per official SDK
      console.log('🔋 Battery level detected:', batteryPercentage + '%');
      if (this.onBatteryUpdate) {
        console.log('🔋 Calling onBatteryUpdate callback with:', batteryPercentage);
        this.onBatteryUpdate(batteryPercentage);
      } else {
        console.warn('⚠️ onBatteryUpdate callback not set!');
      }
      return;
    }
    
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
    if (this.batteryCheckInterval) {
      clearInterval(this.batteryCheckInterval);
      this.batteryCheckInterval = null;
    }
    if (this.gattServer) {
      this.gattServer.disconnect();
    }
  }
}
