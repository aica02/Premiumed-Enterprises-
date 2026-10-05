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
  Printer,
  CheckCircle,
  Package,
  Upload,
  RotateCcw,
  Layers,
  Info,
  AlertTriangle,
  Check,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CATEGORIES } from "../components/Categories";
import { UNITTYPES } from "../components/UnitType";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;
const MAX_QUANTITY = 1000;
const COUNTED_BATCH_STATUSES = ["stored", "for disposal"];

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
  const [printQty, setPrintQty] = useState("1");

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
    expirationDate: new Date(),
    location: "R1-A",
    supplierName: "Supplier A",
    reorderLevel: "50",
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
        if (!formData.itemCode && occupiedLocations.has(location)) {
          return null;
        }
        return <Picker.Item key={location} label={location} value={location} />;
      })
      .filter(Boolean);
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
  try {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      console.error("Missing Cloudinary env vars", {
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
      });
      Alert.alert("Config Error", "Cloudinary environment variables are missing.");
      return null;
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
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
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

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const text = await response.text();

    if (!response.ok) {
      Alert.alert(
        "Upload Failed",
        `Cloudinary returned ${response.status}.\n${text.slice(0, 200)}`
      );
      return null;
    }

    const result = JSON.parse(text);
    return result.secure_url || null;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    Alert.alert("Upload Error", String(error?.message || error));
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

  const resetForm = () => {
    setFormData({
      itemCode: "",
      itemName: "",
      category: "Cardiovascular & Emergency Medications",
      unitType: "Piece",
      quantity: "",
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
    if (!formData.itemCode && !formData.itemName.trim()) {
      errors.itemName = "Supply name is required.";
    }
    if (!formData.category) errors.category = "Category is required.";
    if (!formData.unitType) errors.unitType = "Unit type is required.";
    if (!formData.quantity) {
      errors.quantity = "Quantity is required.";
    }
    if (!formData.reorderLevel) {
      errors.reorderLevel = "Reorder level is required.";
    }
    if (!formData.location) errors.location = "Storage location is required.";
    if (!formData.supplierName) errors.supplierName = "Supplier is required.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const quantity = Number(formData.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFieldErrors({ quantity: "Quantity must be greater than 0." });
      return;
    }

    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === formData.itemCode &&
          COUNTED_BATCH_STATUSES.includes(batch.status),
      )
      .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
    const availableQuantity = Math.max(MAX_QUANTITY - existingQuantity, 0);

    if (quantity > availableQuantity) {
      setQuantityError(
        `Only ${availableQuantity} quantity is available to be stored.`,
      );
      return;
    }

    setQuantityError("");

    if (Number(formData.reorderLevel) < 0) {
      setFieldErrors({ reorderLevel: "Reorder level cannot be negative." });
      return;
    }

    setFieldErrors({});
    // Close the input modal and show the confirmation modal
    setShowAddModal(false);
    setShowConfirmModal(true);
  };

  const handleQuantityChange = (value) => {
    setFormData({ ...formData, quantity: value });

    const quantity = Number(value);
    setFieldErrors((prev) => ({ ...prev, quantity: "" }));
    const existingQuantity = batches
      .filter(
        (batch) =>
          batch.itemCode === formData.itemCode &&
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
        quantity: String(Number(formData.quantity)),
        reorderLevel: String(Number(formData.reorderLevel)),
        expirationDate: formData.expirationDate.toISOString(),
        storageLocation: formData.location,
        userId: storedUserId,
        username: storedUsername,
        role: storedRole,
        price: 0,
      };

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
        setUploadProgress(100);
        setShowAddModal(false);
        setRestockSuccessData({
          itemName: formData.itemName,
          batchCode: result.batch?.batchCode || "GEN-001",
          quantity: formData.quantity,
          imageUrl: imageUrl,
        });
        setShowSuccessModal(true);
        resetForm();
        await fetchItems();
        await fetchBatches();
      } else {
        setErrorFeedback({
          title: "Unable to save inventory",
          message: result.message || "Save failed. Please review the details and try again.",
        });
      }
    } catch (err) {
      console.error("Save error:", err);
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
        !isMedicalKit(item) &&
        item.name.toLowerCase().includes(searchLower) &&
        batches.some(
          (batch) =>
            batch.itemCode === item.itemCode &&
            COUNTED_BATCH_STATUSES.includes(batch.status) &&
            Number(batch.quantity) > 0,
        ),
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
              reorderLevel: String(item.reorderLevel),
              supplierName: item.supplierName,
              location: latestLocation,
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
                    <Text style={styles.fieldErrorText}>{fieldErrors.itemName}</Text>
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
                      onPress={formData.itemCode ? undefined : showImageOptions}
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
                      onPress={formData.itemCode ? undefined : showImageOptions}
                    >
                      <Upload size={20} color="#9CA3AF" />
                      <Text
                        style={{
                          fontSize: 10,
                          marginLeft: 5,
                          color: "#9CA3AF",
                        }}
                      >
                        {formData.itemCode ? "Existing" : "Add"}
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
                  onValueChange={(v) =>
                    setFormData({ ...formData, category: v })
                  }
                >
                  <Picker.Item label="Select a Category" value="" />
                  {CATEGORIES.map((cat) => (
                    <Picker.Item key={cat} label={cat} value={cat} />
                  ))}
                </Picker>
              </View>
              {fieldErrors.category ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.category}</Text>
              ) : null}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
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
                    <Text style={styles.fieldErrorText}>{fieldErrors.unitType}</Text>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Quantity <Text style={{ color: "#EF4444" }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    maxLength={4}
                    value={formData.quantity}
                    onChangeText={handleQuantityChange}
                  />
                  {fieldErrors.quantity || quantityError ? (
                    <Text
                      style={styles.fieldErrorText}
                    >
                      {fieldErrors.quantity || quantityError}
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
                      {formData.expirationDate.toDateString()}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Reorder Level
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
                    value={formData.reorderLevel}
                    editable={!formData.itemCode}
                    onChangeText={(v) =>
                      setFormData({ ...formData, reorderLevel: v })
                    }
                  />
                  {fieldErrors.reorderLevel ? (
                    <Text style={styles.fieldErrorText}>{fieldErrors.reorderLevel}</Text>
                  ) : null}
                </View>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={formData.expirationDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, d) => {
                    setShowDatePicker(false);
                    if (d) {
                      setFormData({ ...formData, expirationDate: d });
                    }
                  }}
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
                <Text style={styles.fieldErrorText}>{fieldErrors.location}</Text>
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
                <Text style={styles.fieldErrorText}>{fieldErrors.supplierName}</Text>
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

      {/* confirmation modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
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
                  setShowConfirmModal(false);
                  setShowAddModal(true);
                }}
                style={styles.confirmClose}
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
                <Text style={styles.detailLabel}>Quantity</Text>
                <Text style={styles.detailValue}>
                  {formData.quantity} {formData.unitType}
                </Text>
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
                style={styles.cancelButton}
                onPress={() => {
                  setShowConfirmModal(false);
                  setShowAddModal(true);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => {
                  setShowConfirmModal(false);
                  performSave();
                }}
              >
                <Check size={18} color="#FFFFFF" />

                <Text style={styles.confirmButtonText}>
                  {formData.itemCode ? "Yes, Restock" : "Yes, Add"}
                </Text>
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
                Item Name:{" "}
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
                  {restockSuccessData?.quantity} pcs
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
              onPress={() => setShowSuccessModal(false)}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
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
              <Text style={styles.errorEyebrow}>SAVE NOT COMPLETED</Text>
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
    </>
  );
}
