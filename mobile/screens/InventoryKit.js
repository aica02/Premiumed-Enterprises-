import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
import {
  Search,
  PlusCircle,
  XCircle,
  Package,
  Upload,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Check,
  Wifi, //comment this
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

//comment this
import {
  autoConnectPrinter,
  connectToPrinter,
  printBarcodeTSPL,
  scanForPrinters,
  stopPrinterScan,
  subscribePrinterStatus,
} from "../utils/PrinterService";
//comment this

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const MAX_QUANTITY = 10000;
const KIT_QUANTITY_PER_BOX = 100;
const MAX_INCLUSION_NAME_LENGTH = 60;
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

  //comment this
  const [printQty, setPrintQty] = useState("1");
  const [printerDevice, setPrinterDevice] = useState(null);
  const [printerStatus, setPrinterStatus] = useState("Printer Disconnected");
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState(null);
  //comment this

  const [kitItems, setKitItems] = useState([]);
  const [showConfirmKitModal, setShowConfirmKitModal] = useState(false);
  const [kitItemErrors, setKitItemErrors] = useState({});
  const [kitFormErrors, setKitFormErrors] = useState({});
  const [confirmError, setConfirmError] = useState("");
  const inclusionKeyCounter = useRef(0);

  //comment this
  useEffect(() => {
    // Keep the printer bar truthful: the service reports when the Bluetooth
    // link drops, comes back, or is being re-established.
    const unsubscribe = subscribePrinterStatus(({ state, device }) => {
      if (state === "connected") {
        setPrinterDevice(device);
        setPrinterStatus(`Connected to ${device?.name || "Xprinter"}`);
      } else if (state === "reconnecting") {
        setPrinterDevice(null);
        setPrinterStatus("Reconnecting to printer...");
      } else {
        setPrinterDevice(null);
        setPrinterStatus("Printer Disconnected");
      }
    });

    autoConnectPrinter(setPrinterStatus)
      .then((device) => {
        if (device) setPrinterDevice(device);
      })
      .catch((error) => {
        console.error("Printer auto-connect failed:", error);
        setPrinterStatus("Printer Disconnected");
      });

    return unsubscribe;
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
    // If the screen shows no printer (for example it dropped while you were
    // away), try the saved printer once before asking to connect by hand.
    let activePrinter = printerDevice;
    if (!activePrinter) {
      setIsPrinting(true);
      activePrinter = await autoConnectPrinter(setPrinterStatus);
      setIsPrinting(false);
      if (activePrinter) {
        setPrinterDevice(activePrinter);
      } else {
        setPrinterStatus("Printer Disconnected");
      }
    }
    if (!activePrinter) {
      Alert.alert("No Printer", "Please connect your Xprinter first.", [
        { text: "Connect Printer", onPress: handleScanPrinters },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    try {
      setIsPrinting(true);
      await printBarcodeTSPL(
        activePrinter,
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
  //comment this

  const [kitFormData, setKitFormData] = useState({
    itemCode: "",
    name: "",
    category: "Medical Kits",
    unitType: "Set",
    box: "",
    quantity: String(KIT_QUANTITY_PER_BOX),
    expirationDate: getDefaultKitExpiration(),
    location: "R1-A",
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
      (location) => !occupiedLocations.has(location.id),
    );

    return locations.map(({ id }) => (
      <Picker.Item key={id} label={id} value={id} />
    ));
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

  const resetKitForm = () => {
    setKitFormData({
      itemCode: "",
      name: "",
      category: "Medical Kits",
      box: "",
      quantity: String(KIT_QUANTITY_PER_BOX),
      expirationDate: getDefaultKitExpiration(),
      location: "R1-A",
      supplierName: "Premiumed Enterprises",
      unitType: "Set",
      reorderLevel: "50",
      kitItems: [],
    });

    setKitItems([]);
    setKitItemErrors({});
    setKitFormErrors({});
    setImage(null);
  };

  const removeKitItemFromKit = (index) => {
    setKitItems((prev) => prev.filter((_, i) => i !== index));
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

  const normalizeInclusionName = (name) =>
    String(name || "")
      .trim()
      .replace(/\s+/g, " ");

  const addKitInclusion = () => {
    inclusionKeyCounter.current += 1;
    const key = `new-inclusion-${inclusionKeyCounter.current}`;
    setKitItems((prev) => [...prev, { _id: key, name: "", quantity: "" }]);
    setKitFormErrors((prev) => ({ ...prev, items: "" }));
  };

  const updateKitInclusionName = (index, value) => {
    const key = kitItems[index]?._id;
    setKitItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: value } : item)),
    );
    if (key) setKitItemErrors((prev) => ({ ...prev, [key]: "" }));
  };

  // Inclusions are typed text, not stock items: only the name and the
  // quantity per kit-box are checked.
  const validateKitInclusions = () => {
    const errors = {};
    const seen = new Set();

    kitItems.forEach((item) => {
      const key = item._id;
      const name = normalizeInclusionName(item.name);

      if (!name) {
        errors[key] = "Inclusion name is required.";
        return;
      }
      if (name.length > MAX_INCLUSION_NAME_LENGTH) {
        errors[key] =
          `Name cannot exceed ${MAX_INCLUSION_NAME_LENGTH} characters.`;
        return;
      }
      const lowered = name.toLowerCase();
      if (seen.has(lowered)) {
        errors[key] = "This inclusion is already listed.";
        return;
      }
      seen.add(lowered);

      if (
        item.quantity === "" ||
        item.quantity === null ||
        item.quantity === undefined
      ) {
        errors[key] = "Quantity is required.";
        return;
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors[key] = "Quantity must be a whole number greater than 0.";
        return;
      }
      if (qty > MAX_QUANTITY) {
        errors[key] = `Quantity cannot exceed ${MAX_QUANTITY}.`;
      }
    });

    return errors;
  };

  const validateKitBeforeSave = () => {
    if (!kitFormData.name?.trim()) {
      setConfirmError("Kit name is required.");
      return false;
    }

    if (!kitFormData.itemCode && kitItems.length === 0) {
      setConfirmError("Add at least one kit inclusion before confirming.");
      return false;
    }

    if (!kitFormData.box || Number(kitFormData.box) <= 0) {
      setConfirmError("Box must be greater than zero.");
      return false;
    }

    if (!kitFormData.expirationDate || !kitFormData.location) {
      setConfirmError("Expiration date and storage location are required.");
      return false;
    }

    // A restock reuses the saved inclusions, which cannot be edited.
    if (!kitFormData.itemCode) {
      const errors = validateKitInclusions();
      if (Object.keys(errors).length > 0) {
        setKitItemErrors(errors);
        setConfirmError("Complete the highlighted kit inclusions.");
        return false;
      }
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

    const inclusionErrors = kitFormData.itemCode ? {} : validateKitInclusions();
    setKitItemErrors(inclusionErrors);

    if (
      Object.keys(formErrors).length > 0 ||
      Object.keys(inclusionErrors).length > 0
    ) {
      setKitFormErrors(formErrors);
      return;
    }

    setKitFormErrors({});
    setConfirmError("");

    setShowAddModal(false);
    setShowConfirmKitModal(true);
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
        // Inclusions are typed text: only the name and quantity per kit-box.
        kitItemsPayload = kitItems.map((item) => ({
          name: normalizeInclusionName(item.name),
          quantity: Number(item.quantity),
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
        throw new Error(
          productResult.message || "Failed to create kit product",
        );
      }

      setUploadProgress(100);

      setShowConfirmKitModal(false);
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
      // Bring the form back so nothing has to be retyped.
      setShowConfirmKitModal(false);
      setShowAddModal(true);
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
      {/* comment this */}
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
      {/* comment this */}

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

      {/* comment this */}
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
      {/* comment this */}

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

            <ScrollView
              style={{ padding: 20 }}
              keyboardShouldPersistTaps="handled"
            >
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
                  KIT INCLUSIONS
                  {!kitFormData.itemCode && (
                    <Text style={{ color: "#EF4444" }}> *</Text>
                  )}
                </Text>

                {kitFormErrors.items ? (
                  <Text style={styles.fieldErrorText}>
                    {kitFormErrors.items}
                  </Text>
                ) : null}

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
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6B7280",
                        marginBottom: 8,
                        lineHeight: 17,
                      }}
                    >
                      Type what is included in this kit. Inclusions are not
                      sold separately, so no barcode scanning is needed.
                      Quantity is per kit-box.
                    </Text>

                    {kitItems.map((item, index) => {
                      const error = kitItemErrors[item._id];
                      return (
                        <View key={item._id} style={{ marginBottom: 8 }}>
                          <View
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
                            <TextInput
                              style={{
                                flex: 1,
                                height: 42,
                                borderWidth: 1,
                                borderColor: error ? "#EF4444" : "#D1D5DB",
                                borderRadius: 8,
                                paddingHorizontal: 10,
                                fontSize: 14,
                                backgroundColor: "#FFF",
                                marginRight: 8,
                              }}
                              placeholder="Inclusion name (e.g. Gauze Pads)"
                              placeholderTextColor="#9CA3AF"
                              maxLength={MAX_INCLUSION_NAME_LENGTH}
                              value={item.name}
                              onChangeText={(value) =>
                                updateKitInclusionName(index, value)
                              }
                            />
                            <TextInput
                              style={{
                                width: 64,
                                height: 42,
                                borderWidth: 1,
                                borderColor: error ? "#EF4444" : "#D1D5DB",
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                fontSize: 14,
                                textAlign: "center",
                                backgroundColor: "#FFF",
                                marginRight: 8,
                              }}
                              placeholder="Qty"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="numeric"
                              maxLength={5}
                              value={
                                item.quantity === ""
                                  ? ""
                                  : String(item.quantity ?? "")
                              }
                              onChangeText={(value) =>
                                updateKitItemQuantity(
                                  index,
                                  value.replace(/[^0-9]/g, ""),
                                )
                              }
                            />
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Remove inclusion ${index + 1}`}
                              onPress={() => {
                                removeKitItemFromKit(index);
                                setKitItemErrors((prev) => {
                                  const updated = { ...prev };
                                  delete updated[item._id];
                                  return updated;
                                });
                              }}
                            >
                              <XCircle size={24} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                          {error ? (
                            <Text style={styles.fieldErrorText}>{error}</Text>
                          ) : null}
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Add inclusion"
                      onPress={addKitInclusion}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 11,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: "#D4AF37",
                        borderRadius: 8,
                        backgroundColor: "#FFFBEB",
                      }}
                    >
                      <PlusCircle size={18} color="#D4AF37" />
                      <Text
                        style={{
                          marginLeft: 6,
                          color: "#8A6D14",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        ADD INCLUSION
                      </Text>
                    </TouchableOpacity>
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
                The kit batch will be saved as pending until it is stored
                in Putaway.
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
                style={[styles.confirmButton, uploading && { opacity: 0.7 }]}
                disabled={uploading}
                onPress={async () => {
                  if (!validateKitBeforeSave()) return;
                  await performSaveKit();
                }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle size={18} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>
                      {kitFormData.itemCode ? "Yes, Restock" : "Yes, Add"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
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

            {/* comment this */}
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
            {/* comment this */}

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

      {/* comment this */}
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
      {/* comment this */}
    </>
  );
}
