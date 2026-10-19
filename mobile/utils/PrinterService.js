import { BleManager } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, PermissionsAndroid } from "react-native";
import { Buffer } from "buffer";
global.Buffer = global.Buffer || Buffer;

const manager = new BleManager();
const SAVED_PRINTER_KEY = "@xprinter_device_id";

// Cache the writable characteristic per device so we don't rediscover on every print
const writableCharCache = new Map(); // deviceId -> characteristic
let labelSetupSent = new Set();       // deviceIds we've already sent SIZE/GAP/DIRECTION/CLS to

export const requestBtPermissions = async () => {
  if (Platform.OS === "android") {
    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        granted["android.permission.BLUETOOTH_SCAN"] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_CONNECT"] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  }
  return true;
};

export const scanForPrinters = async (onDeviceFound) => {
  const hasPerm = await requestBtPermissions();
  if (!hasPerm) return false;

  manager.startDeviceScan(null, null, (error, device) => {
    if (error) {
      console.error("Scan error:", error);
      return;
    }
    if (
      device &&
      (device.name?.includes("Printer") ||
        device.name?.includes("XP") ||
        device.name?.includes("XB"))
    ) {
      onDeviceFound(device);
    }
  });

  return true;
};

export const stopPrinterScan = () => {
  try {
    manager.stopDeviceScan();
  } catch (error) {
    console.warn("stopPrinterScan error:", error);
  }
};

// Negotiate a large MTU so chunks fit in one BLE packet
const negotiateMtu = async (deviceId) => {
  if (Platform.OS !== "android") return; // iOS auto-negotiates
  try {
    await manager.requestMTU(deviceId, 512);
  } catch (e) {
    // MTU request is best-effort; ignore failures
    console.warn("MTU negotiation failed:", e?.message);
  }
};

const discoverWritableCharacteristic = async (device) => {
  const services = await device.services();
  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const char of characteristics) {
      if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
        return char;
      }
    }
  }
  return null;
};

const getWritableCharacteristic = async (device) => {
  const cached = writableCharCache.get(device.id);
  if (cached) return cached;

  const char = await discoverWritableCharacteristic(device);
  if (!char) throw new Error("No writable characteristic found on printer.");

  writableCharCache.set(device.id, char);
  return char;
};

export const connectToPrinter = async (deviceId) => {
  try {
    manager.stopDeviceScan();
    const device = await manager.connectToDevice(deviceId, { timeout: 10000 });
    await device.discoverAllServicesAndCharacteristics();
    await negotiateMtu(deviceId);

    // Pre-warm the characteristic cache
    await getWritableCharacteristic(device);

    await AsyncStorage.setItem(SAVED_PRINTER_KEY, deviceId);
    return device;
  } catch (error) {
    console.error("Connection failed:", error);
    writableCharCache.delete(deviceId);
    throw error;
  }
};

export const connectToScannedPrinter = async (device) => {
  try {
    manager.stopDeviceScan();

    try {
      const isConnected = await manager.isDeviceConnected(device.id);
      if (isConnected) {
        await manager.cancelDeviceConnection(device.id);
      }
    } catch (_) {}

    const connectedDevice = await manager.connectToDevice(device.id, {
      timeout: 10000,
    });
    await connectedDevice.discoverAllServicesAndCharacteristics();
    await negotiateMtu(device.id);

    await getWritableCharacteristic(connectedDevice);

    await AsyncStorage.setItem(SAVED_PRINTER_KEY, device.id);
    return connectedDevice;
  } catch (error) {
    console.error("connectToScannedPrinter failed:", error);
    writableCharCache.delete(device.id);
    throw error;
  }
};

export const autoConnectPrinter = async (onStatusChange) => {
  try {
    const savedDeviceId = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
    if (!savedDeviceId) return null;

    onStatusChange("Connecting to saved printer...");
    const isConnected = await manager.isDeviceConnected(savedDeviceId);

    let device;
    if (isConnected) {
      const devices = await manager.devices([savedDeviceId]);
      device = devices[0];
      // Discover only if we haven't cached a characteristic yet
      if (!writableCharCache.has(savedDeviceId)) {
        await device.discoverAllServicesAndCharacteristics();
        await getWritableCharacteristic(device);
      }
    } else {
      device = await manager.connectToDevice(savedDeviceId, { timeout: 10000 });
      await device.discoverAllServicesAndCharacteristics();
      await negotiateMtu(savedDeviceId);
      await getWritableCharacteristic(device);
    }

    onStatusChange("Printer Connected");
    return device;
  } catch (error) {
    console.warn("Auto-connect failed:", error?.message);
    onStatusChange("Auto-connect failed.");
    return null;
  }
};

export const disconnectPrinter = async (deviceId) => {
  try {
    if (deviceId) {
      await manager.cancelDeviceConnection(deviceId);
      writableCharCache.delete(deviceId);
      labelSetupSent.delete(deviceId);
    }
    await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
  } catch (error) {
    console.warn("disconnectPrinter error:", error);
  }
};

const writeChunks = async (char, base64Data) => {
  // Bigger chunks now that MTU is negotiated
  const CHUNK_SIZE = 320;
  const useResponse = char.isWritableWithResponse;

  for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
    const chunk = base64Data.slice(i, i + CHUNK_SIZE);

    if (useResponse) {
      // The ack paces us — no artificial delay
      await char.writeWithResponse(chunk);
    } else {
      await char.writeWithoutResponse(chunk);
      // Tiny delay only for no-response writes so the printer buffer keeps up
      await new Promise((r) => setTimeout(r, 5));
    }
  }
};

// Send the label setup commands ONCE per connection.
// After that, subsequent prints only send the label content + PRINT.
const ensureLabelSetup = async (device, char) => {
  if (!labelSetupSent.has(device.id)) {
    const geometry =
      `SIZE 50 mm, 50 mm\n` +
      `GAP 2 mm, 0 mm\n` +
      `DIRECTION 1\n`;
    await writeChunks(char, Buffer.from(geometry).toString("base64"));
    labelSetupSent.add(device.id);
  }

  // CLS must fire before EVERY label. This is what prevents duplication.
  await writeChunks(char, Buffer.from(`CLS\n`).toString("base64"));
};

export const printBarcodeTSPL = async (
  device,
  batchCode,
  itemName,
  expirationDate,
  printQty = 1,
) => {
  if (!device) throw new Error("No printer connected");

  const formatDateOnly = (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formattedExp = formatDateOnly(expirationDate);

  // Cache hit — no BLE discovery round-trips
  const char = await getWritableCharacteristic(device);

  // Send SIZE/GAP/DIRECTION/CLS once per session
  await ensureLabelSetup(device, char);

  // Only the label content + PRINT goes over the wire now
  const labelCommand =
    `TEXT 40,40,"3",0,1,1,"${itemName.slice(0, 20)}"\n` +
    `BARCODE 30,100,"128",120,0,0,1,2,"${batchCode}"\n` +
    `TEXT 40,230,"3",0,1,1,"${batchCode}"\n` +
    `TEXT 40,340,"3",0,1,1,"Exp: ${formattedExp}"\n` +
    `PRINT ${printQty},1\n`;

  const base64Data = Buffer.from(labelCommand).toString("base64");
  await writeChunks(char, base64Data);

  return true;
};