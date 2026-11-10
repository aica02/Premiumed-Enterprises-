import { BleManager } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, PermissionsAndroid, AppState } from "react-native";
import { Buffer } from "buffer";
global.Buffer = global.Buffer || Buffer;

const manager = new BleManager();
const SAVED_PRINTER_KEY = "@xprinter_device_id";

// Cache the writable characteristic per device so we don't rediscover on every print
const writableCharCache = new Map(); // deviceId -> characteristic
let labelSetupSent = new Set();       // deviceIds we've already sent SIZE/GAP/DIRECTION/CLS to

// ---------------------------------------------------------------------------
// Connection tracking
//
// The screens only know what they were last told. Without the code below, a
// printer that went out of range stayed "Connected" on screen, and the cached
// characteristic / label setup from the dead link were reused after coming back.
// Now the service watches the Bluetooth link, tells every subscribed screen when
// it drops or returns, clears the stale caches and tries to reconnect on its own.
// ---------------------------------------------------------------------------
const statusListeners = new Set();
const disconnectSubs = new Map(); // deviceId -> BLE disconnect subscription
let activeDeviceId = null;        // the printer we last connected to this session
let reconnecting = false;
let reconnectTimer = null;
let reconnectRun = 0; // bumped on every cancel so an old attempt cannot carry on

// Wait before each background reconnect attempt: about a minute in total.
const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 15000, 30000];

const emitStatus = (state, device = null) => {
  statusListeners.forEach((listener) => {
    try {
      listener({ state, device });
    } catch (error) {
      console.warn("Printer status listener failed:", error);
    }
  });
};

// Screens call this once on mount. state is "connected", "reconnecting" or
// "disconnected". Returns a function that removes the listener.
export const subscribePrinterStatus = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

// The next connection must never reuse anything from the old link: the printer
// may have been switched off, so it needs its label setup sent again too.
const forgetConnection = (deviceId) => {
  writableCharCache.delete(deviceId);
  labelSetupSent.delete(deviceId);
};

const unwatchConnection = (deviceId) => {
  const subscription = disconnectSubs.get(deviceId);
  if (subscription) {
    try {
      subscription.remove();
    } catch (_) {}
    disconnectSubs.delete(deviceId);
  }
};

const cancelReconnect = () => {
  reconnectRun += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnecting = false;
};

// The link is gone: update every screen, then try to bring it back.
const handleConnectionLost = (deviceId) => {
  unwatchConnection(deviceId);
  forgetConnection(deviceId);
  if (reconnecting) return; // a reconnect is already in progress
  emitStatus("reconnecting");
  startReconnect(deviceId);
};

const watchConnection = (deviceId) => {
  unwatchConnection(deviceId);
  activeDeviceId = deviceId;
  const subscription = manager.onDeviceDisconnected(deviceId, () => {
    if (activeDeviceId === deviceId) handleConnectionLost(deviceId);
  });
  disconnectSubs.set(deviceId, subscription);
};

const startReconnect = (deviceId) => {
  if (reconnecting) return;
  reconnecting = true;
  const run = (reconnectRun += 1);
  const cancelled = () => run !== reconnectRun;

  const attempt = async (index) => {
    if (cancelled()) return;
    // The user chose another printer or disconnected on purpose: stop.
    if (activeDeviceId !== deviceId) {
      cancelReconnect();
      return;
    }
    emitStatus("reconnecting");
    try {
      // Do not stop a scan the user may have open in the "select printer" window.
      await ensureConnected(deviceId, { stopScan: false });
      if (cancelled()) return;
      reconnecting = false;
      reconnectTimer = null;
    } catch (error) {
      if (cancelled()) return;
      console.warn("Printer reconnect failed:", error?.message);
      forgetConnection(deviceId);
      if (index + 1 < RECONNECT_DELAYS_MS.length) {
        reconnectTimer = setTimeout(
          () => attempt(index + 1),
          RECONNECT_DELAYS_MS[index + 1],
        );
      } else {
        reconnecting = false;
        reconnectTimer = null;
        emitStatus("disconnected");
      }
    }
  };

  reconnectTimer = setTimeout(() => attempt(0), RECONNECT_DELAYS_MS[0]);
};

// A dropped link can go unnoticed while the app is in the background. When the
// app comes back, check the printer is still really connected.
AppState.addEventListener("change", async (state) => {
  if (state !== "active" || !activeDeviceId || reconnecting) return;
  try {
    const stillConnected = await manager.isDeviceConnected(activeDeviceId);
    if (!stillConnected) handleConnectionLost(activeDeviceId);
  } catch (error) {
    console.warn("Printer connection check failed:", error?.message);
  }
});

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

// Opens a brand-new connection to the printer, ready to print.
const openConnection = async (deviceId, { stopScan = true } = {}) => {
  if (stopScan) manager.stopDeviceScan();
  forgetConnection(deviceId);

  const device = await manager.connectToDevice(deviceId, { timeout: 10000 });
  await device.discoverAllServicesAndCharacteristics();
  await negotiateMtu(deviceId);

  // Pre-warm the characteristic cache
  await getWritableCharacteristic(device);

  await AsyncStorage.setItem(SAVED_PRINTER_KEY, deviceId);
  watchConnection(deviceId);
  emitStatus("connected", device);
  return device;
};

// Returns a printer that is really connected right now, reusing the live link
// when there is one and opening a new one when there is not.
const ensureConnected = async (deviceId, options) => {
  let connected = false;
  try {
    connected = await manager.isDeviceConnected(deviceId);
  } catch (_) {
    connected = false;
  }

  if (connected) {
    const [device] = await manager.devices([deviceId]);
    if (device) {
      // Discover only if we haven't cached a characteristic yet
      if (!writableCharCache.has(deviceId)) {
        await device.discoverAllServicesAndCharacteristics();
        await getWritableCharacteristic(device);
      }
      if (!disconnectSubs.has(deviceId)) watchConnection(deviceId);
      emitStatus("connected", device);
      return device;
    }
  }

  return openConnection(deviceId, options);
};

export const connectToPrinter = async (deviceId) => {
  try {
    cancelReconnect(); // the user is connecting by hand
    return await openConnection(deviceId);
  } catch (error) {
    console.error("Connection failed:", error);
    forgetConnection(deviceId);
    throw error;
  }
};

export const connectToScannedPrinter = async (device) => {
  try {
    cancelReconnect(); // the user is connecting by hand
    manager.stopDeviceScan();

    // Start from a clean connection. Stop watching first so closing the old
    // link on purpose is not mistaken for the printer dropping.
    unwatchConnection(device.id);
    try {
      const isConnected = await manager.isDeviceConnected(device.id);
      if (isConnected) {
        await manager.cancelDeviceConnection(device.id);
      }
    } catch (_) {}

    return await openConnection(device.id);
  } catch (error) {
    console.error("connectToScannedPrinter failed:", error);
    forgetConnection(device.id);
    throw error;
  }
};

export const autoConnectPrinter = async (onStatusChange) => {
  try {
    const savedDeviceId = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
    if (!savedDeviceId) return null;

    onStatusChange("Connecting to saved printer...");
    const device = await ensureConnected(savedDeviceId);

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
    cancelReconnect();
    if (deviceId) {
      // Disconnecting on purpose: do not watch for it or reconnect.
      unwatchConnection(deviceId);
      if (activeDeviceId === deviceId) activeDeviceId = null;
      await manager.cancelDeviceConnection(deviceId);
      forgetConnection(deviceId);
    }
    await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
    emitStatus("disconnected");
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

const PRINTER_UNAVAILABLE_MESSAGE =
  "The printer is not connected. Make sure it is turned on and nearby, then try again.";

export const printBarcodeTSPL = async (
  device,
  batchCode,
  itemName,
  expirationDate,
  printQty = 1,
) => {
  const deviceId =
    device?.id || activeDeviceId || (await AsyncStorage.getItem(SAVED_PRINTER_KEY));
  if (!deviceId) throw new Error("No printer connected");

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

  // Check the link is still alive. If the printer dropped while the screen
  // still said "Connected", this reconnects instead of failing halfway.
  let liveDevice;
  try {
    liveDevice = await ensureConnected(deviceId);
  } catch (error) {
    console.warn("Printer unavailable:", error?.message);
    throw new Error(PRINTER_UNAVAILABLE_MESSAGE);
  }

  try {
    // Cache hit — no BLE discovery round-trips
    const char = await getWritableCharacteristic(liveDevice);

    // Send SIZE/GAP/DIRECTION/CLS once per connection
    await ensureLabelSetup(liveDevice, char);

    // Only the label content + PRINT goes over the wire now
    const labelCommand =
      `TEXT 40,40,"3",0,1,1,"${itemName.slice(0, 20)}"\n` +
      `BARCODE 100,100,"128",120,0,0,1,2,"${batchCode}"\n` +
      `TEXT 70,230,"3",0,1,1,"${batchCode}"\n` +
      `TEXT 40,340,"3",0,1,1,"Exp: ${formattedExp}"\n` +
      `PRINT ${printQty},1\n`;

    const base64Data = Buffer.from(labelCommand).toString("base64");
    await writeChunks(char, base64Data);
  } catch (error) {
    // The link may have dropped mid-write. Do not retry here: part of the label
    // may already have printed, and a retry could print it twice.
    console.warn("Printing failed:", error?.message);
    forgetConnection(deviceId);
    throw new Error(
      "The label could not be sent. The printer may have disconnected; check it and try again.",
    );
  }

  return true;
};
