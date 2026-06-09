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
    if (byteValue < 0) byteValue += 256;
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

const createSessionCommand = (session: number): Uint8Array => {
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

  // ── Packet reassembly buffer ──────────────────────────────────────────────
  private packetBuffer: number[] = [];
  private expectedPacketLength: number = 0;
  // ─────────────────────────────────────────────────────────────────────────

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
        if (this.batteryCheckInterval) {
          clearInterval(this.batteryCheckInterval);
          this.batteryCheckInterval = null;
        }
      });

      this.updateStatus(`Connecting to ${device.name || 'scanner'}...`);
      this.gattServer = await device.gatt!.connect();

      const service = await this.gattServer.getPrimaryService(SERVICE_UUID);
      this.writeCharacteristic = await service.getCharacteristic(WRITE_UUID);
      const notifyCharacteristic = await service.getCharacteristic(NOTIFY_UUID);

      await notifyCharacteristic.startNotifications();
      notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleRfidData.bind(this));

      await this.writeCharacteristic!.writeValue(SET_SCAN_MODE_COMMAND as any);

      this.updateStatus('Connected');
      console.log('=== SCANNER CONNECTION COMPLETE ===');

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
      this.updateStatus('Not connected');
      return;
    }
    try {
      // Always reset to S1 for a clean inventory round
      await this.setSession('S1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reset reassembly buffer on new scan
      this.packetBuffer = [];
      this.expectedPacketLength = 0;

      console.log('📡 Sending START SCAN command...');
      await this.writeCharacteristic.writeValue(START_SCAN_COMMAND as any);
      this.updateStatus('Scanning...');
    } catch (error: any) {
      console.error('Start scan failed:', error);
      this.updateStatus(`Start scan failed: ${error.message}`);
    }
  }

  async stopScan(): Promise<void> {
    if (!this.writeCharacteristic) {
      this.updateStatus('Not connected');
      return;
    }
    try {
      console.log('⏹️ Sending STOP SCAN command...');
      await this.writeCharacteristic.writeValue(STOP_SCAN_COMMAND as any);
      this.updateStatus('Scan stopped');
    } catch (error: any) {
      console.error('Stop scan failed:', error);
      this.updateStatus(`Stop scan failed: ${error.message}`);
    }
  }

  async setSession(session: SessionMode): Promise<void> {
    if (!this.writeCharacteristic) return;
    const sessionMap = { 'S0': 0, 'S1': 1, 'S2': 2, 'S3': 3 };
    try {
      const command = createSessionCommand(sessionMap[session]);
      await this.writeCharacteristic.writeValue(command as any);
      console.log(`Session set to ${session}`);
    } catch (error: any) {
      console.error('Set session failed:', error);
    }
  }

  private async startBatteryMonitoring() {
    await this.checkBattery();
    this.batteryCheckInterval = window.setInterval(async () => {
      await this.checkBattery();
    }, 30000);
  }

  private async checkBattery() {
    if (!this.writeCharacteristic) return;
    try {
      await this.writeCharacteristic.writeValue(GET_BATTERY_COMMAND as any);
    } catch (error: any) {
      console.error('Battery check failed:', error);
    }
  }

  // ── Packet reassembly + parsing ───────────────────────────────────────────
  private handleRfidData(event: { target: { value: DataView } }) {
    const incoming = new Uint8Array(event.target.value.buffer);
    const hexStr = Array.from(incoming).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('📥 Raw chunk:', hexStr, '| Length:', incoming.length);

    // Check if this starts a new packet (CF FF header)
    if (incoming.length >= 2 && incoming[0] === 0xCF) {
      // New packet — reset buffer
      this.packetBuffer = Array.from(incoming);
      if (incoming.length >= 5) {
        // Total expected = 5 bytes header + payload length (byte 4) + 2 bytes CRC
        this.expectedPacketLength = 5 + incoming[4] + 2;
        console.log(`📦 New packet started. Expected ${this.expectedPacketLength} bytes, got ${incoming.length}`);
      } else {
        // Header too short to read length yet — wait for more
        this.expectedPacketLength = 0;
        return;
      }
    } else {
      // Continuation chunk — append to existing buffer
      if (this.packetBuffer.length === 0) {
        console.warn('⚠️ Received continuation chunk but buffer is empty — discarding');
        return;
      }
      this.packetBuffer.push(...Array.from(incoming));
      console.log(`📦 Continuation chunk. Buffer now ${this.packetBuffer.length}/${this.expectedPacketLength} bytes`);
    }

    // Check if we have the full packet yet
    if (this.expectedPacketLength > 0 && this.packetBuffer.length < this.expectedPacketLength) {
      console.log(`⏳ Waiting for more data: ${this.packetBuffer.length}/${this.expectedPacketLength} bytes`);
      return;
    }

    // Full packet received — parse it
    const fullPacket = new DataView(new Uint8Array(this.packetBuffer).buffer);
    this.packetBuffer = [];
    this.expectedPacketLength = 0;

    this.parseFullPacket(fullPacket);
  }

  private parseFullPacket(value: DataView) {
    const bytes = Array.from(new Uint8Array(value.buffer)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('✅ Parsing full packet:', bytes);

    // Battery response (command byte 0x83)
    if (value.byteLength >= 7 && value.getUint8(3) === 0x83) {
      const batteryPercentage = value.getUint8(6);
      console.log('🔋 Battery:', batteryPercentage + '%');
      if (this.onBatteryUpdate) this.onBatteryUpdate(batteryPercentage);
      return;
    }

    // Inventory round complete status (0x12 = no more tags in field)
    if (value.byteLength >= 6 && value.getUint8(3) === 0x01) {
      const status = value.getUint8(5);
      if (status === 0x12) {
        console.log('🏁 Inventory round complete');
        return;
      }
    }

    // RSSI at byte 5
    let rssi = -60;
    if (value.byteLength > 5) {
      const rawRssi = value.getUint8(5);
      rssi = rawRssi > 127 ? rawRssi - 256 : -rawRssi;
      console.log('📶 RSSI:', rssi, 'dBm');
    }

    // EPC at byte 10 (length) and byte 11+ (data)
    if (value.byteLength <= 10) {
      console.warn('Packet too short for EPC data:', value.byteLength);
      return;
    }

    const epcLength = value.getUint8(10);
    const epcStartIndex = 11;
    const epcEndIndex = epcStartIndex + epcLength;

    if (value.byteLength < epcEndIndex) {
      console.error('EPC data incomplete even after reassembly — corrupt packet, discarding');
      return;
    }

    const epcDataBytes = new Uint8Array(value.buffer, epcStartIndex, epcLength);
    const rfidTag = Array.from(epcDataBytes)
      .map(b => ('0' + b.toString(16)).slice(-2).toUpperCase())
      .join('');

    if (rfidTag.length === 0) {
      console.warn('Empty EPC — skipping');
      return;
    }

    console.log('🏷️ Tag:', rfidTag, '| RSSI:', rssi);
    if (this.onTagScanned) this.onTagScanned({ tagId: rfidTag, rssi });
  }
  // ─────────────────────────────────────────────────────────────────────────

  private updateStatus(status: string) {
    if (this.onStatusChange) this.onStatusChange(status);
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