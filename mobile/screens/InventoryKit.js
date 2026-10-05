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
  Package,
  Upload,
  RotateCcw,
  CheckCircle,
  Printer,
  AlertTriangle,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const MAX_QUANTITY = 1000;
const COUNTED_BATCH_STATUSES = ["stored", "for disposal"];

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
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sortOrder, setSortOrder] = useState("QTY Low → High");
  const [expirySort, setExpirySort] = useState("Sort Expiry");
  const [fefoFilter, setFefoFilter] = useState("All FEFO");
  const [stockFilter, setStockFilter] = useState("All Stock");

  // Success modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [restockSuccessData, setRestockSuccessData] = useState(null);
  const [printQty, setPrintQty] = useState("1");
  const [errorFeedback, setErrorFeedback] = useState(null);

  const [kitItems, setKitItems] = useState([]);

  const [showConfirmKitModal, setShowConfirmKitModal] = useState(false);

  // inline error
  const [kitItemErrors, setKitItemErrors] = useState({});
  const [quantityError, setQuantityError] = useState("");
  const [kitFormErrors, setKitFormErrors] = useState({});
  const [confirmError, setConfirmError] = useState("");

  const [kitFormData, setKitFormData] = useState({
    itemCode: "",
    name: "",
    category: "Medical Kits",
    unitType: "Set",
    quantity: "1",
    expirationDate: new Date(),
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

  const renderRackItems = () => {
    const occupiedLocations = new Set(
      batches
        .filter(
          (batch) => batch.status !== "disposed" && Number(batch.quantity) > 0,
        )
        .map((batch) => batch.storageLocation),
    );

    return [...warehouseMapLayout.racks]
      .sort((firstRack, secondRack) => {
        const [, firstNumber, firstSlot] = firstRack.id.match(/^R(\d+)-(.+)$/);
        const [, secondNumber, secondSlot] =
          secondRack.id.match(/^R(\d+)-(.+)$/);
        return (
          Number(firstNumber) - Number(secondNumber) ||
          firstSlot.localeCompare(secondSlot)
        );
      })
      .map(({ id: location }) => {
        if (!kitFormData.itemCode && occupiedLocations.has(location)) {
          return null;
        }
        return <Picker.Item key={location} label={location} value={location} />;
      })
      .filter(Boolean);
  };

  const uploadToCloudinary = async (imageUri, itemName) => {
    try {
      const sanitizedName = itemName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const timestamp = Date.now();
      const filename = `${sanitizedName}-${timestamp}.jpg`;

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

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
        },
      );

      const result = await response.json();
      return result.secure_url || null;
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      return null;
    }
  };

  const pickImage = async () => {
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setImage({ uri: result.assets[0].uri });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const takePhoto = async () => {
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
      if (!result.canceled) {
        setImage({ uri: result.assets[0].uri });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const showImageOptions = () => {
    Alert.alert("Select Image", "Choose an option", [
      { text: "Cancel", style: "cancel" },
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Gallery", onPress: pickImage },
    ]);
  };

  const resetKitForm = () => {
    setKitFormData({
      itemCode: "",
      name: "",
      category: "Medical Kits",
      quantity: "1",
      expirationDate: new Date(),
      location: "R1-A",
      supplierName: "Premiumed Enterprises",
      unitType: "Set",
      reorderLevel: "50",
      kitItems: [],
    });

    setKitItems([]);
    setKitItemErrors({});
    setQuantityError("");
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

  const completeKitBatch = async (batchId) => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const batchResponse = await fetch(
        `${BACKEND_URL}/api/inventoryPage/batches/all`,
      );
      const batches = await batchResponse.json();
      const batch = batches.find((b) => b._id === batchId);

      if (!batch) {
        setErrorFeedback({
          title: "Batch not found",
          message: "This kit batch could not be found. Refresh the inventory and try again.",
        });
        return false;
      }

      const response = await fetch(
        `${BACKEND_URL}/api/inventoryPage/batch/stored`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(storedUserId ? { "x-user-id": storedUserId } : {}),
            ...(storedUsername ? { "x-username": storedUsername } : {}),
            ...(storedRole ? { "x-role": storedRole } : {}),
          },
          body: JSON.stringify({
            batchCode: batch.batchCode,
            itemCode: batch.itemCode,
            userId: storedUserId,
            username: storedUsername,
            role: storedRole,
          }),
        },
      );

      const result = await response.json();

      if (response.ok) {
        setRestockSuccessData({
          itemName: batch.itemName,
          batchCode: batch.batchCode,
          quantity: batch.quantity,
          imageUrl: null,
        });
        setShowSuccessModal(true);
        await fetchItems();
        await fetchBatches();
        return true;
      } else {
        setErrorFeedback({
          title: "Unable to store kit",
          message: result.message || "Failed to complete kit batch.",
        });
        return false;
      }
    } catch (error) {
      console.error("Complete kit error:", error);
      setErrorFeedback({
        title: "Kit storage failed",
        message: "The kit could not be stored. Please check your connection and try again.",
      });
      return false;
    }
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

    if (!Number.isFinite(Number(kitFormData.quantity)) || Number(kitFormData.quantity) <= 0) {
      setConfirmError("Kit quantity must be greater than zero.");
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

    if (Object.keys(formErrors).length > 0) {
      setKitFormErrors(formErrors);
      return;
    }

    setKitFormErrors({});

    const errors = {};

    kitItems.forEach((item) => {
      const qty = item.quantity;

      if (qty === "" || qty === null || qty === undefined) {
        errors[item._id] = "Quantity is required.";
      } else if (Number(qty) <= 0) {
        errors[item._id] = "Quantity must be greater than 0.";
      } else if (Number(qty) > MAX_QUANTITY) {
        errors[item._id] = `Quantity cannot exceed ${MAX_QUANTITY}.`;
      }
    });

    setKitItemErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const kitQuantity = Number(kitFormData.quantity);
    if (!Number.isFinite(kitQuantity) || kitQuantity <= 0) {
      setKitFormErrors({ quantity: "Quantity must be greater than zero." });
      return;
    }

    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === kitFormData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    if (kitQuantity > availableQuantity) {
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

  const handleQuantityChange = (value) => {
    setKitFormData({ ...kitFormData, quantity: value });
    setKitFormErrors((prev) => ({ ...prev, quantity: "" }));

    const quantity = Number(value);
    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === kitFormData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    setQuantityError(
      value && Number.isFinite(quantity) && quantity > availableQuantity
        ? `Only ${availableQuantity} quantity is available to be stored.`
        : "",
    );
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

      const kitQuantity = Number(kitFormData.quantity);

      // For restocks: DO NOT send kitItems
      // For new kits: Send kitItems
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
        quantity: kitQuantity,
        expirationDate: kitFormData.expirationDate.toISOString(),
        storageLocation: kitFormData.location,
        ...(kitItemsPayload.length > 0 && { kitItems: kitItemsPayload }),
        userId: storedUserId,
        username: storedUsername,
        role: storedRole,
        price: 0,
      };

      // If restock, remove kitItems from payload
      if (isRestock) {
        delete kitProductPayload.kitItems;
      }

      console.log(
        "Sending payload:",
        JSON.stringify(kitProductPayload, null, 2),
      );

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
        // Handle specific validation errors
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
        batchCode: productResult.batch?.batchCode || "KIT-001",
        quantity: kitFormData.quantity,
        imageUrl: imageUrl,
        isRestock: isRestock,
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

  const isMedicalKit = (item) => {
    return item.category === "Medical Kits";
  };

  const getFilteredItems = () => {
    const searchLower = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        isMedicalKit(item) &&
        item.name.toLowerCase().includes(searchLower) &&
        batches.some(
          (batch) =>
            batch.itemCode === item.itemCode &&
            COUNTED_BATCH_STATUSES.includes(batch.status) &&
            Number(batch.quantity) > 0,
        ),
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

        return {
          ...item,
          availableQty,
          validBatches: validBatches,
        };
      })
      .filter((item) => item.availableQty > 0);
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
              quantity: String(item.quantity || 1),
              expirationDate: new Date(item.expirationDate || Date.now()),
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

      {/* Add Kit Modal */}
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
                    <Text style={styles.fieldErrorText}>{kitFormErrors.name}</Text>
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
                        kitFormData.itemCode ? undefined : showImageOptions
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
                        kitFormData.itemCode ? undefined : showImageOptions
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
                        {kitFormData.itemCode ? "Existing" : "Add"}
                      </Text>
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

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Unit Type
                    {!kitFormData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  <View
                    style={[
                      styles.pickerContainer,
                      { backgroundColor: "#E5E7EB" },
                    ]}
                  >
                    <Picker selectedValue="Set" enabled={false}>
                      <Picker.Item label="Set" value="Set" />
                    </Picker>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Quantity <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    maxLength={4}
                    value={kitFormData.quantity}
                    onChangeText={handleQuantityChange}
                  />
                  {kitFormErrors.quantity || quantityError ? (
                    <Text
                      style={styles.fieldErrorText}
                    >
                      {kitFormErrors.quantity || quantityError}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Expiration Date <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.dateSelector}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Calendar size={20} color="#D4AF37" />
                    <Text style={{ marginLeft: 10 }}>
                      {kitFormData.expirationDate
                        ? kitFormData.expirationDate.toDateString()
                        : "Select Date"}
                    </Text>
                  </TouchableOpacity>
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

              {showDatePicker && (
                <DateTimePicker
                  value={kitFormData.expirationDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, d) => {
                    setShowDatePicker(false);
                    if (d) {
                      setKitFormData({ ...kitFormData, expirationDate: d });
                    }
                  }}
                />
              )}

              <View style={{ marginTop: 15 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={[styles.label, { fontSize: 16, fontWeight: "bold" }]}
                  >
                    KIT SUPPLIES
                    {!kitFormData.itemCode && (
                      <Text style={{ color: "#EF4444" }}> *</Text>
                    )}
                  </Text>
                  {isRestockMode && (
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    ></View>
                  )}
                </View>
                {kitFormErrors.items ? (
                  <Text style={styles.fieldErrorText}>{kitFormErrors.items}</Text>
                ) : null}

                {isRestockMode ? (
                  //(Restock)
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
                              {item.quantity} per kit
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
                  // (New Kit)
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
                                  backgroundColor: isAdded
                                    ? "#F0FDF4"
                                    : "#FFFFFF",
                                  borderRadius: 8,
                                }}
                              >
                                <TouchableOpacity
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
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
                                  }}
                                >
                                  {isAdded && (
                                    <View
                                      style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: "#FFF",
                                      }}
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
                                      Qty/Kit:
                                      <Text style={{ color: "#EF4444" }}>
                                        *
                                      </Text>
                                    </Text>

                                    <TextInput
                                      style={{
                                        width: 50,
                                        height: 35,
                                        borderWidth: 1,
                                        borderColor: kitItemErrors[item._id]
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
                          No items with category "Kit Inclusions" found.
                          {"\n"}Please add items with "Kit Inclusions" category
                          first.
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
                              {item.quantity} per kit
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

      {/* confirmation modal */}
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
            {/* Header */}
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

            {/* Kit Preview */}
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

            {/* Kit Details */}
            <ScrollView
              style={styles.confirmDetails}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity</Text>
                <Text style={styles.detailValue}>
                  {kitFormData.quantity} sets
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
                  {kitFormData.expirationDate
                    ? kitFormData.expirationDate.toDateString()
                    : "No date"}
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

              {/* Kit Items */}
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
                      {item.quantity} / kit
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Notice */}
            <View style={styles.confirmNotice}>
              <CheckCircle size={16} color="#D4AF37" />

              <Text style={styles.confirmNoticeText}>
                {kitFormData.itemCode
                  ? "This will restock the existing medical kit."
                  : "This kit will be added to your inventory with the selected inclusions."}
              </Text>
            </View>

            {/* Buttons */}
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
                onPress={() => {
                  if (!validateKitBeforeSave()) {
                    return;
                  }
                  setShowConfirmKitModal(false);
                  performSaveKit();
                }}
              >
                <CheckCircle size={18} color="#FFFFFF" />

                <Text style={styles.confirmButtonText}>
                  {kitFormData.itemCode ? "Yes, Restock" : "Yes, Add"}
                </Text>
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
                {selectedItem?.itemImage && (
                  <Image
                    source={{ uri: selectedItem.itemImage }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 6,
                      marginRight: 10,
                    }}
                  />
                )}
                <View>
                  <Text style={styles.modalSubTitle}>
                    ITEM CODE: {selectedItem?.itemCode}
                  </Text>
                  <Text style={styles.modalTitle}>{selectedItem?.name}</Text>
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
                <Text style={styles.errorButtonText}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContainer}>
            <CheckCircle size={60} color="#10B981" />

            <Text style={styles.successTitle}>Save Successful!</Text>

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
                  {restockSuccessData?.batchCode}
                </Text>
              </Text>
              <Text style={styles.detailLabel}>
                Quantity:{" "}
                <Text style={styles.detailValue}>
                  {restockSuccessData?.quantity} sets
                </Text>
              </Text>
            </View>

            <View style={styles.printSection}>
              <Text style={styles.printLabel}>Labels to print:</Text>
              <TextInput
                style={styles.printInput}
                keyboardType="numeric"
                value={printQty}
                onChangeText={setPrintQty}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, styles.printButton]}
              onPress={() => {
                Alert.alert(
                  "Print",
                  `Printing ${printQty} label(s) for ${restockSuccessData?.batchCode}`,
                );
              }}
            >
              <Printer size={20} color="#FFF" style={styles.printIcon} />
              <Text style={styles.saveBtnText}>PRINT LABELS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowSuccessModal(false);
                setPrintQty("1");
              }}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
