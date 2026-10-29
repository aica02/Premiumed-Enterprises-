import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Image,
  StyleSheet,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Search,
  PlusCircle,
  XCircle,
  Package,
  Upload,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ScanLine,
  Check,
  Wifi,
  WifiOff,
  Printer,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { offlineFetch as fetch } from "../shared/offlineApi";
import { readJsonResponse } from "../shared/readJsonResponse";
import useWarehouseMapAdditions from "../shared/useWarehouseMapAdditions";
import {
  autoConnectPrinter,
  connectToPrinter,
  printBarcodeTSPL,
  scanForPrinters,
  stopPrinterScan,
} from "../utils/PrinterService";

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const MAX_QUANTITY = 1000;
const KIT_QUANTITY_PER_BOX = 100;
const COUNTED_BATCH_STATUSES = ["stored", "for disposal"];

const getDefaultKitExpiration = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d;
};

export default function InventoryKit({
  navigation,
  staffName,
  staffPosition,
  items,
  setItems,
  batches,
  setBatches,
  fetchItems,
  fetchBatches,
  onRefresh,
  refreshing,
  styles,
}) {
  const additionalLocations = useWarehouseMapAdditions();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorFeedback, setErrorFeedback] = useState(null);
  const [sortOrder, setSortOrder] = useState("QTY Low → High");
  const [expirySort, setExpirySort] = useState("Sort Expiry");
  const [fefoFilter, setFefoFilter] = useState("All FEFO");
  const [stockFilter, setStockFilter] = useState("All Stock");

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [restockSuccessData, setRestockSuccessData] = useState(null);

  const [printQty, setPrintQty] = useState("1");
  const [printerDevice, setPrinterDevice] = useState(null);
  const [printerStatus, setPrinterStatus] = useState("Printer Disconnected");
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState(null);

  const [kitItems, setKitItems] = useState([]);
  const [showConfirmKitModal, setShowConfirmKitModal] = useState(false);
  const [kitItemErrors, setKitItemErrors] = useState({});
  const [quantityError, setQuantityError] = useState("");
  const [kitFormErrors, setKitFormErrors] = useState({});
  const [confirmError, setConfirmError] = useState("");
  const [insufficientStockSummary, setInsufficientStockSummary] = useState([]);

  const [scanningModalVisible, setScanningModalVisible] = useState(false);
  const [scanQueue, setScanQueue] = useState([]);
  const [scanQueueIndex, setScanQueueIndex] = useState(0);
  const [scanAllocations, setScanAllocations] = useState({});
  const [scanned, setScanned] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [showCancelScanConfirm, setShowCancelScanConfirm] = useState(false);
  const [incompleteScanShortfalls, setIncompleteScanShortfalls] = useState([]);
  const [showIncompleteScanConfirm, setShowIncompleteScanConfirm] =
    useState(false);
  const isProcessing = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    autoConnectPrinter(setPrinterStatus)
      .then((device) => {
        if (device) setPrinterDevice(device);
      })
      .catch((error) => {
        console.error("Printer auto-connect failed:", error);
        setPrinterStatus("Printer Disconnected");
      });
  }, []);

  const handleScanPrinters = async () => {
    setAvailablePrinters([]);
    setShowPrinterModal(true);
    try {
      const scanStarted = await scanForPrinters((device) => {
        setAvailablePrinters((current) => {
          if (current.some((printer) => printer.id === device.id)) {
            return current;
          }
          return [...current, device];
        });
      });
      if (!scanStarted) {
        setShowPrinterModal(false);
        Alert.alert(
          "Bluetooth Permission Required",
          "Allow Bluetooth permissions to scan for label printers.",
        );
      }
    } catch (error) {
      console.error("Printer scan failed:", error);
      setShowPrinterModal(false);
      Alert.alert(
        "Printer Scan Failed",
        error.message || "Unable to scan for printers.",
      );
    }
  };

  const handleSelectPrinter = async (device) => {
    try {
      setPrinterStatus("Connecting...");
      const connectedDevice = await connectToPrinter(device.id);
      setPrinterDevice(connectedDevice);
      setPrinterStatus(`Connected to ${device.name || "Xprinter"}`);
      setShowPrinterModal(false);
    } catch (error) {
      console.error("Printer connection failed:", error);
      setPrinterStatus("Printer Disconnected");
      Alert.alert("Connection Error", "Could not connect to printer.");
    }
  };

  const handlePrintLabel = async () => {
    const quantity = Number(printQty);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      Alert.alert(
        "Invalid Quantity",
        "Enter a positive whole number of labels.",
      );
      return;
    }
    if (!restockSuccessData?.batchCode) {
      Alert.alert(
        "Batch Not Ready",
        "A batch code is required before printing.",
      );
      return;
    }
    if (!printerDevice) {
      Alert.alert("No Printer", "Please connect your Xprinter first.", [
        { text: "Connect Printer", onPress: handleScanPrinters },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    try {
      setIsPrinting(true);
      await printBarcodeTSPL(
        printerDevice,
        restockSuccessData.batchCode,
        restockSuccessData.itemName,
        restockSuccessData.expirationDate,
        quantity,
      );
      setSuccessFeedback({
        title: "Print Successful!",
        message: "Your label was sent to Xprinter.",
      });
    } catch (error) {
      console.error("Barcode printing failed:", error);
      setErrorFeedback({
        title: "Print Error",
        message: error?.message || "Failed to print barcode.",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const [kitFormData, setKitFormData] = useState({
    itemCode: "",
    name: "",
    category: "Medical Kits",
    unitType: "Set",
    box: "",
    quantity: String(KIT_QUANTITY_PER_BOX),
    expirationDate: getDefaultKitExpiration(),
    location: "P1-A",
    supplierName: "Premiumed Enterprises",
    reorderLevel: "50",
    kitItems: [],
  });

  const getFefoStatus = (expirationDate) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0)
      return { label: "Expired", color: "#EF4444", bg: "#FEE2E2" };
    if (diffDays <= 30)
      return { label: "Near Expiry", color: "#F59E0B", bg: "#FEF3C7" };
    return { label: "Safe", color: "#10B981", bg: "#D1FAE5" };
  };

  const getStockStatus = (quantity, reorderLevel = 50) => {
    if (quantity === 0)
      return { label: "Out of Stock", color: "#EF4444", bg: "#FEE2E2" };
    if (quantity <= reorderLevel)
      return { label: "Low Stock", color: "#F59E0B", bg: "#FEF3C7" };
    return { label: "Available", color: "#10B981", bg: "#D1FAE5" };
  };

  const getFilteredBatches = () => {
    if (!selectedItem?.batches) return [];

    let processedBatches = selectedItem.batches.filter(
      (b) =>
        COUNTED_BATCH_STATUSES.includes(b.status) && Number(b.quantity) > 0,
    );

    if (fefoFilter !== "All FEFO") {
      processedBatches = processedBatches.filter(
        (b) => getFefoStatus(b.expirationDate).label === fefoFilter,
      );
    }
    if (stockFilter !== "All Stock") {
      processedBatches = processedBatches.filter(
        (b) =>
          getStockStatus(b.quantity, selectedItem.reorderLevel).label ===
          stockFilter,
      );
    }

    processedBatches.sort((a, b) => {
      if (a.quantity === 0 && b.quantity > 0) return 1;
      if (a.quantity > 0 && b.quantity === 0) return -1;

      if (sortOrder === "QTY Low → High") return a.quantity - b.quantity;
      if (sortOrder === "QTY High → Low") return b.quantity - a.quantity;
      return 0;
    });

    if (expirySort !== "Sort Expiry") {
      processedBatches.sort((a, b) => {
        if (a.quantity === 0 && b.quantity > 0) return 1;
        if (a.quantity > 0 && b.quantity === 0) return -1;
        const dateA = new Date(a.expirationDate);
        const dateB = new Date(b.expirationDate);
        return expirySort === "Nearest Exp." ? dateA - dateB : dateB - dateA;
      });
    }

    return processedBatches;
  };

  const renderRackItems = () => {
    const occupiedLocations = new Set(
      batches
        .filter(
          (batch) => batch.status !== "disposed" && Number(batch.quantity) > 0,
        )
        .map((batch) => batch.storageLocation),
    );

    const locations = additionalLocations.filter(
      (location) =>
        location.type === "pallet" && location.id.startsWith("P1-"),
    );

    return locations
      .filter(({ id }) => kitFormData.itemCode || !occupiedLocations.has(id))
      .map(({ id }) => <Picker.Item key={id} label={id} value={id} />);
  };

  const uploadToCloudinary = async (imageUri, itemName) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      throw new Error("Cloudinary environment variables are missing.");
    }

    const sanitizedName = itemName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${sanitizedName}-${Date.now()}.jpg`;
    const compressed = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );

    const formData = new FormData();
    formData.append("file", {
      uri: compressed.uri,
      type: "image/jpeg",
      name: filename,
    });
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "inventory-items");

    const response = await globalThis.fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      },
    );
    const result = await readJsonResponse(response, "Cloudinary image upload");
    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
          `Cloudinary returned HTTP ${response.status}.`,
      );
    }
    if (!result?.secure_url) {
      throw new Error("Cloudinary response did not include an image URL.");
    }
    return result.secure_url;
  };

  const pickImage = async (onSelected = setImage) => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      const selectedAsset = result.assets?.[0];
      if (!result.canceled && selectedAsset?.uri) {
        onSelected({ uri: selectedAsset.uri });
      }
    } catch (error) {
      console.error("Image library selection failed:", error);
      Alert.alert(
        "Unable to Select Photo",
        error?.message || "Failed to pick image.",
      );
    }
  };

  const takePhoto = async (onSelected = setImage) => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please grant camera permissions.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      const selectedAsset = result.assets?.[0];
      if (!result.canceled && selectedAsset?.uri) {
        onSelected({ uri: selectedAsset.uri });
      }
    } catch (error) {
      console.error("Camera capture failed:", error);
      Alert.alert(
        "Unable to Take Photo",
        error?.message || "Failed to take photo.",
      );
    }
  };

  const showImageOptions = (onSelected = setImage) => {
    Alert.alert("Select Image", "Choose an option", [
      { text: "Cancel", style: "cancel" },
      { text: "Take Photo", onPress: () => takePhoto(onSelected) },
      { text: "Choose from Gallery", onPress: () => pickImage(onSelected) },
    ]);
  };

  const saveBatchModalImage = async (selectedImage) => {
    if (!selectedItem?.itemCode || uploading) return;

    try {
      const network = await NetInfo.fetch();
      if (!network.isConnected || network.isInternetReachable === false) {
        Alert.alert(
          "Internet Required",
          "Connect to the internet to upload and save the kit photo.",
        );
        return;
      }

      setUploading(true);
      const imageUrl = await uploadToCloudinary(
        selectedImage.uri,
        selectedItem.name,
      );
      if (!imageUrl) {
        throw new Error("Cloudinary did not return a product image URL.");
      }
      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");
      const response = await fetch(
        `${BACKEND_URL}/api/inventoryPage/product/${encodeURIComponent(selectedItem.itemCode)}/image`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(storedUserId ? { "x-user-id": storedUserId } : {}),
            ...(storedUsername ? { "x-username": storedUsername } : {}),
            ...(storedRole ? { "x-role": storedRole } : {}),
          },
          body: JSON.stringify({ itemImage: imageUrl }),
        },
      );
      const result = await readJsonResponse(response, "Kit photo update");
      if (!response.ok) {
        throw new Error(
          result?.message ||
            `Kit photo update returned HTTP ${response.status}.`,
        );
      }

      const updatedItem = {
        ...selectedItem,
        itemImage: result?.product?.itemImage || imageUrl,
      };
      setSelectedItem(updatedItem);
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.itemCode === updatedItem.itemCode
            ? { ...item, itemImage: updatedItem.itemImage }
            : item,
        ),
      );
      if (!result?.queued) await fetchItems();
      Alert.alert(
        result?.queued ? "Photo Saved Offline" : "Photo Updated",
        result?.queued
          ? "The new kit photo is queued and will sync when the connection is restored."
          : "The kit photo has been updated.",
      );
    } catch (error) {
      console.error("Kit photo update failed:", error);
      Alert.alert(
        "Photo Update Failed",
        error.message || "Unable to update the kit photo.",
      );
    } finally {
      setUploading(false);
    }
  };

  const resetScanState = () => {
    setScanningModalVisible(false);
    setScanQueue([]);
    setScanQueueIndex(0);
    setScanAllocations({});
    setScanned(false);
    setScanFeedback(null);
    isProcessing.current = false;
  };

  const resetKitForm = () => {
    setKitFormData({
      itemCode: "",
      name: "",
      category: "Medical Kits",
      box: "",
      quantity: String(KIT_QUANTITY_PER_BOX),
      expirationDate: getDefaultKitExpiration(),
      location: "P1-A",
      supplierName: "Premiumed Enterprises",
      unitType: "Set",
      reorderLevel: "50",
      kitItems: [],
    });

    setKitItems([]);
    setKitItemErrors({});
    setQuantityError("");
    setKitFormErrors({});
    setInsufficientStockSummary([]);
    setImage(null);
    resetScanState();
  };

  const removeKitItemFromKit = (index) => {
    setKitItems((prev) => prev.filter((_, i) => i !== index));
    setInsufficientStockSummary([]);
  };

  const updateKitItemQuantity = (index, value) => {
    if (value === "") {
      setKitItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, quantity: "" } : item)),
      );
      setKitItemErrors((prev) => ({
        ...prev,
        [kitItems[index]?._id]: "Quantity is required.",
      }));
      return;
    }

    const qty = parseInt(value, 10);

    if (!isNaN(qty)) {
      setKitItems((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, quantity: qty } : item,
        ),
      );

      setKitItemErrors((prev) => ({
        ...prev,
        [kitItems[index]?._id]:
          qty <= 0
            ? "Quantity must be greater than 0."
            : qty > MAX_QUANTITY
              ? `Quantity cannot exceed ${MAX_QUANTITY}.`
              : "",
      }));
    }
  };

  /**
   * Get available stock for a kit-inclusion itemCode.
   * Only counts batches with a countable status and positive qty.
   */
  const getAvailableStock = (itemCode) => {
    if (!itemCode) return 0;
    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    return Math.max(existingQuantity, 0);
  };

  /**
   * Compute per-item insufficient stock info based on the current form.
   * Returns an array of { _id, name, itemCode, perBox, boxCount, required, available, shortage }
   */
  const computeInsufficientStockItems = () => {
    const boxCount = Number(kitFormData.box) || 0;
    if (boxCount <= 0) return [];

    const results = [];
    kitItems.forEach((item) => {
      const perBox = Number(item.quantity);
      if (!Number.isFinite(perBox) || perBox <= 0) return;
      const required = perBox * boxCount;
      const available = getAvailableStock(item.itemCode);
      if (required > available) {
        results.push({
          _id: item._id,
          name: item.name,
          itemCode: item.itemCode,
          perBox,
          boxCount,
          required,
          available,
          shortage: required - available,
        });
      }
    });
    return results;
  };

  const validateKitBeforeSave = () => {
    const errors = {};

    if (!kitFormData.name?.trim()) {
      setConfirmError("Kit name is required.");
      return false;
    }

    if (!kitFormData.itemCode && kitItems.length === 0) {
      setConfirmError("Add at least one kit inclusion before confirming.");
      return false;
    }

    kitItems.forEach((item) => {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors[item._id] = "Enter a valid quantity.";
      }
    });

    if (!kitFormData.box || Number(kitFormData.box) <= 0) {
      setConfirmError("Box must be greater than zero.");
      return false;
    }

    if (!kitFormData.expirationDate || !kitFormData.location) {
      setConfirmError("Expiration date and storage location are required.");
      return false;
    }

    if (Object.keys(errors).length > 0) {
      setKitItemErrors(errors);
      setConfirmError("Complete the highlighted kit item quantities.");
      return false;
    }

    setKitItemErrors({});
    setConfirmError("");
    return true;
  };

  const handleSaveKit = () => {
    const formErrors = {};
    if (!kitFormData.name?.trim()) {
      formErrors.name = "Kit name is required.";
    }
    if (!kitFormData.itemCode && kitItems.length === 0) {
      formErrors.items = "Add at least one kit inclusion.";
    }
    if (!kitFormData.box) {
      formErrors.box = "Box is required.";
    } else {
      const boxNum = Number(kitFormData.box);
      if (!Number.isFinite(boxNum) || boxNum <= 0) {
        formErrors.box = "Box must be greater than 0.";
      }
    }

    if (Object.keys(formErrors).length > 0) {
      setKitFormErrors(formErrors);
      return;
    }

    setKitFormErrors({});

    const errors = {};
    const boxCount = Number(kitFormData.box) || 0;

    kitItems.forEach((item) => {
      const qty = item.quantity;

      if (qty === "" || qty === null || qty === undefined) {
        errors[item._id] = "Quantity is required.";
        return;
      }

      const numQty = Number(qty);

      if (numQty <= 0) {
        errors[item._id] = "Quantity must be greater than 0.";
        return;
      }

      if (numQty > MAX_QUANTITY) {
        errors[item._id] = `Quantity cannot exceed ${MAX_QUANTITY}.`;
        return;
      }

      const requiredTotal = numQty * boxCount;
      const available = getAvailableStock(item.itemCode);

      if (requiredTotal > available) {
        errors[item._id] =
          `Insufficient stock: need ${requiredTotal} (${numQty} × ${boxCount} boxes), only ${available} available.`;
        return;
      }
    });

    setKitItemErrors(errors);

    const summary = computeInsufficientStockItems();
    setInsufficientStockSummary(summary);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const quantityPerBox = KIT_QUANTITY_PER_BOX;
    const totalQuantity = boxCount * quantityPerBox;
    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === kitFormData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);

    const availableQuantity = getAvailableStock(kitFormData.itemCode);

    if (totalQuantity > availableQuantity) {
      setQuantityError(
        `Only ${availableQuantity} quantity is available to be stored.`,
      );
      return;
    }

    setQuantityError("");
    setConfirmError("");

    setShowAddModal(false);
    setShowConfirmKitModal(true);
  };

  const buildScanQueue = () => {
    const boxCount = Number(kitFormData.box) || 0;
    const inclusions =
      kitItems.length > 0 ? kitItems : kitFormData.kitItems || [];

    return inclusions
      .map((item) => {
        const perBox = Number(item.quantity) || 0;
        return {
          itemCode: item.itemCode,
          _id: item._id,
          name: item.name,
          perBox,
          totalRequired: perBox * boxCount,
        };
      })
      .filter((i) => i.totalRequired > 0 && i.itemCode);
  };

  const startScanning = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Permission Denied",
          "Camera access is required to scan inclusion batches.",
        );
        return;
      }
    }

    const queue = buildScanQueue();

    if (queue.length === 0) {
      Alert.alert(
        "No Inclusions",
        "This kit has no inclusion quantities to scan.",
      );
      return;
    }

    setScanQueue(queue);
    setScanQueueIndex(0);
    setScanAllocations({});
    setScanned(false);
    setScanFeedback(null);
    isProcessing.current = false;

    setShowConfirmKitModal(false);
    setScanningModalVisible(true);
  };

  const resetScanner = () => {
    isProcessing.current = false;
    setScanned(false);
  };

  const closeScanFeedback = () => {
    setScanFeedback(null);
    resetScanner();
  };

  const currentScanItem = useMemo(() => {
    if (!scanningModalVisible) return null;
    return scanQueue[scanQueueIndex] || null;
  }, [scanningModalVisible, scanQueue, scanQueueIndex]);

  const getScannedQtyForItem = (itemCode) => {
    const map = scanAllocations[itemCode] || {};
    return Object.values(map).reduce((sum, q) => sum + (Number(q) || 0), 0);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setScanned(true);
    processScannedBarcode(data);
  };

  const processScannedBarcode = (data) => {
    const item = currentScanItem;

    if (!item) {
      resetScanner();
      return;
    }

    const scannedBatchCode = String(data).trim();

    let foundItem = null;
    let scannedBatch = null;

    for (const invItem of items) {
      if (invItem && invItem.batches) {
        const batch = invItem.batches.find(
          (b) =>
            b && b.batchCode && String(b.batchCode).trim() === scannedBatchCode,
        );
        if (batch) {
          foundItem = invItem;
          scannedBatch = batch;
          break;
        }
      }
    }

    if (!scannedBatch) {
      Alert.alert("Invalid Barcode", "Batch not found in inventory.", [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    if (
      scannedBatch.status === "disposed" ||
      scannedBatch.status === "on-hold" ||
      scannedBatch.status === "pending"
    ) {
      Alert.alert(
        "Batch Unavailable",
        `Batch status is ${scannedBatch.status}. Cannot use for kit inclusion.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    if (foundItem.itemCode !== item.itemCode) {
      Alert.alert(
        "Wrong Item",
        `Expected ${item.name} (${item.itemCode}).\nScanned: ${
          foundItem.name || foundItem.itemCode
        }.\n\nPlease scan the correct inclusion batch.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const alreadyScanned = getScannedQtyForItem(item.itemCode);
    const remainingNeeded = item.totalRequired - alreadyScanned;

    if (remainingNeeded <= 0) {
      Alert.alert(
        "Already Fulfilled",
        `${item.name} is already satisfied (${item.totalRequired}/${item.totalRequired}).`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const today = new Date();
    if (new Date(scannedBatch.expirationDate) <= today) {
      Alert.alert(
        "Expired Batch",
        `Batch ${scannedBatch.batchCode} is expired.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const batchesForItem = foundItem.batches
      .filter((b) => {
        if (!b) return false;
        if (b.quantity <= 0) return false;
        if (b.status === "disposed" || b.status === "pending") return false;
        if (new Date(b.expirationDate) <= today) return false;
        return true;
      })
      .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));

    if (batchesForItem.length === 0) {
      Alert.alert("No Stock", "No valid batches available for this item.", [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    const earliestBatch = batchesForItem[0];

    const itemAllocations = scanAllocations[item.itemCode] || {};
    const getRemainingInBatch = (batch) => {
      const already = itemAllocations[batch.batchCode] || 0;
      return Math.max(0, Number(batch.quantity) - already);
    };

    if (earliestBatch.batchCode !== scannedBatch.batchCode) {
      const remainingInScanned = getRemainingInBatch(scannedBatch);

      if (remainingInScanned > 0) {
        let actualEarliest = null;
        for (const b of batchesForItem) {
          if (getRemainingInBatch(b) > 0) {
            actualEarliest = b;
            break;
          }
        }

        if (
          actualEarliest &&
          actualEarliest.batchCode !== scannedBatch.batchCode
        ) {
          setScanFeedback({
            type: "fefo",
            earliestBatch: actualEarliest,
            scannedBatch,
          });
          return;
        }
      }
    }

    const remainingInThisBatch = getRemainingInBatch(scannedBatch);

    if (remainingInThisBatch <= 0) {
      Alert.alert(
        "Batch Depleted",
        `Batch ${scannedBatch.batchCode} has no remaining stock.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const amountToPick = Math.min(remainingInThisBatch, remainingNeeded);

    if (amountToPick <= 0) {
      Alert.alert("Error", "Unable to scan from this batch.", [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    // Update allocations
    setScanAllocations((prev) => {
      const forItem = { ...(prev[item.itemCode] || {}) };
      forItem[scannedBatch.batchCode] =
        (forItem[scannedBatch.batchCode] || 0) + amountToPick;
      return { ...prev, [item.itemCode]: forItem };
    });

    // Check whether current inclusion is now fulfilled
    const newScannedTotal = getScannedQtyForItem(item.itemCode) + amountToPick;

    if (newScannedTotal >= item.totalRequired) {
      // Auto-advance to next inclusion (or finish)
      setTimeout(() => {
        setScanQueueIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          return nextIndex;
        });
        resetScanner();
      }, 400);
    } else {
      resetScanner();
    }
  };

  const totalScannedForQueue = useMemo(() => {
    return scanQueue.reduce(
      (sum, q) => sum + getScannedQtyForItem(q.itemCode),
      0,
    );
  }, [scanQueue, scanAllocations]);

  const totalRequiredForQueue = useMemo(() => {
    return scanQueue.reduce((sum, q) => sum + q.totalRequired, 0);
  }, [scanQueue]);

  const isQueueComplete = useMemo(() => {
    if (scanQueue.length === 0) return false;
    return scanQueue.every(
      (q) => getScannedQtyForItem(q.itemCode) >= q.totalRequired,
    );
  }, [scanQueue, scanAllocations]);

  const allInclusionsFulfilled = isQueueComplete;

  const handleSkipOrContinueShortfall = () => {
    // Warn the user about shortfalls, but allow Save
    const shortfalls = scanQueue
      .map((q) => {
        const scanned = getScannedQtyForItem(q.itemCode);
        return scanned < q.totalRequired
          ? `${q.name}: ${scanned}/${q.totalRequired} scanned`
          : null;
      })
      .filter(Boolean);

    if (shortfalls.length === 0) {
      setScanningModalVisible(false);
      performSaveKit();
      return;
    }

    setIncompleteScanShortfalls(shortfalls);
    setShowIncompleteScanConfirm(true);
  };

  const confirmSaveWithShortfall = () => {
    setShowIncompleteScanConfirm(false);
    setScanningModalVisible(false);
    performSaveKit();
  };

  const handleCancelScan = () => {
    setShowCancelScanConfirm(true);
  };

  const confirmCancelScan = () => {
    setShowCancelScanConfirm(false);
    setScanningModalVisible(false);
    setShowAddModal(true);
  };

  const performSaveKit = async () => {
    try {
      setUploading(true);
      setUploadProgress(30);

      const isRestock = !!kitFormData.itemCode;
      let imageUrl = null;

      if (image?.uri && !isRestock) {
        imageUrl = await uploadToCloudinary(image.uri, kitFormData.name);
        setUploadProgress(70);
      } else if (isRestock) {
        const existingItem = items.find(
          (i) => i.itemCode === kitFormData.itemCode,
        );
        if (existingItem?.itemImage) {
          imageUrl = existingItem.itemImage;
        }
      }

      const boxCount = Number(kitFormData.box);

      let kitItemsPayload = [];
      if (!isRestock) {
        kitItemsPayload = kitItems.map((item) => ({
          _id: item._id,
          name: item.name,
          itemCode: item.itemCode,
          quantity: item.quantity,
          category: item.category || "Kit Inclusions",
        }));
      }

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const kitProductPayload = {
        itemCode: kitFormData.itemCode || "",
        name: kitFormData.name,
        category: "Medical Kits",
        reorderLevel: parseInt(kitFormData.reorderLevel),
        supplierName: "Premiumed Enterprises",
        unitType: "Set",
        itemImage: imageUrl,
        isKit: true,
        box: boxCount,
        quantity: KIT_QUANTITY_PER_BOX,
        expirationDate: getDefaultKitExpiration().toISOString(),
        storageLocation: kitFormData.location,
        ...(kitItemsPayload.length > 0 && { kitItems: kitItemsPayload }),
        userId: storedUserId,
        username: storedUsername,
        role: storedRole,
        price: 0,
      };

      if (isRestock) {
        delete kitProductPayload.kitItems;
      }

      const productResponse = await fetch(
        `${BACKEND_URL}/api/inventoryPage/kit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(storedUserId ? { "x-user-id": storedUserId } : {}),
            ...(storedUsername ? { "x-username": storedUsername } : {}),
            ...(storedRole ? { "x-role": storedRole } : {}),
          },
          body: JSON.stringify(kitProductPayload),
        },
      );

      const productResult = await productResponse.json();

      if (!productResponse.ok) {
        if (productResult.missingItems) {
          const missingNames = productResult.missingItems
            .map((i) => i.name)
            .join(", ");
          setErrorFeedback({
            title: "Cannot restock kit",
            message: `These items are no longer available: ${missingNames}. Please recreate the kit.`,
          });
          return;
        }

        if (productResult.insufficientStock) {
          const stockDetails = productResult.insufficientStock
            .map(
              (s) =>
                `${s.name} (needs ${s.required}, available: ${s.available})`,
            )
            .join("\n");
          setErrorFeedback({
            title: "Insufficient stock",
            message: `The kit cannot be restocked because these items do not have enough stock:\n\n${stockDetails}`,
          });
          return;
        }

        throw new Error(
          productResult.message || "Failed to create kit product",
        );
      }

      setUploadProgress(100);

      setShowAddModal(false);
      setRestockSuccessData({
        itemName: kitFormData.name,
        batchCode: productResult.queued ? null : productResult.batch?.batchCode,
        expirationDate:
          productResult.batch?.expirationDate ||
          getDefaultKitExpiration().toISOString(),
        quantity: boxCount * KIT_QUANTITY_PER_BOX,
        imageUrl: imageUrl,
        isRestock: isRestock,
        queued: Boolean(productResult.queued),
        imageNotSynced: Boolean(
          productResult.queued && image?.uri && !imageUrl,
        ),
      });
      setShowSuccessModal(true);
      resetKitForm();
      await fetchItems();
      await fetchBatches();
    } catch (err) {
      console.error("Save kit error:", err);
      setErrorFeedback({
        title: "Unable to save kit",
        message: err.message || "Failed to save kit. Please try again.",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleItemPress = (item) => {
    setSelectedItem(item);
    setShowBatchModal(true);
  };

  const isMedicalKit = (item) => item.category === "Medical Kits";

  const getFilteredItems = () => {
    const searchLower = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        isMedicalKit(item) && item.name.toLowerCase().includes(searchLower),
    );
  };

  const getKitInclusionItems = () => {
    return items
      .filter(
        (item) => item.category === "Kit Inclusions" && !isMedicalKit(item),
      )
      .map((item) => {
        const itemBatches = batches.filter(
          (b) => b.itemCode === item.itemCode && b.status === "stored",
        );

        const validBatches = itemBatches.filter((batch) => {
          const expDate = new Date(batch.expirationDate);
          const today = new Date();
          return expDate >= today;
        });

        const availableQty = validBatches.reduce(
          (sum, b) => sum + (b.quantity || 0),
          0,
        );

        return { ...item, availableQty, validBatches };
      })
      .filter((item) => {
        // Show if it has stock OR is already selected in kitItems
        if (item.availableQty > 0) return true;
        return kitItems.some((k) => k._id === item._id);
      });
  };

  const isRestockMode = !!kitFormData.itemCode;

  const renderKitCard = (item) => {
    const itemBatches = batches.filter(
      (b) =>
        b.itemCode === item.itemCode &&
        COUNTED_BATCH_STATUSES.includes(b.status),
    );

    const displayQty =
      itemBatches.reduce((sum, b) => sum + (b.quantity || 0), 0) || 0;

    const latestBatch =
      itemBatches.length > 0 ? itemBatches[itemBatches.length - 1] : null;
    const latestLocation = latestBatch?.storageLocation || "R1-A";

    return (
      <TouchableOpacity
        key={item._id}
        style={styles.card}
        onPress={() => handleItemPress(item)}
      >
        {item.itemImage ? (
          <Image
            source={{ uri: item.itemImage }}
            style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 8,
              marginRight: 10,
              backgroundColor: "#D4AF37",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Package size={24} color="#FFF" />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSubtext}>
            Medical Kits • {latestLocation}
          </Text>
          <Text style={{ fontSize: 10, color: "#999" }}>{item.itemCode}</Text>
        </View>

        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>{displayQty}</Text>
        </View>

        <TouchableOpacity
          style={styles.retrieveBtn}
          onPress={() => {
            const existingItem = items.find(
              (i) => i.itemCode === item.itemCode,
            );
            setKitFormData({
              itemCode: item.itemCode,
              name: item.name,
              category: "Medical Kits",
              unitType: "Set",
              box: "",
              quantity: String(KIT_QUANTITY_PER_BOX),
              expirationDate: getDefaultKitExpiration(),
              location: latestLocation,
              supplierName: "Premiumed Enterprises",
              reorderLevel: String(item.reorderLevel || 50),
              kitItems: item.kitItems || [],
            });
            setKitItems(item.kitItems || []);
            if (existingItem?.itemImage) {
              setImage({ uri: existingItem.itemImage });
            } else {
              setImage(null);
            }
            setShowAddModal(true);
          }}
        >
          <PlusCircle size={20} color="#FFF" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const filteredItems = getFilteredItems();

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#1E293B",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {printerDevice ? (
            <Wifi size={18} color="#10B981" />
          ) : (
            <WifiOff size={18} color="#EF4444" />
          )}
          <Text
            style={{
              color: "#FFF",
              marginLeft: 8,
              fontSize: 12,
              fontWeight: "bold",
            }}
          >
            {printerStatus}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleScanPrinters}
          style={{
            backgroundColor: "#D4AF37",
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "bold" }}>
            {printerDevice ? "CHANGE PRINTER" : "CONNECT PRINTER"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#D4AF37" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            resetKitForm();
            setShowAddModal(true);
          }}
        >
          <PlusCircle size={20} color="#FFF" />
          <Text style={styles.addBtnText}>ADD</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#D4AF37" />
      ) : filteredItems.length > 0 ? (
        filteredItems.map(renderKitCard)
      ) : (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ color: "#6B7280", textAlign: "center" }}>
            No medical kits found.
          </Text>
        </View>
      )}

      <Modal visible={showPrinterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.batchModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECT XPRINTER</Text>
              <TouchableOpacity
                onPress={() => {
                  stopPrinterScan();
                  setShowPrinterModal(false);
                }}
              >
                <XCircle size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingVertical: 10 }}>
              {availablePrinters.length === 0 ? (
                <Text
                  style={{
                    textAlign: "center",
                    padding: 20,
                    color: "#6B7280",
                  }}
                >
                  Scanning for nearby Bluetooth printers...
                </Text>
              ) : (
                availablePrinters.map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    style={{
                      padding: 15,
                      borderBottomWidth: 1,
                      borderColor: "#EEE",
                    }}
                    onPress={() => handleSelectPrinter(device)}
                  >
                    <Text style={{ fontWeight: "bold", fontSize: 16 }}>
                      {device.name || "Unknown Printer"}
                    </Text>
                    <Text style={{ color: "#888", fontSize: 12 }}>
                      {device.id}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add / Restock Kit Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {kitFormData.itemCode ? "RESTOCK KIT" : "ADD NEW KIT"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  resetKitForm();
                  setShowAddModal(false);
                }}
              >
                <XCircle size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <View style={{ flex: 4 }}>
                  <Text style={styles.label}>
                    Kit Name
                    {!kitFormData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      kitFormData.itemCode
                        ? { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        : {},
                    ]}
                    value={kitFormData.name}
                    editable={!kitFormData.itemCode}
                    onChangeText={(v) =>
                      setKitFormData({ ...kitFormData, name: v })
                    }
                  />
                  {kitFormData.itemCode && (
                    <Text
                      style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}
                    >
                      Kit Code: {kitFormData.itemCode} (Restocking)
                    </Text>
                  )}
                  {kitFormErrors.name ? (
                    <Text style={styles.fieldErrorText}>
                      {kitFormErrors.name}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Image
                    {!kitFormData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  {image ? (
                    <TouchableOpacity
                      style={[
                        styles.imagePlaceholder,
                        {
                          padding: 5,
                          height: 45,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                      onPress={
                        kitFormData.itemCode
                          ? undefined
                          : () => showImageOptions()
                      }
                    >
                      <Image
                        source={{ uri: image.uri }}
                        style={{ width: 35, height: 35, borderRadius: 4 }}
                      />
                      {!kitFormData.itemCode && (
                        <RotateCcw
                          size={16}
                          color="#9CA3AF"
                          style={{ marginLeft: 5 }}
                        />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.imagePlaceholder,
                        {
                          padding: 5,
                          height: 45,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                      onPress={
                        kitFormData.itemCode
                          ? undefined
                          : () => showImageOptions()
                      }
                    >
                      <Upload size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={styles.label}>
                Category{" "}
                {!kitFormData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[styles.pickerContainer, { backgroundColor: "#E5E7EB" }]}
              >
                <Text
                  style={{
                    paddingHorizontal: 12,
                    color: "#6B7280",
                    fontSize: 14,
                  }}
                >
                  Medical Kits
                </Text>
              </View>

              <View style={[styles.row, { alignItems: "flex-start" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Case <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    maxLength={4}
                    value={kitFormData.box}
                    onChangeText={(v) => {
                      setKitFormData({ ...kitFormData, box: v });
                      setKitFormErrors((prev) => ({ ...prev, box: "" }));
                      // Recalculate insufficient-stock summary as box count changes
                      if (insufficientStockSummary.length > 0) {
                        setInsufficientStockSummary([]);
                      }
                    }}
                  />
                  {kitFormErrors.box ? (
                    <Text style={styles.fieldErrorText}>
                      {kitFormErrors.box}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Quantity</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: "#E5E7EB", color: "#6B7280" },
                    ]}
                    value={String(KIT_QUANTITY_PER_BOX)}
                    editable={false}
                  />
                  <Text
                    style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}
                  >
                    Fixed at {KIT_QUANTITY_PER_BOX} per box
                  </Text>
                </View>
              </View>

              <View style={[styles.row, { alignItems: "flex-start" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Expiration Date</Text>
                  <View
                    style={[
                      styles.dateSelector,
                      { backgroundColor: "#E5E7EB" },
                    ]}
                  >
                    <Text style={{ color: "#6B7280" }}>
                      {getDefaultKitExpiration().toDateString()}
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}
                  >
                    Auto-set to 2 years from today
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Reorder Level
                    {!kitFormData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      kitFormData.itemCode
                        ? { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        : {},
                    ]}
                    keyboardType="numeric"
                    value={kitFormData.reorderLevel}
                    editable={!kitFormData.itemCode}
                    onChangeText={(v) =>
                      setKitFormData({ ...kitFormData, reorderLevel: v })
                    }
                  />
                </View>
              </View>

              <View style={{ marginTop: 15 }}>
                <Text
                  style={[styles.label, { fontSize: 16, fontWeight: "bold" }]}
                >
                  KIT SUPPLIES
                  {!kitFormData.itemCode && (
                    <Text style={{ color: "#EF4444" }}> *</Text>
                  )}
                </Text>

                {kitFormErrors.items ? (
                  <Text style={styles.fieldErrorText}>
                    {kitFormErrors.items}
                  </Text>
                ) : null}

                {/* ===== NEW: inline insufficient stock banner ===== */}
                {insufficientStockSummary.length > 0 && (
                  <View
                    style={{
                      padding: 12,
                      backgroundColor: "#FEF2F2",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#FECACA",
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <AlertTriangle size={18} color="#B91C1C" />
                      <Text
                        style={{
                          color: "#B91C1C",
                          fontWeight: "700",
                          fontSize: 13,
                          marginLeft: 6,
                        }}
                      >
                        Insufficient Stock for Kit Supplies
                      </Text>
                    </View>
                    {insufficientStockSummary.map((s, i) => (
                      <Text
                        key={s._id || i}
                        style={{
                          color: "#991B1B",
                          fontSize: 12,
                          lineHeight: 18,
                          marginBottom: 3,
                        }}
                      >
                        • {s.name}: needs {s.required} per kit-box, available: {s.available}
                      </Text>
                    ))}
                  </View>
                )}

                {isRestockMode ? (
                  <View style={{ marginBottom: 10, opacity: 0.7 }}>
                    {kitItems.length > 0 ? (
                      <View
                        style={{
                          padding: 12,
                          backgroundColor: "#F3F4F6",
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#D1D5DB",
                          borderStyle: "dashed",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#6B7280",
                            marginBottom: 8,
                          }}
                        >
                          Kit Inclusions (cannot be modified during restock)
                        </Text>
                        {kitItems.map((item, index) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 6,
                              borderBottomWidth:
                                index < kitItems.length - 1 ? 1 : 0,
                              borderBottomColor: "#E5E7EB",
                            }}
                          >
                            <Text style={{ fontSize: 14, color: "#374151" }}>
                              • {item.name}
                            </Text>
                            <Text style={{ fontSize: 14, color: "#6B7280" }}>
                              {item.quantity} per kit-box
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View
                        style={{
                          padding: 20,
                          alignItems: "center",
                          backgroundColor: "#FEF3C7",
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#92400E", textAlign: "center" }}>
                          No kit items defined for this kit.
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <>
                    {getKitInclusionItems().length > 0 ? (
                      <View style={{ marginBottom: 10 }}>
                        {getKitInclusionItems().map((item) => {
                          const isAdded = kitItems.some(
                            (k) => k._id === item._id,
                          );
                          const addedItem = kitItems.find(
                            (k) => k._id === item._id,
                          );
                          const displayQty = item.availableQty || 0;
                          const perBox = Number(addedItem?.quantity) || 0;
                          const boxCount = Number(kitFormData.box) || 0;
                          const requiredTotal = perBox * boxCount;
                          const hasQty = perBox > 0 && boxCount > 0;
                          const isInsufficient =
                            isAdded && hasQty && requiredTotal > displayQty;

                          return (
                            <View key={item._id} style={{ marginBottom: 4 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingVertical: 12,
                                  paddingHorizontal: 10,
                                  borderBottomWidth: 1,
                                  borderBottomColor: "#E5E7EB",
                                  backgroundColor: isInsufficient
                                    ? "#FEF2F2"
                                    : isAdded
                                      ? "#F0FDF4"
                                      : "#FFFFFF",
                                  borderRadius: 8,
                                }}
                              >
                                <TouchableOpacity
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: isAdded }}
                                  accessibilityLabel={`Add ${item.name} to kit`}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 5,
                                    borderWidth: 2,
                                    borderColor: isAdded
                                      ? "#D4AF37"
                                      : "#D1D5DB",
                                    backgroundColor: isAdded
                                      ? "#D4AF37"
                                      : "transparent",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    marginRight: 12,
                                  }}
                                  onPress={() => {
                                    if (isAdded) {
                                      const index = kitItems.findIndex(
                                        (k) => k._id === item._id,
                                      );
                                      if (index !== -1) {
                                        removeKitItemFromKit(index);
                                        setKitItemErrors((prev) => {
                                          const updated = { ...prev };
                                          delete updated[item._id];
                                          return updated;
                                        });
                                      }
                                    } else {
                                      const newItem = {
                                        _id: item._id,
                                        name: item.name,
                                        itemCode: item.itemCode,
                                        quantity: 1,
                                        category: item.category,
                                      };
                                      setKitItems((prev) => [...prev, newItem]);
                                      setKitItemErrors((prev) => ({
                                        ...prev,
                                        [item._id]: "",
                                      }));
                                    }
                                    // recompute banner
                                    setInsufficientStockSummary([]);
                                  }}
                                >
                                  {isAdded && (
                                    <Check
                                      size={16}
                                      color="#FFF"
                                      strokeWidth={3}
                                    />
                                  )}
                                </TouchableOpacity>

                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{
                                      fontWeight: "500",
                                      fontSize: 14,
                                    }}
                                  >
                                    {item.name}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: "#6B7280",
                                    }}
                                  >
                                    {displayQty} available •{" "}
                                    {item.itemCode || "N/A"}
                                  </Text>
                                </View>

                                {isAdded && (
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      marginLeft: 10,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: "#6B7280",
                                        marginRight: 6,
                                      }}
                                    >
                                      Quantity:
                                      <Text style={{ color: "#EF4444" }}>
                                        *
                                      </Text>
                                    </Text>

                                    <TextInput
                                      style={{
                                        width: 55,
                                        height: 35,
                                        borderWidth: 1,
                                        borderColor: kitItemErrors[item._id]
                                          ? "#EF4444"
                                          : isInsufficient
                                            ? "#EF4444"
                                            : "#D1D5DB",
                                        borderRadius: 6,
                                        paddingHorizontal: 8,
                                        fontSize: 14,
                                        textAlign: "center",
                                        backgroundColor: "#FFF",
                                      }}
                                      keyboardType="numeric"
                                      value={
                                        addedItem?.quantity === ""
                                          ? ""
                                          : String(addedItem?.quantity ?? "")
                                      }
                                      onChangeText={(value) => {
                                        const index = kitItems.findIndex(
                                          (k) => k._id === item._id,
                                        );
                                        if (index !== -1) {
                                          updateKitItemQuantity(index, value);
                                        }
                                        // recompute banner on every keystroke
                                        setInsufficientStockSummary([]);
                                      }}
                                    />
                                  </View>
                                )}
                              </View>

                              {isAdded && kitItemErrors[item._id] && (
                                <Text
                                  style={{
                                    color: "#EF4444",
                                    fontSize: 11,
                                    marginTop: 4,
                                    marginLeft: 10,
                                    marginBottom: 4,
                                  }}
                                >
                                  {kitItemErrors[item._id]}
                                </Text>
                              )}

                              {/* Live per-item hint (no submit required) */}
                              {isAdded && isInsufficient && !kitItemErrors[item._id] && (
                                <Text
                                  style={{
                                    color: "#B91C1C",
                                    fontSize: 11,
                                    marginTop: 4,
                                    marginLeft: 10,
                                    marginBottom: 4,
                                  }}
                                >
                                  Needs {requiredTotal} 
                                  , only {displayQty}{" "}
                                  available.
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View
                        style={{
                          padding: 20,
                          alignItems: "center",
                          backgroundColor: "#F9FAFB",
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#6B7280", textAlign: "center" }}>
                          No supplies with category "Kit Inclusions" found.
                        </Text>
                      </View>
                    )}

                    {kitItems.length > 0 && (
                      <View
                        style={{
                          marginTop: 10,
                          padding: 12,
                          backgroundColor: "#F0FDF4",
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#D1FAE5",
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "bold",
                            color: "#10B981",
                            marginBottom: 5,
                          }}
                        >
                          Selected Items ({kitItems.length})
                        </Text>
                        {kitItems.map((item, index) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 3,
                              borderBottomWidth:
                                index < kitItems.length - 1 ? 1 : 0,
                              borderBottomColor: "#E5E7EB",
                            }}
                          >
                            <Text style={{ fontSize: 13 }}>{item.name}</Text>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "500",
                                color: "#D4AF37",
                              }}
                            >
                              {item.quantity} per kit-box
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>

              <Text style={styles.label}>
                Storage Location
                {!kitFormData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[
                  styles.pickerContainer,
                  kitFormData.itemCode ? { backgroundColor: "#E5E7EB" } : {},
                ]}
              >
                <Picker
                  selectedValue={kitFormData.location}
                  onValueChange={(v) =>
                    setKitFormData({ ...kitFormData, location: v })
                  }
                  enabled={!kitFormData.itemCode}
                >
                  {renderRackItems()}
                </Picker>
              </View>

              <Text style={styles.label}>
                Supplier
                {!kitFormData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[styles.pickerContainer, { backgroundColor: "#E5E7EB" }]}
              >
                <Picker selectedValue="Premiumed Enterprises" enabled={false}>
                  <Picker.Item
                    label="Premiumed Enterprises"
                    value="Premiumed Enterprises"
                  />
                </Picker>
              </View>

              {uploading && (
                <View style={{ marginVertical: 10 }}>
                  <View
                    style={{
                      height: 4,
                      backgroundColor: "#E5E7EB",
                      borderRadius: 2,
                    }}
                  >
                    <View
                      style={{
                        width: `${uploadProgress}%`,
                        height: "100%",
                        backgroundColor: "#D4AF37",
                        borderRadius: 2,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 5,
                      color: "#6B7280",
                      fontSize: 12,
                    }}
                  >
                    {uploadProgress < 70
                      ? "Uploading image..."
                      : "Saving kit..."}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, uploading && { opacity: 0.7 }]}
                onPress={handleSaveKit}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {kitFormData.itemCode ? "CONFIRM RESTOCK" : "SAVE KIT"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmKitModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowConfirmKitModal(false);
          setShowAddModal(true);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmTitle}>
                  {kitFormData.itemCode
                    ? "Confirm Kit Restock"
                    : "Confirm Add Kit"}
                </Text>
                <Text style={styles.confirmSubtitle}>
                  Review the kit details before continuing.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowConfirmKitModal(false);
                  setShowAddModal(true);
                }}
                style={styles.confirmClose}
              >
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {confirmError ? (
              <View style={styles.confirmErrorBox}>
                <AlertTriangle size={18} color="#B91C1C" />
                <Text style={styles.confirmErrorText}>{confirmError}</Text>
              </View>
            ) : null}

            <View style={styles.supplyPreview}>
              <View style={styles.supplyIcon}>
                {image?.uri ? (
                  <Image
                    source={{ uri: image.uri }}
                    style={styles.supplyImage}
                  />
                ) : (
                  <Package size={25} color="#D4AF37" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supplyName}>{kitFormData.name}</Text>
                {kitFormData.itemCode && (
                  <Text style={styles.itemCode}>{kitFormData.itemCode}</Text>
                )}
                <Text style={styles.categoryText}>
                  Medical Kits • {kitFormData.unitType}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.confirmDetails}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Box</Text>
                <Text style={styles.detailValue}>{kitFormData.box || 0}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity per Box</Text>
                <Text style={styles.detailValue}>{KIT_QUANTITY_PER_BOX}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total Kits</Text>
                <Text style={styles.detailValue}>
                  {Number(kitFormData.box || 0) * KIT_QUANTITY_PER_BOX}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reorder Level</Text>
                <Text style={styles.detailValue}>
                  {kitFormData.reorderLevel}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expiration</Text>
                <Text style={styles.detailValue}>
                  {getDefaultKitExpiration().toDateString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Storage Location</Text>
                <Text style={styles.detailValue}>{kitFormData.location}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Supplier</Text>
                <Text style={styles.detailValue}>
                  {kitFormData.supplierName}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Image</Text>
                <View style={styles.imageStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: image?.uri ? "#22C55E" : "#9CA3AF",
                      },
                    ]}
                  />
                  <Text style={styles.detailValue}>
                    {image?.uri ? "Included" : "None"}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#111827",
                    marginBottom: 8,
                  }}
                >
                  Kit Inclusions ({kitItems.length})
                </Text>

                {kitItems.map((item, index) => (
                  <View
                    key={item._id || index}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                      backgroundColor: "#F9FAFB",
                      borderRadius: 8,
                      marginBottom: 5,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        {item.name}
                      </Text>
                      {item.itemCode && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#9CA3AF",
                            marginTop: 2,
                          }}
                        >
                          {item.itemCode}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: "#D4AF37",
                      }}
                    >
                      {item.quantity} / kit-box
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.confirmNotice}>
              <CheckCircle size={16} color="#D4AF37" />
              <Text style={styles.confirmNoticeText}>
                {kitFormData.itemCode
                  ? "Next step: scan inclusion batches to verify FEFO."
                  : "Next step: scan inclusion batches to verify FEFO."}
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setConfirmError("");
                  setShowConfirmKitModal(false);
                  setShowAddModal(true);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={async () => {
                  if (!validateKitBeforeSave()) return;
                  await startScanning();
                }}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>
                  {kitFormData.itemCode ? "Yes, Restock" : "Yes, Add"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* SCANNING MODAL  */}
      <Modal
        visible={scanningModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCancelScan}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.batchModalContainer, { paddingBottom: 0 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalSubTitle}>
                  VERIFY INCLUSIONS ({scanQueueIndex + 1}/{scanQueue.length})
                </Text>
                <Text style={styles.modalTitle}>
                  {currentScanItem?.name || "Scanning complete"}
                </Text>
              </View>
              <TouchableOpacity onPress={handleCancelScan}>
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {/* Current inclusion banner */}
            {currentScanItem ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <Text style={{ fontSize: 13, color: "#6B7280" }}>
                  Scan {currentScanItem.perBox} per kit-box ×{" "}
                  {Number(kitFormData.box) || 0} boxes ={" "}
                  <Text style={{ fontWeight: "700", color: "#111827" }}>
                    {currentScanItem.totalRequired} pcs
                  </Text>{" "}
                  required
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                  Scanned:{" "}
                  <Text style={{ fontWeight: "700", color: "#111827" }}>
                    {getScannedQtyForItem(currentScanItem.itemCode)}/
                    {currentScanItem.totalRequired}
                  </Text>
                </Text>
              </View>
            ) : null}

            {/* Camera */}
            <View
              style={{
                height: 150,
                margin: 16,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#000",
              }}
            >
              {!scanned ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={handleBarCodeScanned}
                  barcodeSettings={{
                    barcodeTypes: ["qr", "ean13", "code128", "code39"],
                  }}
                />
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "#000",
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: "#D4AF37",
                      padding: 15,
                      borderRadius: 10,
                    }}
                    onPress={resetScanner}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                      SCAN NEXT BATCH
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Progress list */}
            <ScrollView style={{ maxHeight: 160, paddingHorizontal: 16 }}>
              {scanQueue.map((q, idx) => {
                const scanned = getScannedQtyForItem(q.itemCode);
                const isDone = scanned >= q.totalRequired;
                const isCurrent = idx === scanQueueIndex;
                return (
                  <View
                    key={q.itemCode + idx}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: "#E5E7EB",
                      backgroundColor: isCurrent ? "#FEF3C7" : "transparent",
                      paddingHorizontal: 6,
                      borderRadius: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: isDone ? "#059669" : "#374151",
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {q.name}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: isDone ? "#059669" : "#6B7280",
                        }}
                      >
                        {scanned}/{q.totalRequired}
                      </Text>
                      {isDone && (
                        <Check size={16} color="#10B981" strokeWidth={3} />
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Actions */}
            <View
              style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10 }}
            >
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { flex: 1, backgroundColor: "#6B7280" },
                ]}
                onPress={handleCancelScan}
              >
                <Text style={styles.saveBtnText}>CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { flex: 1, backgroundColor: "#059669" },
                ]}
                onPress={handleSkipOrContinueShortfall}
              >
                <Text style={styles.saveBtnText}>SAVE KIT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showIncompleteScanConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIncompleteScanConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
              <View style={styles.confirmIcon}>
                <AlertTriangle size={24} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmTitle}>Incomplete Scan</Text>
                <Text style={styles.confirmSubtitle}>
                  Some inclusions have not been fully scanned.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowIncompleteScanConfirm(false)}
                style={styles.confirmClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel saving"
              >
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 220 }}
              showsVerticalScrollIndicator={false}
            >
              {incompleteScanShortfalls.map((shortfall, index) => (
                <View
                  key={`${shortfall}-${index}`}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 6,
                    borderRadius: 8,
                    backgroundColor: "#FFFBEB",
                    borderWidth: 1,
                    borderColor: "#FDE68A",
                  }}
                >
                  <Text style={{ color: "#92400E", fontSize: 13 }}>
                    {shortfall}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <Text
              style={{
                color: "#6B7280",
                fontSize: 12,
                lineHeight: 18,
                marginTop: 12,
              }}
            >
              Putaway will deduct whatever stock is available at that time
              (FEFO). Continue saving?
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowIncompleteScanConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Keep Scanning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmSaveWithShortfall}
              >
                <Text style={styles.confirmButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showCancelScanConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelScanConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmTitle}>Cancel Scanning?</Text>
                <Text style={styles.confirmSubtitle}>
                  Your kit details will be preserved. You can try scanning
                  again.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCancelScanConfirm(false)}
                style={styles.confirmClose}
                accessibilityRole="button"
                accessibilityLabel="Keep scanning"
              >
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCancelScanConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Keep Scanning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: "#EF4444" }]}
                onPress={confirmCancelScan}
              >
                <Text style={styles.confirmButtonText}>Cancel Scan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* FEFO Warning Modal (mirrors picking) */}
      {scanFeedback && (
        <Modal
          transparent
          visible={Boolean(scanFeedback)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: 16,
                padding: 22,
                width: "100%",
                maxWidth: 400,
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: "#FEF3C7",
                  justifyContent: "center",
                  alignItems: "center",
                  alignSelf: "center",
                  marginBottom: 12,
                }}
              >
                <AlertTriangle size={30} color="#B45309" />
              </View>

              <Text
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  letterSpacing: 1.2,
                  color: "#B45309",
                  fontWeight: "700",
                }}
              >
                FEFO
              </Text>
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#111827",
                  marginTop: 4,
                }}
              >
                Pick the earliest expiry first
              </Text>

              <View style={{ marginTop: 16 }}>
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 1.2,
                    color: "#6B7280",
                    fontWeight: "700",
                  }}
                >
                  SCAN NEXT
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: "#111827",
                    marginTop: 4,
                  }}
                >
                  {scanFeedback.earliestBatch.batchCode}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                  Expires{" "}
                  {new Date(
                    scanFeedback.earliestBatch.expirationDate,
                  ).toLocaleDateString()}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 8,
                  }}
                >
                  Batch {scanFeedback.scannedBatch.batchCode} should be picked
                  later.
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  marginTop: 20,
                  backgroundColor: "#B45309",
                  borderRadius: 10,
                  paddingVertical: 14,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                }}
                onPress={closeScanFeedback}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "700",
                    fontSize: 13,
                    letterSpacing: 0.6,
                  }}
                >
                  SCAN CORRECT BATCH
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {/* Batch Modal */}
      <Modal visible={showBatchModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.batchModalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedItem?.itemImage
                      ? "Change kit photo"
                      : "Add kit photo"
                  }
                  disabled={uploading}
                  onPress={() => showImageOptions(saveBatchModalImage)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    marginRight: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F3F4F6",
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator color="#D4AF37" />
                  ) : selectedItem?.itemImage ? (
                    <Image
                      source={{ uri: selectedItem.itemImage }}
                      style={{ width: 48, height: 48, borderRadius: 6 }}
                    />
                  ) : (
                    <Upload size={20} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
                <View>
                  <Text style={styles.modalSubTitle}>
                    ITEM CODE: {selectedItem?.itemCode}
                  </Text>
                  <Text style={styles.modalTitle}>{selectedItem?.name}</Text>
                  <TouchableOpacity
                    disabled={uploading}
                    onPress={() => showImageOptions(saveBatchModalImage)}
                  >
                    <Text style={{ color: "#9A6700", fontSize: 12 }}>
                      {uploading
                        ? "Updating photo..."
                        : selectedItem?.itemImage
                          ? "Change photo"
                          : "Add photo"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowBatchModal(false)}>
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterRow}>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={sortOrder}
                  style={styles.miniPicker}
                  onValueChange={setSortOrder}
                >
                  <Picker.Item label="QTY Low → High" value="QTY Low → High" />
                  <Picker.Item label="QTY High → Low" value="QTY High → Low" />
                </Picker>
              </View>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={expirySort}
                  style={styles.miniPicker}
                  onValueChange={setExpirySort}
                >
                  <Picker.Item label="Sort Expiry" value="Sort Expiry" />
                  <Picker.Item label="Nearest Exp." value="Nearest Exp." />
                </Picker>
              </View>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={fefoFilter}
                  style={styles.miniPicker}
                  onValueChange={setFefoFilter}
                >
                  <Picker.Item label="All FEFO" value="All FEFO" />
                  <Picker.Item label="Safe" value="Safe" />
                </Picker>
              </View>
            </View>

            <View style={styles.batchTableHeader}>
              <Text style={[styles.columnHeader, { flex: 1.5 }]}>BATCH #</Text>
              <Text style={[styles.columnHeader, { flex: 1 }]}>QTY</Text>
              <Text style={[styles.columnHeader, { flex: 2 }]}>EXP. DATE</Text>
              <Text style={[styles.columnHeader, { flex: 1.5 }]}>FEFO</Text>
            </View>

            <ScrollView style={styles.batchList}>
              {getFilteredBatches().map((batch, index) => {
                const fefo = getFefoStatus(batch.expirationDate);
                return (
                  <View
                    key={index}
                    style={[
                      styles.batchRow,
                      { flexDirection: "column", paddingVertical: 10 },
                    ]}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Text style={[styles.batchCell, { flex: 1.5 }]}>
                        {batch.batchCode}
                      </Text>
                      <Text style={[styles.batchCell, { flex: 1 }]}>
                        {batch.quantity}
                      </Text>
                      <Text style={[styles.batchCell, { flex: 2 }]}>
                        {new Date(batch.expirationDate).toLocaleDateString()}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { flex: 1.5, backgroundColor: fefo.bg },
                        ]}
                      >
                        <Text
                          style={[styles.statusText, { color: fefo.color }]}
                        >
                          {fefo.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {errorFeedback && (
        <Modal
          visible={Boolean(errorFeedback)}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setErrorFeedback(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.errorModalContainer}>
              <View style={styles.errorIconContainer}>
                <AlertTriangle size={34} color="#B91C1C" />
              </View>
              <Text style={styles.errorEyebrow}>ACTION NOT COMPLETED</Text>
              <Text style={styles.errorTitle}>{errorFeedback.title}</Text>
              <Text style={styles.errorMessage}>{errorFeedback.message}</Text>
              <TouchableOpacity
                style={styles.errorButton}
                onPress={() => setErrorFeedback(null)}
              >
                <Text style={styles.errorButtonText}>GOT IT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContainer}>
            <View style={styles.successIconContainer}>
              <CheckCircle size={38} color="#059669" />
            </View>
            <Text style={styles.successEyebrow}>
              {restockSuccessData?.queued
                ? "SAVED OFFLINE"
                : "KIT RESTOCK COMPLETE"}
            </Text>
            <Text style={styles.successTitle}>
              {restockSuccessData?.queued
                ? "Saved Offline"
                : "Save Successful!"}
            </Text>
            {restockSuccessData?.queued && (
              <Text style={styles.successMessage}>
                This kit change will sync when you reconnect. The server will
                assign the batch code after syncing.
                {restockSuccessData?.imageNotSynced
                  ? " The selected image was not uploaded and must be added after reconnecting."
                  : ""}
              </Text>
            )}
            {!restockSuccessData?.queued && (
              <Text style={styles.successMessage}>
                Your kit inventory has been updated successfully.
              </Text>
            )}
            {restockSuccessData?.batchCode && (
              <View
                style={{
                  width: 220,
                  height: 100,
                  alignSelf: "center",
                  marginVertical: 10,
                }}
              >
                <Image
                  source={{
                    uri: `https://quickchart.io/barcode?text=${restockSuccessData?.batchCode}&type=code128&width=200&height=80`,
                  }}
                  style={{ width: 220, height: 80, alignSelf: "center" }}
                  resizeMode="contain"
                />
                <Text
                  style={{
                    alignSelf: "center",
                    marginTop: -105,
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  {restockSuccessData?.batchCode}
                </Text>
              </View>
            )}
            <View style={styles.successDetailBox}>
              <Text style={styles.detailLabel}>
                Kit Name:{" "}
                <Text style={styles.detailValue}>
                  {restockSuccessData?.itemName}
                </Text>
              </Text>
              <Text style={styles.detailLabel}>
                Batch Code:{" "}
                <Text style={styles.detailValue}>
                  {restockSuccessData?.batchCode || "Assigned after sync"}
                </Text>
              </Text>
              <Text style={styles.detailLabel}>
                Quantity:{" "}
                <Text style={styles.detailValue}>
                  {restockSuccessData?.quantity} kits
                </Text>
              </Text>
            </View>

            {!restockSuccessData?.queued && (
              <View style={styles.printSection}>
                <Text style={styles.printLabel}>Labels to print:</Text>
                <TextInput
                  style={styles.printInput}
                  keyboardType="numeric"
                  value={printQty}
                  onChangeText={setPrintQty}
                />
              </View>
            )}
            {!restockSuccessData?.queued && (
              <TouchableOpacity
                style={[styles.saveBtn, styles.printButton]}
                onPress={handlePrintLabel}
                disabled={isPrinting}
              >
                {isPrinting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Printer size={20} color="#FFF" style={styles.printIcon} />
                    <Text style={styles.saveBtnText}>PRINT LABELS</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                setShowSuccessModal(false);
              }}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {successFeedback && (
        <Modal
          visible={Boolean(successFeedback)}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setSuccessFeedback(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.successModalContainer}>
              <CheckCircle size={60} color="#10B981" />
              <Text style={styles.successTitle}>{successFeedback.title}</Text>
              <Text style={styles.detailValue}>{successFeedback.message}</Text>
              <TouchableOpacity
                onPress={() => setSuccessFeedback(null)}
                style={styles.dismissBtn}
              >
                <Text style={styles.dismissBtnText}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}