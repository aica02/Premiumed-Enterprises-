import { BleManager } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, PermissionsAndroid } from "react-native";
import { Buffer } from "buffer";
global.Buffer = global.Buffer || Buffer;

const manager = new BleManager();
const SAVED_PRINTER_KEY = "@xprinter_device_id";

// Request Bluetooth permissions for Android 12+
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

// Scan and return available printer devices (NOW RETURNS BOOLEAN)
export const scanForPrinters = async (onDeviceFound) => {
  const hasPerm = await requestBtPermissions();
  if (!hasPerm) return false; // <-- FIX: return false when permission denied

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

  return true; // <-- FIX: return true when scan started
};

// Stop scanning (MISSING FUNCTION - ADDED)
export const stopPrinterScan = () => {
  try {
    manager.stopDeviceScan();
  } catch (error) {
    console.warn("stopPrinterScan error:", error);
  }
};

// Connect to device and store ID for auto-reconnect
export const connectToPrinter = async (deviceId) => {
  try {
    manager.stopDeviceScan();
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    // Save device ID for seamless future auto-connections
    await AsyncStorage.setItem(SAVED_PRINTER_KEY, deviceId);
    return device;
  } catch (error) {
    console.error("Connection failed:", error);
    throw error;
  }
};

// Connect to a scanned device object (MISSING FUNCTION - ADDED)
export const connectToScannedPrinter = async (device) => {
  try {
    manager.stopDeviceScan();

    // Cancel any existing connection to this device first
    try {
      const isConnected = await manager.isDeviceConnected(device.id);
      if (isConnected) {
        await manager.cancelDeviceConnection(device.id);
      }
    } catch (_) {
      // ignore if not connected
    }

    const connectedDevice = await manager.connectToDevice(device.id, {
      timeout: 10000,
    });
    await connectedDevice.discoverAllServicesAndCharacteristics();

    // Save device ID for auto-reconnect
    await AsyncStorage.setItem(SAVED_PRINTER_KEY, device.id);

    return connectedDevice;
  } catch (error) {
    console.error("connectToScannedPrinter failed:", error);
    throw error;
  }
};

// Auto-connect on app startup using stored device ID
export const autoConnectPrinter = async (onStatusChange) => {
  try {
    const savedDeviceId = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
    if (!savedDeviceId) return null;

    onStatusChange("Connecting to saved printer...");
    const isConnected = await manager.isDeviceConnected(savedDeviceId);

    let device;
    if (isConnected) {
      device = await manager.devices([savedDeviceId]);
      device = device[0];
    } else {
      device = await manager.connectToDevice(savedDeviceId);
      await device.discoverAllServicesAndCharacteristics();
    }

    onStatusChange("Printer Connected");
    return device;
  } catch (error) {
    onStatusChange("Auto-connect failed. Please select printer.");
    return null;
  }
};

// Disconnect helper (optional but useful)
export const disconnectPrinter = async (deviceId) => {
  try {
    if (deviceId) {
      await manager.cancelDeviceConnection(deviceId);
    }
    await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
  } catch (error) {
    console.warn("disconnectPrinter error:", error);
  }
};

// Send TSPL Label Command to Xprinter XB-365B
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
  if (isNaN(d.getTime())) return String(value); // fallback if unparseable
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formattedExp = formatDateOnly(expirationDate);

  const tsplCommand =
    `SIZE 50 mm, 50 mm\n` +
    `GAP 2 mm, 0 mm\n` +
    `DIRECTION 1\n` +
    `CLS\n` +
    `TEXT 40,40,"3",0,1,1,"${itemName.slice(0, 20)}"\n` +
    `BARCODE 40,100,"128",120,0,0,2,2,"${batchCode}"\n` +
    `TEXT 40,230,"3",0,1,1,"${batchCode}"\n` +
    `TEXT 40,270,"3",0,1,1,"Exp: ${formattedExp}"\n` +
    `PRINT ${printQty},1\n`;

  const base64Data = Buffer.from(tsplCommand).toString("base64");

  // Retrieve writable characteristic from printer BLE services
  const services = await device.services();
  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const char of characteristics) {
      if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
        const CHUNK_SIZE = 180;
        for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
          const chunk = base64Data.slice(i, i + CHUNK_SIZE);
          if (char.isWritableWithResponse) {
            await char.writeWithResponse(chunk);
          } else {
            await char.writeWithoutResponse(chunk);
          }
          // Small delay to let printer buffer
          await new Promise((r) => setTimeout(r, 30));
        }
        return true;
      }
    }
  }
  throw new Error("No writable characteristic found on printer.");
};
