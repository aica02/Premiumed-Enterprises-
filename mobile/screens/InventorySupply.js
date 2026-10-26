import React, { useState, useEffect } from "react";
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
  RefreshControl,
  Image,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Search,
  PlusCircle,
  XCircle,
  Calendar,
  CheckCircle,
  Package,
  Upload,
  RotateCcw,
  Layers,
  Info,
  AlertTriangle,
  Check,
  Wifi, //need icomment
  WifiOff,
  Printer,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

import { CATEGORIES } from "../components/Categories";
import { UNITTYPES } from "../components/UnitType";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";
import { offlineFetch as fetch } from "../shared/offlineApi";
import { readJsonResponse } from "../shared/readJsonResponse";
import useWarehouseMapAdditions from "../shared/useWarehouseMapAdditions";

//need icomment
import {
  autoConnectPrinter,
  scanForPrinters,
  connectToScannedPrinter,
  printBarcodeTSPL,
  stopPrinterScan,
} from "../utils/PrinterService";

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;
const MAX_QUANTITY = 1000;
const COUNTED_BATCH_STATUSES = ["stored", "for disposal"];
const PPE_CATEGORY = "Personal Protective Equipment (PPE)";
const INJECTION_SHARPS_CATEGORY = "Injection & Sharps Supplies";
const INTRAVENOUS_FLUIDS_CATEGORY = "Intravenous Fluids & Solutions";
const MEDICAL_KITS_CATEGORY = "Medical Kits";
const KIT_INCLUSIONS_CATEGORY = "Kit Inclusions";

export default function InventorySupply({
  navigation,
  staffName,
  staffPosition,
  items,
  setItems,
  batches,
  setBatches,
  suppliers,
  setSuppliers,
  fetchItems,
  fetchBatches,
  fetchSuppliers,
  onRefresh,
  refreshing,
  styles,
}) {
  const additionalLocations = useWarehouseMapAdditions();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("inventory");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [sortOrder, setSortOrder] = useState("QTY Low → High");
  const [expirySort, setExpirySort] = useState("Sort Expiry");
  const [fefoFilter, setFefoFilter] = useState("All FEFO");
  const [stockFilter, setStockFilter] = useState("All Stock");

  const [restockSuccessData, setRestockSuccessData] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorFeedback, setErrorFeedback] = useState(null);

  //need icomment
  const [successFeedback, setSuccessFeedback] = useState(null);
  const [printQty, setPrintQty] = useState("1");
  const [printerDevice, setPrinterDevice] = useState(null);
  const [printerStatus, setPrinterStatus] = useState("Printer Disconnected");
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [quantityError, setQuantityError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formData, setFormData] = useState({
    itemCode: "",
    itemName: "",
    category: "Cardiovascular & Emergency Medications",
    unitType: "Piece",
    quantity: "",
    box: "",
    expirationDate: new Date(),
    location: "R1-A",
    supplierName: "Supplier A",
    reorderLevel: "50",
  });

  const boxFieldLabel = formData.unitType === "Box" ? "Case" : "Box";
  const quantityFieldLabel = `No. of ${formData.unitType} per ${boxFieldLabel}`;

  //need icomment
  useEffect(() => {
    autoConnectPrinter(setPrinterStatus)
      .then((device) => {
        if (device) setPrinterDevice(device);
      })
      .catch((error) => {
        console.error("Printer auto-connect failed:", error);
        setPrinterStatus("Printer Disconnected");
      });

    return () => {
      stopPrinterScan();
    };
  }, []);
  //need icomment

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

  const getSelectableLocations = (category) => {
    const occupiedLocations = new Set(
      batches
        .filter(
          (batch) => batch.status !== "disposed" && Number(batch.quantity) > 0,
        )
        .map((batch) => batch.storageLocation),
    );

    const racks = [...warehouseMapLayout.racks].sort(
      (firstRack, secondRack) => {
        const [, firstNumber, firstSlot] = firstRack.id.match(/^R(\d+)-(.+)$/);
        const [, secondNumber, secondSlot] =
          secondRack.id.match(/^R(\d+)-(.+)$/);
        return (
          Number(firstNumber) - Number(secondNumber) ||
          firstSlot.localeCompare(secondSlot)
        );
      },
    );
    const palletPrefixes =
      category === PPE_CATEGORY
        ? ["P4"]
        : category === INJECTION_SHARPS_CATEGORY
          ? ["P3"]
          : category === MEDICAL_KITS_CATEGORY
            ? ["P1"]
            : category === INTRAVENOUS_FLUIDS_CATEGORY
              ? ["P2", "P5"]
              : null;
    const addedRacks = additionalLocations.filter(
      (location) =>
        location.type === "rack" &&
        (category === KIT_INCLUSIONS_CATEGORY
          ? location.id.startsWith("R6-")
          : !location.id.startsWith("R6-")),
    );
    const addedPallets = additionalLocations.filter(
      (location) =>
        location.type === "pallet" &&
        palletPrefixes?.some((prefix) => location.id.startsWith(`${prefix}-`)),
    );
    const locations = palletPrefixes
      ? [
          ...warehouseMapLayout.pallets.filter(({ id }) =>
            palletPrefixes.some((prefix) => id.startsWith(`${prefix}-`)),
          ),
          ...addedPallets,
        ]
      : category === KIT_INCLUSIONS_CATEGORY
        ? [...racks.filter(({ id }) => id.startsWith("R6-")), ...addedRacks]
        : [...racks.filter(({ id }) => !id.startsWith("R6-")), ...addedRacks];

    return locations.filter(
      ({ id }) => formData.itemCode || !occupiedLocations.has(id),
    );
  };

  const renderRackItems = () => {
    return getSelectableLocations(formData.category).map(({ id }) => (
      <Picker.Item key={id} label={id} value={id} />
    ));
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

      if (sortOrder === "QTY Low → High") {
        return a.quantity - b.quantity;
      } else if (sortOrder === "QTY High → Low") {
        return b.quantity - a.quantity;
      }
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

    let uri = compressed.uri;
    if (
      Platform.OS === "android" &&
      !uri.startsWith("file://") &&
      !uri.startsWith("content://")
    ) {
      uri = `file://${uri}`;
    }

    const formData = new FormData();
    formData.append("file", {
      uri,
      type: "image/jpeg",
      name: filename,
    });
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "inventory-items");

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const response = await globalThis.fetch(url, {
      method: "POST",
      body: formData,
    });
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
      if (Platform.OS !== "android") {
        const permissionResult =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(
            "Permission Required",
            "Please grant camera roll permissions.",
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        const uri = result.assets?.[0]?.uri;
        if (!uri) {
          throw new Error("The image picker did not return an image.");
        }
        onSelected({ uri });
      }
    } catch (error) {
      console.error("Supply image picker failed:", error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to pick image.",
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
          "Connect to the internet to upload and save the product photo.",
        );
        return;
      }

      setUploading(true);
      const imageUrl = await uploadToCloudinary(
        selectedImage.uri,
        selectedItem.name,
      );
      if (!imageUrl) return;

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
      const result = await readJsonResponse(response, "Product photo update");
      if (!response.ok) {
        throw new Error(
          result?.message ||
            `Product photo update returned HTTP ${response.status}.`,
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
          ? "The new product photo is queued and will sync when the connection is restored."
          : "The product photo has been updated.",
      );
    } catch (error) {
      console.error("Product photo update failed:", error);
      Alert.alert(
        "Photo Update Failed",
        error.message || "Unable to update the product photo.",
      );
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      itemCode: "",
      itemName: "",
      category: "Cardiovascular & Emergency Medications",
      unitType: "Box",
      quantity: "",
      box: "",
      expirationDate: new Date(),
      location: "R1-A",
      supplierName: "Supplier A",
      reorderLevel: "50",
    });
    setImage(null);
    setQuantityError("");
    setFieldErrors({});
  };

  const handleSaveItem = () => {
    const errors = {};
    const isRestock = !!formData.itemCode;

    if (!isRestock && !formData.itemName.trim()) {
      errors.itemName = "Supply name is required.";
    }
    if (!formData.category) errors.category = "Category is required.";
    if (!formData.unitType) errors.unitType = "Unit type is required.";

    if (!isRestock && !formData.quantity) {
      errors.quantity = `${quantityFieldLabel} is required.`;
    }

    if (!formData.box) errors.box = `${boxFieldLabel} is required.`;

    if (!isRestock && !formData.reorderLevel) {
      errors.reorderLevel = "Reorder level is required.";
    }
    if (!formData.location) errors.location = "Storage location is required.";
    if (!formData.supplierName) errors.supplierName = "Supplier is required.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const box = Number(formData.box);
    if (!Number.isFinite(box) || box <= 0) {
      setFieldErrors({ box: `${boxFieldLabel} must be greater than 0.` });
      return;
    }

    let unitsPerBox = 0;
    if (isRestock) {
      const existingItem = items.find((i) => i.itemCode === formData.itemCode);
      unitsPerBox = Number(existingItem?.quantityPerBox) || 0;
      if (unitsPerBox <= 0) {
        setFieldErrors({
          quantity: "Item has no quantity per box configured.",
        });
        return;
      }
    } else {
      unitsPerBox = Number(formData.quantity);
      if (!Number.isFinite(unitsPerBox) || unitsPerBox <= 0) {
        setFieldErrors({ quantity: "Quantity must be greater than 0." });
        return;
      }
    }

    const totalUnits = unitsPerBox * box;

    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === formData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    if (totalUnits > availableQuantity) {
      setQuantityError(
        `Only ${availableQuantity} quantity is available to be stored.`,
      );
      return;
    }

    setQuantityError("");

    if (!isRestock && Number(formData.reorderLevel) < 0) {
      setFieldErrors({ reorderLevel: "Reorder level cannot be negative." });
      return;
    }

    setFieldErrors({});
    setShowAddModal(false);
    setShowConfirmModal(true);
  };

  const handleQuantityChange = (value) => {
    setFormData({ ...formData, quantity: value });
    setFieldErrors((prev) => ({ ...prev, quantity: "" }));

    const unitsPerBox = Number(value);
    const box = Number(formData.box) || 0;
    const totalUnits = unitsPerBox * box;

    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === formData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    setQuantityError(
      value && Number.isFinite(unitsPerBox) && totalUnits > availableQuantity
        ? `Only ${availableQuantity} quantity is available to be stored.`
        : "",
    );
  };

  const handleBoxChange = (value) => {
    setFormData({ ...formData, box: value });
    setFieldErrors((prev) => ({ ...prev, box: "" }));

    const box = Number(value);
    const unitsPerBox = Number(formData.quantity) || 0;
    const totalUnits = box * unitsPerBox;

    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === formData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    setQuantityError(
      value && Number.isFinite(box) && totalUnits > availableQuantity
        ? `Only ${availableQuantity} quantity is available to be stored.`
        : "",
    );
  };

  //need icomment
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
      const connectedDevice = await connectToScannedPrinter(device);
      setPrinterDevice(connectedDevice);
      setPrinterStatus(`Connected to ${device.name || "Xprinter"}`);
      setShowPrinterModal(false);
    } catch (error) {
      console.error("Printer connection failed:", error);
      setPrinterStatus("Disconnected");
      Alert.alert(
        "Connection Error",
        error.message || "Could not connect to printer.",
      );
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
  //need icomment

  const performSave = async () => {
    try {
      setUploading(true);
      setUploadProgress(0);

      let imageUrl = null;
      if (image?.uri) {
        if (formData.itemCode) {
          const existingItem = items.find(
            (i) => i.itemCode === formData.itemCode,
          );
          if (existingItem?.itemImage !== image.uri) {
            setUploadProgress(30);
            imageUrl = await uploadToCloudinary(image.uri, formData.itemName);
            setUploadProgress(70);
          } else {
            imageUrl = existingItem?.itemImage;
          }
        } else {
          setUploadProgress(30);
          imageUrl = await uploadToCloudinary(image.uri, formData.itemName);
          setUploadProgress(70);
        }

        if (!imageUrl && !formData.itemCode) {
          Alert.alert(
            "Warning",
            "Image upload failed, but item will be saved without image.",
          );
        }
      } else if (formData.itemCode) {
        const existingItem = items.find(
          (i) => i.itemCode === formData.itemCode,
        );
        if (existingItem?.itemImage) {
          imageUrl = existingItem.itemImage;
        }
      }

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const payload = {
        name: formData.itemName,
        category: formData.category,
        unitType: formData.unitType,
        supplierName: formData.supplierName || "Unknown",
        box: String(Number(formData.box)),
        reorderLevel: String(Number(formData.reorderLevel)),
        expirationDate: formData.expirationDate.toISOString(),
        storageLocation: formData.location,
        userId: storedUserId,
        username: storedUsername,
        role: storedRole,
        price: 0,
      };

      if (!formData.itemCode) {
        payload.quantity = String(Number(formData.quantity));
      }

      if (formData.itemCode) {
        payload.itemCode = formData.itemCode;
      }

      if (imageUrl) {
        payload.itemImage = imageUrl;
      }

      setUploadProgress(80);

      const res = await fetch(`${BACKEND_URL}/api/inventoryPage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(storedUserId ? { "x-user-id": storedUserId } : {}),
          ...(storedUsername ? { "x-username": storedUsername } : {}),
          ...(storedRole ? { "x-role": storedRole } : {}),
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        const queued = Boolean(result.queued);
        setUploadProgress(100);
        setShowConfirmModal(false);
        setShowAddModal(false);
        setRestockSuccessData({
          itemName: formData.itemName,
          batchCode: queued ? null : result.batch?.batchCode,
          expirationDate:
            result.batch?.expirationDate ||
            formData.expirationDate.toISOString(),
          quantity: result.batch?.quantity ?? formData.quantity,
          imageUrl: imageUrl,
          queued,
          imageNotSynced: queued && Boolean(image?.uri && !imageUrl),
        });
        setShowSuccessModal(true);
        resetForm();
        await fetchItems();
        await fetchBatches();
      } else {
        setShowConfirmModal(false);
        setErrorFeedback({
          title: "Unable to save inventory",
          message:
            result.message ||
            "Save failed. Please review the details and try again.",
        });
      }
    } catch (err) {
      console.error("Save error:", err);
      setShowConfirmModal(false);
      setErrorFeedback({
        title: "Connection error",
        message: "Please check your connection and try again.",
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

  const isMedicalKit = (item) => {
    return item.category === "Medical Kits";
  };

  const getFilteredItems = () => {
    const searchLower = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        !isMedicalKit(item) && item.name.toLowerCase().includes(searchLower),
    );
  };

  const renderInventoryCard = (item) => {
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
            {item.category} • {latestLocation}
          </Text>
          <Text style={{ fontSize: 10, color: "#999" }}>{item.itemCode}</Text>
        </View>

        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>{displayQty}</Text>
        </View>

        <TouchableOpacity
          style={styles.retrieveBtn}
          onPress={() => {
            setFormData({
              ...formData,
              itemCode: item.itemCode,
              itemName: item.name,
              category: item.category,
              unitType: item.unitType,
              quantity: String(item.quantityPerBox ?? ""),
              reorderLevel: String(item.reorderLevel),
              supplierName: item.supplierName,
              location: latestLocation,
              box: "",
            });
            if (item.itemImage) {
              setImage({ uri: item.itemImage });
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
      {/* //need icomment */}
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
      {/* //need icomment */}

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
            resetForm();
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
        filteredItems.map(renderInventoryCard)
      ) : (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ color: "#6B7280", textAlign: "center" }}>
            No inventory items found.
          </Text>
        </View>
      )}

      {/* //need icomment */}
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
                  style={{ textAlign: "center", padding: 20, color: "#6B7280" }}
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
      {/* //need icomment */}

      {/* Add/Restock Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {formData.itemCode ? "RESTOCK ITEM" : "ADD NEW SUPPLY"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
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
                    Supply Name
                    {!formData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      formData.itemCode
                        ? { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        : {},
                    ]}
                    value={formData.itemName}
                    editable={!formData.itemCode}
                    onChangeText={(v) =>
                      setFormData({ ...formData, itemName: v })
                    }
                  />
                  {formData.itemCode && (
                    <Text
                      style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}
                    >
                      Item Code: {formData.itemCode} (Restocking)
                    </Text>
                  )}
                  {fieldErrors.itemName ? (
                    <Text style={styles.fieldErrorText}>
                      {fieldErrors.itemName}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Image
                    {!formData.itemCode && (
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
                        formData.itemCode ? undefined : () => showImageOptions()
                      }
                    >
                      <Image
                        source={{ uri: image.uri }}
                        style={{ width: 35, height: 35, borderRadius: 4 }}
                      />
                      {!formData.itemCode && (
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
                        formData.itemCode ? undefined : () => showImageOptions()
                      }
                    >
                      <Upload size={20} color="#9CA3AF" />
                      <Text
                        style={{
                          fontSize: 10,
                          marginLeft: 5,
                          color: "#9CA3AF",
                        }}
                      >
                        {formData.itemCode ? "" : ""}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={styles.label}>
                Category
                {!formData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[
                  styles.pickerContainer,
                  formData.itemCode ? { backgroundColor: "#E5E7EB" } : {},
                ]}
              >
                <Picker
                  enabled={!formData.itemCode}
                  selectedValue={formData.category}
                  onValueChange={(category) => {
                    const availableLocations = getSelectableLocations(category);
                    setFormData((current) => ({
                      ...current,
                      category,
                      location: availableLocations.some(
                        ({ id }) => id === current.location,
                      )
                        ? current.location
                        : (availableLocations[0]?.id ?? ""),
                    }));
                  }}
                >
                  <Picker.Item label="Select a Category" value="" />
                  {CATEGORIES.map((cat) => (
                    <Picker.Item key={cat} label={cat} value={cat} />
                  ))}
                </Picker>
              </View>
              {fieldErrors.category ? (
                <Text style={styles.fieldErrorText}>
                  {fieldErrors.category}
                </Text>
              ) : null}

              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.label}>
                    Unit Type
                    {!formData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <View
                    style={[
                      styles.pickerContainer,
                      formData.itemCode ? { backgroundColor: "#E5E7EB" } : {},
                    ]}
                  >
                    <Picker
                      selectedValue={formData.unitType}
                      onValueChange={(v) =>
                        setFormData({ ...formData, unitType: v })
                      }
                      enabled={!formData.itemCode}
                    >
                      {UNITTYPES.map((unit) => (
                        <Picker.Item key={unit} label={unit} value={unit} />
                      ))}
                    </Picker>
                  </View>
                  {fieldErrors.unitType ? (
                    <Text style={styles.fieldErrorText}>
                      {fieldErrors.unitType}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.label}>
                    No. of {boxFieldLabel}{" "}
                    <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.boxnreorder,
                      { width: "100%", maxWidth: "100%" },
                    ]}
                    keyboardType="numeric"
                    maxLength={4}
                    value={formData.box}
                    onChangeText={handleBoxChange}
                  />
                  {fieldErrors.box ? (
                    <Text style={styles.fieldErrorText}>{fieldErrors.box}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.label}>
                    {quantityFieldLabel}{" "}
                    <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      formData.itemCode
                        ? { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        : {},
                    ]}
                    keyboardType="numeric"
                    maxLength={4}
                    value={formData.quantity}
                    editable={!formData.itemCode}
                    onChangeText={handleQuantityChange}
                  />
                  {formData.itemCode && (
                    <Text
                      style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}
                    >
                      {quantityFieldLabel} (locked)
                    </Text>
                  )}
                  {fieldErrors.quantity || quantityError ? (
                    <Text style={styles.fieldErrorText}>
                      {fieldErrors.quantity || quantityError}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.label}>
                    Reorder Level
                    {!formData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <TextInput
                    style={[
                      styles.boxnreorder,
                      formData.itemCode
                        ? { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        : {},
                    ]}
                    value={formData.reorderLevel}
                    editable={!formData.itemCode}
                    onChangeText={(v) =>
                      setFormData({ ...formData, reorderLevel: v })
                    }
                  />
                  {fieldErrors.reorderLevel ? (
                    <Text style={styles.fieldErrorText}>
                      {fieldErrors.reorderLevel}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View>
                <Text style={styles.label}>
                  Expiration Date <Text style={{ color: "#EF4444" }}>*</Text>
                </Text>
                <TouchableOpacity
                  style={styles.dateSelector}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={20} color="#D4AF37" />
                  <Text style={{ marginLeft: 10 }}>
                    {formData.expirationDate.toDateString()}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={formData.expirationDate || new Date()}
                  mode="date"
                  display="default"
                  onValueChange={(_, date) => {
                    if (date) {
                      setFormData((current) => ({
                        ...current,
                        expirationDate: date,
                      }));
                      if (Platform.OS === "android") {
                        setShowDatePicker(false);
                      }
                    }
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}

              <Text style={styles.label}>
                Storage Location
                {!formData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[
                  styles.pickerContainer,
                  formData.itemCode ? { backgroundColor: "#E5E7EB" } : {},
                ]}
              >
                <Picker
                  selectedValue={formData.location}
                  onValueChange={(v) =>
                    setFormData({ ...formData, location: v })
                  }
                  enabled={!formData.itemCode}
                >
                  {renderRackItems()}
                </Picker>
              </View>
              {fieldErrors.location ? (
                <Text style={styles.fieldErrorText}>
                  {fieldErrors.location}
                </Text>
              ) : null}

              <Text style={styles.label}>
                Supplier
                {!formData.itemCode && (
                  <Text style={{ color: "#EF4444" }}> *</Text>
                )}
              </Text>
              <View
                style={[
                  styles.pickerContainer,
                  formData.itemCode ? { backgroundColor: "#E5E7EB" } : {},
                ]}
              >
                <Picker
                  selectedValue={formData.supplierName}
                  onValueChange={(v) =>
                    setFormData({ ...formData, supplierName: v })
                  }
                  enabled={!formData.itemCode}
                >
                  <Picker.Item label="Select Supplier" value="" color="#999" />
                  {suppliers.map((sup) => (
                    <Picker.Item
                      key={sup._id}
                      label={sup.name}
                      value={sup.name}
                    />
                  ))}
                </Picker>
              </View>
              {fieldErrors.supplierName ? (
                <Text style={styles.fieldErrorText}>
                  {fieldErrors.supplierName}
                </Text>
              ) : null}

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
                      : "Saving item..."}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, uploading && { opacity: 0.7 }]}
                onPress={handleSaveItem}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {formData.itemCode ? "CONFIRM RESTOCK" : "SAVE PRODUCT"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
                      ? "Change product photo"
                      : "Add product photo"
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

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploading) {
            setShowConfirmModal(false);
            setShowAddModal(true);
          }
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmModal}>
            {/* Header */}
            <View style={styles.confirmHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmTitle}>
                  {formData.itemCode ? "Confirm Restock" : "Confirm Add Supply"}
                </Text>

                <Text style={styles.confirmSubtitle}>
                  Please review the details before continuing.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (uploading) return;
                  setShowConfirmModal(false);
                  setShowAddModal(true);
                }}
                style={styles.confirmClose}
                disabled={uploading}
              >
                <XCircle size={28} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {/* Supply Name */}
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
                <Text style={styles.supplyName}>{formData.itemName}</Text>

                {formData.itemCode && (
                  <Text style={styles.itemCode}>{formData.itemCode}</Text>
                )}

                <Text style={styles.categoryText}>{formData.category}</Text>
              </View>
            </View>

            {/* Details */}
            <ScrollView
              style={styles.confirmDetails}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity per Box</Text>
                <Text style={styles.detailValue}>
                  {formData.quantity} {formData.unitType}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Number of Boxes</Text>
                <Text style={styles.detailValue}>{formData.box}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reorder Level</Text>
                <Text style={styles.detailValue}>{formData.reorderLevel}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expiration</Text>
                <Text style={styles.detailValue}>
                  {formData.expirationDate
                    ? formData.expirationDate.toDateString()
                    : "No date"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>
                  {formData.location || "Not specified"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Supplier</Text>
                <Text style={styles.detailValue}>
                  {formData.supplierName || "Not specified"}
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
            </ScrollView>

            {/* Upload Progress */}
            {uploading && (
              <View style={{ marginVertical: 10, paddingHorizontal: 20 }}>
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
                    : "Saving item..."}
                </Text>
              </View>
            )}

            {/* Notice */}
            <View style={styles.confirmNotice}>
              <Info size={16} color="#D4AF37" />

              <Text style={styles.confirmNoticeText}>
                {formData.itemCode
                  ? "This will add the specified quantity to the existing stock."
                  : "This supply will be added to your inventory."}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.cancelButton, uploading && { opacity: 0.5 }]}
                onPress={() => {
                  if (uploading) return;
                  setShowConfirmModal(false);
                  setShowAddModal(true);
                }}
                disabled={uploading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, uploading && { opacity: 0.7 }]}
                onPress={performSave}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={18} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>
                      {formData.itemCode ? "Yes, Restock" : "Yes, Add"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContainer}>
            <CheckCircle size={60} color="#10B981" />
            <Text style={styles.successTitle}>
              {restockSuccessData?.queued
                ? "Saved Offline"
                : "Save Successful!"}
            </Text>
            {restockSuccessData?.queued && (
              <Text style={styles.detailValue}>
                This inventory change will sync when you reconnect. The server
                will assign the batch code after syncing.
                {restockSuccessData?.imageNotSynced
                  ? " The selected image was not uploaded and must be added after reconnecting."
                  : ""}
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
                Item Name:{" "}
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
                  {restockSuccessData?.quantity} pcs
                </Text>
              </Text>
            </View>

            {/* //need icomment */}
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
            {/* //need icomment */}

            <TouchableOpacity
              onPress={() => setShowSuccessModal(false)}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* //need icomment */}
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
                <Text style={styles.errorButtonText}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {/* //need icomment */}
    </>
  );
}
