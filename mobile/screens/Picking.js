import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { pickingStyles } from "../styles/PickingStyles";
import { warehouseMapStyles } from "../styles/warehouseMapStyles";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Menu,
  ScanLine,
  Truck,
  XCircle,
} from "lucide-react-native";
import Sidebar from "./Sidebar";
import Header from "./Header";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";
import { offlineFetch as fetch } from "../shared/offlineApi";
import useWarehouseMapAdditions from "../shared/useWarehouseMapAdditions";

export default function DeliveryList({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [scannerModalVisible, setScannerModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [completingOrder, setCompletingOrder] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [batchBlockedNotice, setBatchBlockedNotice] = useState(null);
  const [invalidBarcodeNotice, setInvalidBarcodeNotice] = useState(null);
  const [wrongItemNotice, setWrongItemNotice] = useState(null);
  const [alreadyFilledNotice, setAlreadyFilledNotice] = useState(null);
  const [noStockNotice, setNoStockNotice] = useState(null);
  const [batchDepletedNotice, setBatchDepletedNotice] = useState(null);
  const [completionSuccess, setCompletionSuccess] = useState(null);
  const isProcessing = useRef(false);
  const [pickedCounts, setPickedCounts] = useState({});

  const [permission, requestPermission] = useCameraPermissions();
  const [refreshing, setRefreshing] = useState(false);

  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [userId, setUserId] = useState(null);

  const { tables, labels, lines, areas } = warehouseMapLayout;
  const additionalLocations = useWarehouseMapAdditions();
  const mobilePallets = additionalLocations.filter(
    (location) => location.type === "pallet",
  );
  const mobileRacks = additionalLocations.filter(
    (location) => location.type === "rack",
  );

  const API_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/orders`;
  const INVENTORY_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage`;
  const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

  useEffect(() => {
    fetchData();
    loadUserData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersRes, invRes] = await Promise.all([
        fetch(API_URL),
        fetch(INVENTORY_URL),
      ]);
      const ordersData = await ordersRes.json();
      const invData = await invRes.json();

      const pendingOrders = Array.isArray(ordersData)
        ? ordersData.filter(
            (order) =>
              order.status === "APPROVED" || order.status === "PARTIAL",
          )
        : [];
      setOrders(pendingOrders);
      setInventory(Array.isArray(invData) ? invData : invData.items || []);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUserData = async () => {
    try {
      setLoading(true);

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUserName = await AsyncStorage.getItem("userName");

      if (storedUserId) {
        setUserId(storedUserId);

        if (storedUserName) {
          setStaffName(storedUserName);
          setStaffPosition("Warehouse Staff");
        }

        await fetchUserProfile(storedUserId, token);
      } else {
        setStaffName("Staff");
        setStaffPosition("Warehouse Staff");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setStaffName("Staff");
      setStaffPosition("Warehouse Staff");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId, token) => {
    try {
      const response = await fetch(`${USER_URL}/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success && data.user) {
        const fullName = data.user.fullName || data.user.username || "Staff";
        setStaffName(fullName);
        setStaffPosition(data.user.position || "Warehouse Staff");

        await AsyncStorage.setItem("userName", fullName);
      } else {
        console.log("Could not fetch profile");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  // ===== FAST SCAN INDEXES =====
  // batchCode -> { item, batch }
  const batchIndex = useMemo(() => {
    const map = new Map();
    for (const item of inventory) {
      if (!item?.batches) continue;
      for (const b of item.batches) {
        if (b?.batchCode) {
          map.set(String(b.batchCode).trim(), { item, batch: b });
        }
      }
    }
    return map;
  }, [inventory]);

  // lowercased itemCode/productId/name/_id -> orderItem
  const orderItemIndex = useMemo(() => {
    const map = new Map();
    if (!selectedOrder?.items) return map;
    for (const i of selectedOrder.items) {
      if (!i) continue;
      if (i.itemCode) map.set(i.itemCode.toLowerCase(), i);
      if (i.productId) map.set(i.productId.toLowerCase(), i);
      if (i.name) map.set(i.name.toLowerCase(), i);
      if (i._id) map.set(String(i._id).toLowerCase(), i);
    }
    return map;
  }, [selectedOrder]);

  const allItemsPicked = useMemo(() => {
    if (!selectedOrder?.items?.length) return false;
    return selectedOrder.items.every((orderItem) => {
      const codeLc = (orderItem.itemCode || "").toLowerCase();
      const productIdLc = (orderItem.productId || "").toLowerCase();
      const nameLc = (orderItem.name || "").toLowerCase();
      let picked = 0;
      for (const [batchCode, qty] of Object.entries(pickedCounts)) {
        const hit = batchIndex.get(String(batchCode).trim());
        if (!hit) continue;
        const invItem = hit.item;
        const invCodeLc = (invItem.itemCode || "").toLowerCase();
        const invNameLc = (invItem.name || "").toLowerCase();
        if (
          (codeLc && invCodeLc === codeLc) ||
          (productIdLc && invCodeLc === productIdLc) ||
          (nameLc && invNameLc === nameLc)
        ) {
          picked += qty;
        }
      }
      return picked >= (Number(orderItem.quantity) || 0);
    });
  }, [selectedOrder, pickedCounts, batchIndex]);

  const resetScanner = () => {
    isProcessing.current = false;
    setScanned(false);
  };

  const showScanAlert = (...args) => {
    Alert.alert(...args);
  };

  const closeScanFeedback = () => {
    setScanFeedback(null);
    resetScanner();
  };

  const closeCompletionSuccess = () => {
    setCompletionSuccess(null);
    setSelectedOrder(null);
  };

  const highlightedLocations = useMemo(() => {
    if (!selectedOrder || !inventory.length) return new Set();

    const locations = new Set();

    selectedOrder.items.forEach((orderItem) => {
      const code = orderItem.itemCode || orderItem.productId || orderItem.name;

      const invItem = inventory.find(
        (inv) => inv.itemCode === code || inv.name === code || inv._id === code,
      );

      if (invItem?.batches) {
        invItem.batches.forEach((batch) => {
          if (batch && batch.quantity > 0 && batch.storageLocation) {
            locations.add(batch.storageLocation.trim());
          }
        });
      }
    });

    return locations;
  }, [selectedOrder, inventory]);

  const handleBarCodeScanned = ({ data }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setScanned(true);
    const payload = data;
    requestAnimationFrame(() => {
      processScannedBarcode(payload);
    });
  };

  const processScannedBarcode = (data) => {
    try {
      if (!selectedOrder) {
        showScanAlert("Error", "Order data not available", [
          { text: "OK", onPress: resetScanner },
        ]);
        return;
      }

      const scannedBatchCode = String(data || "").trim();
      if (!scannedBatchCode) {
        setInvalidBarcodeNotice({ batchCode: scannedBatchCode });
        return;
      }

      // O(1) batch lookup
      const hit = batchIndex.get(scannedBatchCode);
      if (!hit) {
        setInvalidBarcodeNotice({ batchCode: scannedBatchCode });
        return;
      }

      const { item: foundItem, batch: scannedBatch } = hit;

      // Blocked statuses
      if (
        scannedBatch.status === "pending" ||
        scannedBatch.status === "disposed" ||
        scannedBatch.status === "for disposal" ||
        scannedBatch.status === "on-hold"
      ) {
        const reason =
          scannedBatch.status === "pending"
            ? "This supply has not been stored yet and cannot be picked."
            : scannedBatch.status === "for disposal"
              ? "This supply is marked for disposal and cannot be picked."
              : `Batch status is ${scannedBatch.status}.`;
        setBatchBlockedNotice({
          batchCode: scannedBatch.batchCode,
          status: scannedBatch.status,
          message: reason,
        });
        return;
      }

      // O(1) order-item lookup
      const orderItem =
        orderItemIndex.get((foundItem.itemCode || "").toLowerCase()) ||
        orderItemIndex.get((foundItem._id || "").toLowerCase()) ||
        orderItemIndex.get((foundItem.name || "").toLowerCase());

      if (!orderItem) {
        setWrongItemNotice({
          scannedItem: foundItem.name || foundItem.itemCode || "Unknown item",
          orderItems: (selectedOrder.items || []).map(
            (item) =>
              item?.name || item?.itemCode || item?.productId || "Unnamed item",
          ),
        });
        return;
      }

      // How much of this item is already picked across its batches
      const itemBatches = new Set(
        foundItem.batches.map((b) => b?.batchCode).filter(Boolean),
      );

      let totalAlreadyPicked = 0;
      for (const [bCode, qty] of Object.entries(pickedCounts)) {
        if (itemBatches.has(bCode)) totalAlreadyPicked += qty;
      }

      const orderedQuantity = Number(orderItem.quantity) || 0;
      const remainingNeeded = orderedQuantity - totalAlreadyPicked;

      if (remainingNeeded <= 0) {
        setAlreadyFilledNotice({
          itemName:
            orderItem.name ||
            orderItem.itemCode ||
            orderItem.productId ||
            foundItem.name ||
            foundItem.itemCode ||
            "This item",
          quantity: orderedQuantity,
        });
        return;
      }

      const today = new Date();

      const validBatches = foundItem.batches
        .filter((b) => {
          if (
            !b ||
            b.quantity <= 0 ||
            b.status === "pending" ||
            b.status === "disposed" ||
            b.status === "for disposal"
          ) {
            return false;
          }

          const pickedFromThisBatch = pickedCounts[b.batchCode] || 0;
          const remainingInBatch = b.quantity - pickedFromThisBatch;

          return remainingInBatch > 0 && new Date(b.expirationDate) > today;
        })
        .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));

      if (validBatches.length === 0) {
        setNoStockNotice({
          itemName:
            orderItem.name ||
            orderItem.itemCode ||
            orderItem.productId ||
            foundItem.name ||
            foundItem.itemCode ||
            "This item",
        });
        return;
      }

      const earliestBatch = validBatches[0];

      // FEFO: the scanned batch is not the earliest still-eligible one
      if (earliestBatch.batchCode !== scannedBatch.batchCode) {
        const alreadyPickedFromThisBatch =
          pickedCounts[scannedBatch.batchCode] || 0;
        const remainingInScannedBatch =
          scannedBatch.quantity - alreadyPickedFromThisBatch;

        if (remainingInScannedBatch > 0) {
          setScanFeedback({
            type: "fefo",
            earliestBatch,
            scannedBatch,
          });
          return;
        }
      }

      // How much is left in the specifically scanned batch
      const alreadyPickedFromThisBatch =
        pickedCounts[scannedBatch.batchCode] || 0;
      const remainingInThisBatch =
        scannedBatch.quantity - alreadyPickedFromThisBatch;

      if (remainingInThisBatch <= 0) {
        setBatchDepletedNotice({
          batchCode: scannedBatch.batchCode,
          itemName: foundItem.name || foundItem.itemCode || "Unknown item",
        });
        return;
      }

      const amountToPick = Math.min(remainingInThisBatch, remainingNeeded);

      if (amountToPick <= 0) {
        showScanAlert("Error", "Unable to pick from this batch.", [
          { text: "OK", onPress: resetScanner },
        ]);
        return;
      }

      const newTotalPicked = totalAlreadyPicked + amountToPick;
      if (newTotalPicked > orderedQuantity) {
        showScanAlert(
          "Over-pick Prevention",
          `Cannot pick ${amountToPick} pcs. Only ${remainingNeeded} pcs remaining to fulfill the order.`,
          [{ text: "OK", onPress: resetScanner }],
        );
        return;
      }

      // ✅ Record the pick. NO auto re-arm — user must press SCAN NEXT SUPPLY.
      setPickedCounts((prev) => ({
        ...prev,
        [scannedBatch.batchCode]:
          (prev[scannedBatch.batchCode] || 0) + amountToPick,
      }));
    } catch (err) {
      console.error("processScannedBarcode error:", err);
      showScanAlert("Error", "Failed to process scan.", [
        { text: "OK", onPress: resetScanner },
      ]);
    }
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;

    if (Object.keys(pickedCounts).length === 0) {
      Alert.alert("Error", "No items have been scanned.");
      return;
    }

    // Safeguard: block completion when any order item is under-picked
    const orderItems = selectedOrder.items || [];
    const shortItems = orderItems
      .map((orderItem) => {
        const codeLc = (orderItem.itemCode || "").toLowerCase();
        const productIdLc = (orderItem.productId || "").toLowerCase();
        const nameLc = (orderItem.name || "").toLowerCase();
        let picked = 0;
        for (const [batchCode, qty] of Object.entries(pickedCounts)) {
          const hit = batchIndex.get(String(batchCode).trim());
          if (!hit) continue;
          const invItem = hit.item;
          const invCodeLc = (invItem.itemCode || "").toLowerCase();
          const invNameLc = (invItem.name || "").toLowerCase();
          if (
            (codeLc && invCodeLc === codeLc) ||
            (productIdLc && invCodeLc === productIdLc) ||
            (nameLc && invNameLc === nameLc)
          ) {
            picked += qty;
          }
        }
        const ordered = Number(orderItem.quantity) || 0;
        return { name: orderItem.name || "Unnamed item", picked, ordered };
      })
      .filter((r) => r.picked < r.ordered);

    if (shortItems.length > 0) {
      const lines = shortItems
        .map((r) => `• ${r.name}: ${r.picked}/${r.ordered}`)
        .join("\n");
      Alert.alert(
        "Insufficient Items",
        `You cannot complete this order yet. The following items are not fully picked:\n\n${lines}`,
        [{ text: "OK" }],
      );
      return;
    }

    try {
      setCompletingOrder(true);
      setScannerModalVisible(false);
      const payload = {};

      Object.entries(pickedCounts).forEach(([batchCode, qty]) => {
        const item = inventory.find(
          (inv) =>
            inv &&
            inv.batches &&
            inv.batches.some((b) => b && b.batchCode === batchCode),
        );

        if (item && item.itemCode) {
          payload[item.itemCode] = (payload[item.itemCode] || 0) + qty;
        }
      });

      for (const [itemCode, pickedQty] of Object.entries(payload)) {
        const orderItem = orderItems.find(
          (item) => item.itemCode === itemCode || item.productId === itemCode,
        );

        if (orderItem) {
          const cappedQty = Math.min(pickedQty, orderItem.quantity);
          payload[itemCode] = cappedQty;

          if (cappedQty < orderItem.quantity) {
            console.warn(
              `Under-picking for ${itemCode}: ${cappedQty}/${orderItem.quantity}`,
            );
          }
        }
      }

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const response = await fetch(
        `${API_URL}/${selectedOrder.orderId}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(storedUserId ? { "x-user-id": storedUserId } : {}),
            ...(storedUsername ? { "x-username": storedUsername } : {}),
            ...(storedRole ? { "x-role": storedRole } : {}),
          },
          body: JSON.stringify({
            pickedItems: payload,
            userId: storedUserId,
            username: storedUsername,
            role: storedRole,
          }),
        },
      );

      if (response.ok) {
        const responseData = await response.json();

        setPickedCounts({});
        await fetchData();
        setCompletionSuccess({
          emailSent: responseData.emailSent,
          queued: responseData.queued,
        });
      } else {
        const errData = await response.json();
        Alert.alert("Error", errData.message || "Failed to update inventory.");
      }
    } catch (err) {
      console.error("Error:", err);
      Alert.alert("Error", "Network error.");
    } finally {
      setCompletingOrder(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      if (selectedOrder?.status === "APPROVED" && newStatus === "APPROVED") {
        if (!permission?.granted) {
          const result = await requestPermission();
          if (!result.granted) {
            Alert.alert(
              "Permission Denied",
              "Camera access is required to scan items.",
            );
            return;
          }
        }

        setModalVisible(false);
        setTimeout(() => {
          setScannerModalVisible(true);
          setScanned(false);
          setPickedCounts({});
        }, 500);
        return;
      }

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const response = await fetch(
        `${API_URL}/${selectedOrder.orderId}/status`,
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
            status: newStatus,
            userId: storedUserId,
            username: storedUsername,
            role: storedRole,
          }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        if (result.queued) {
          Alert.alert(
            "Saved Offline",
            "The order status update is saved on this device and will sync when you reconnect.",
          );
        }
        setModalVisible(false);

        if (newStatus === "APPROVED") {
          if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
              Alert.alert(
                "Permission Denied",
                "Camera access is required to scan items.",
              );
              return;
            }
          }
          setTimeout(() => {
            setScannerModalVisible(true);
            setScanned(false);
            setPickedCounts({});
          }, 500);
        } else {
          fetchData();
        }
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.message || "Failed to update status");
      }
    } catch (err) {
      console.error("Error in handleUpdateStatus:", err);
      Alert.alert("Error", "Network error. Please check your connection.");
    }
  };

  return (
    <>
      <Header
        navigation={navigation}
        staffName={staffName}
        staffPosition={staffPosition}
        onMenuPress={() => setMenuVisible(true)}
      />

      <View style={pickingStyles.container}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 70 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchData} />
          }
        >
          <View style={pickingStyles.mapLegend}>
            <View style={pickingStyles.legendItem}>
              <View
                style={[pickingStyles.dot, { backgroundColor: "#D4AF37" }]}
              />
              <Text style={pickingStyles.legendText}>Pick Here</Text>
            </View>
            <View style={pickingStyles.legendItem}>
              <View
                style={[pickingStyles.dot, { backgroundColor: "#E5E7EB" }]}
              />
              <Text style={pickingStyles.legendText}>Other Racks</Text>
            </View>
          </View>

          <View style={warehouseMapStyles.warehouseContainer}>
            {tables.map((table) => (
              <View
                key={table.id}
                style={[
                  warehouseMapStyles.table,
                  {
                    top: table.top,
                    left: table.left,
                    width: table.width,
                    height: table.height,
                  },
                ]}
              />
            ))}

            {labels.map((label) => (
              <Text
                key={label.id}
                style={[
                  warehouseMapStyles.label,
                  {
                    top: label.top,
                    left: label.left,
                  },
                ]}
              >
                {label.text}
              </Text>
            ))}

            {lines.map((line) => (
              <View
                key={line.id}
                style={[
                  warehouseMapStyles.line,
                  {
                    top: line.top,
                    left: line.left,
                    width: line.width,
                    height: line.height,
                    transform: line.rotate ? [{ rotate: line.rotate }] : [],
                  },
                ]}
              />
            ))}

            {areas.map((area) => (
              <View
                key={area.id}
                style={[
                  warehouseMapStyles.area,
                  {
                    top: area.top,
                    left: area.left,
                    width: area.width,
                    height: area.height,
                  },
                ]}
              />
            ))}

            {mobilePallets.map((pallet, index) => {
              const isHighlighted = highlightedLocations.has(pallet.id);

              return (
                <View
                  key={`${pallet.id}-${index}`}
                  style={[
                    warehouseMapStyles.pallet,
                    {
                      top: pallet.top,
                      left: pallet.left,
                      width: pallet.width,
                      height: pallet.height,
                      backgroundColor: isHighlighted ? "#D4AF37" : "#E5E7EB",
                    },
                  ]}
                >
                  <Text
                    style={[
                      warehouseMapStyles.rackLabel,
                      { color: isHighlighted ? "#FFFFFF" : "#111827" },
                    ]}
                  >
                    {pallet.id}
                  </Text>
                </View>
              );
            })}

            {mobileRacks.map((rack, index) => {
              const rackStyle =
                (["R1", "R2", "R3", "R4", "R5", "R6"].includes(
                  rack.className,
                ) ||
                  rack.className === "custom-rack") &&
                warehouseMapStyles.rackTypeA;
              const isHighlighted = highlightedLocations.has(rack.id);

              return (
                <View
                  key={`${rack.id}-${index}`}
                  style={[
                    warehouseMapStyles.rack,
                    rackStyle,
                    {
                      top: rack.top,
                      left: rack.left,
                      width: rack.width,
                      height: rack.height,
                      backgroundColor: isHighlighted ? "#D4AF37" : "#E5E7EB",
                    },
                  ]}
                >
                  <Text
                    style={[
                      warehouseMapStyles.rackLabel,
                      { color: isHighlighted ? "#FFFFFF" : "#111827" },
                    ]}
                  >
                    {rack.id}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={pickingStyles.listHeader}>
            <Text style={pickingStyles.headerTitle}>ORDER LIST</Text>
          </View>

          {loading && !refreshing ? (
            <ActivityIndicator
              size="large"
              color="#D4AF37"
              style={{ marginTop: 20 }}
            />
          ) : (
            orders.map((item) => (
              <TouchableOpacity
                key={item._id || item.orderId}
                style={[
                  pickingStyles.card,
                  selectedOrder?.orderId === item.orderId && {
                    borderColor: "#D4AF37",
                    borderWidth: 2,
                  },
                ]}
                onPress={() => {
                  setSelectedOrder((prev) =>
                    prev?.orderId === item.orderId ? null : item,
                  );
                }}
              >
                <View>
                  <Text style={{ fontWeight: "700", fontSize: 14 }}>
                    {item.orderId}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6B7280" }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#B45309" }}>
                    {item.status}
                  </Text>
                </View>
                <TouchableOpacity
                  style={pickingStyles.viewDetailsBtn}
                  onPress={() => {
                    setSelectedOrder(item);
                    setModalVisible(true);
                  }}
                >
                  <Text style={pickingStyles.btnText}>VIEW</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <Modal animationType="slide" transparent={true} visible={modalVisible}>
          <View style={pickingStyles.overlay}>
            <View style={pickingStyles.detailModalContainer}>
              <View style={pickingStyles.header}>
                <Text style={pickingStyles.headerText}>
                  Order ID: {selectedOrder?.orderId}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <XCircle size={28} color="#EF4444" />
                </TouchableOpacity>
              </View>
              <ScrollView style={pickingStyles.body}>
                <View style={pickingStyles.detailSection}>
                  <Text style={pickingStyles.label}>Client:</Text>
                  <Text style={pickingStyles.value}>{selectedOrder?.name}</Text>
                  <Text style={pickingStyles.label}>Address:</Text>
                  <Text style={pickingStyles.value}>
                    {selectedOrder?.shippingAddress}
                  </Text>
                </View>
                <Text style={pickingStyles.itemsHeader}>Supplies</Text>
                {selectedOrder?.items?.map((item, index) => {
                  const isBox =
                    item.orderMode === "box" && item.quantityPerBox > 0;
                  return (
                    <View key={index} style={pickingStyles.itemRow}>
                      <Text style={pickingStyles.itemName}>
                        {item.name || item.itemName}
                      </Text>
                      <View style={{ alignItems: "flex-end" }}>
                        {isBox ? (
                          <>
                            <Text style={pickingStyles.itemQty}>
                              {item.boxes} box{item.boxes !== 1 ? "es" : ""}
                            </Text>
                            <Text style={{ fontSize: 11, color: "#6B7280" }}>
                              ({item.quantity} pcs)
                            </Text>
                          </>
                        ) : (
                          <Text style={pickingStyles.itemQty}>
                            {item.quantity} Pcs.
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={pickingStyles.footerActions}>
                <TouchableOpacity
                  style={[
                    pickingStyles.actionBtn,
                    { backgroundColor: "#059669" },
                  ]}
                  onPress={() => handleUpdateStatus("APPROVED")}
                >
                  <Text style={pickingStyles.actionBtnText}>PICK NOW</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>

      {scannerModalVisible && (
        <View style={pickingStyles.scannerOverlay}>
          <View style={pickingStyles.scannerModalContainer}>
            <View style={pickingStyles.cameraPlaceholder}>
              {!scanned ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={
                    scanned ? undefined : handleBarCodeScanned
                  }
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr", "ean13", "code128", "code39"],
                    isPinchGestureEnabled: false,
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
                      paddingHorizontal: 16,
                    },
                  ]}
                >
                  {/* The button ALWAYS stays visible after a scan.
                      If all items are picked, tapping it lets the user
                      complete the order — it never auto-dismisses. */}
                  <TouchableOpacity
                    style={{
                      backgroundColor: allItemsPicked ? "#059669" : "#D4AF37",
                      padding: 15,
                      borderRadius: 10,
                      width: "100%",
                      alignItems: "center",
                    }}
                    onPress={() => {
                      if (allItemsPicked) {
                        // All items are picked: prompt to complete instead of
                        // silently re-arming. The button stays on screen.
                        Alert.alert(
                          "All items picked",
                          "All quantities for this order have been scanned. Complete the order now?",
                          [
                            {
                              text: "Scan More",
                              style: "cancel",
                              onPress: resetScanner,
                            },
                            {
                              text: "Complete",
                              onPress: handleCompleteOrder,
                            },
                          ],
                        );
                      } else {
                        resetScanner();
                      }
                    }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                      {allItemsPicked ? "COMPLETE ORDER" : "SCAN NEXT SUPPLY"}
                    </Text>
                  </TouchableOpacity>

                  {allItemsPicked && (
                    <Text
                      style={{
                        color: "#D1FAE5",
                        marginTop: 12,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      All items are picked. Tap COMPLETE ORDER to finish.
                    </Text>
                  )}
                </View>
              )}
            </View>

            <View style={[pickingStyles.infoBox, { marginTop: 10 }]}>
              <Text style={pickingStyles.infoTitle}>SUPPLIES TO PICK</Text>

              <ScrollView style={{ maxHeight: 150 }}>
                {selectedOrder?.items?.map((item, index) => {
                  let picked = 0;

                  const itemCodeLc = (item.itemCode || "").toLowerCase();
                  const productIdLc = (item.productId || "").toLowerCase();
                  const nameLc = (item.name || "").toLowerCase();

                  for (const [batchCode, qty] of Object.entries(pickedCounts)) {
                    const h = batchIndex.get(String(batchCode).trim());
                    if (!h) continue;
                    const invItem = h.item;
                    const invCodeLc = (invItem.itemCode || "").toLowerCase();
                    const invNameLc = (invItem.name || "").toLowerCase();

                    if (
                      invCodeLc === itemCodeLc ||
                      invCodeLc === productIdLc ||
                      invNameLc === nameLc
                    ) {
                      picked += qty;
                    }
                  }

                  const isPicked = picked >= Number(item.quantity);

                  return (
                    <View key={index} style={pickingStyles.itemRow}>
                      <Text
                        style={[
                          pickingStyles.itemName,
                          isPicked && pickingStyles.completedItem,
                        ]}
                      >
                        {`${item.name || item.itemName} ${picked}/${item.quantity}`}
                      </Text>

                      {isPicked && (
                        <Check size={18} color="#10B981" strokeWidth={3} />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                style={[
                  pickingStyles.scanBtn,
                  {
                    flex: 1,
                    backgroundColor: "#6B7280",
                    marginRight: 10,
                  },
                ]}
                onPress={() => {
                  setScannerModalVisible(false);
                  setScanned(false);
                }}
              >
                <Text style={pickingStyles.scanBtnText}>CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  pickingStyles.scanBtn,
                  {
                    flex: 1,
                    backgroundColor: allItemsPicked ? "#059669" : "#9CA3AF",
                  },
                ]}
                disabled={!allItemsPicked}
                onPress={handleCompleteOrder}
              >
                <Text style={pickingStyles.scanBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {completingOrder && (
        <Modal
          transparent
          visible={completingOrder}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={pickingStyles.completionLoadingOverlay}>
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text style={pickingStyles.scanLoadingTitle}>Completing order</Text>
            <Text style={pickingStyles.scanLoadingText}>
              Updating inventory and preparing shipping...
            </Text>
          </View>
        </Modal>
      )}

      {scanFeedback && (
        <Modal
          transparent
          visible={Boolean(scanFeedback)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={pickingStyles.feedbackOverlay}>
            <View
              style={[
                pickingStyles.feedbackCard,
                scanFeedback.type === "fefo" &&
                  pickingStyles.feedbackCardWarning,
              ]}
            >
              <View
                style={[
                  pickingStyles.feedbackIcon,
                  scanFeedback.type === "fefo"
                    ? pickingStyles.feedbackIconWarning
                    : pickingStyles.feedbackIconSuccess,
                ]}
              >
                {scanFeedback.type === "fefo" ? (
                  <AlertTriangle size={30} color="#B45309" />
                ) : (
                  <CheckCircle size={32} color="#047857" />
                )}
              </View>

              <Text style={pickingStyles.feedbackEyebrow}>PICKING ORDER</Text>
              <Text style={pickingStyles.feedbackTitle}>
                Pick the earliest expiry first
              </Text>

              <View style={pickingStyles.feedbackDetails}>
                <Text style={pickingStyles.feedbackDetailLabel}>SCAN NEXT</Text>
                <Text style={pickingStyles.feedbackBatchHighlight}>
                  {scanFeedback.earliestBatch.batchCode}
                </Text>
                <Text style={pickingStyles.feedbackDetailText}>
                  Expires{" "}
                  {new Date(
                    scanFeedback.earliestBatch.expirationDate,
                  ).toLocaleDateString()}
                </Text>
                <Text style={pickingStyles.feedbackDetailTextMuted}>
                  Batch {scanFeedback.scannedBatch.batchCode} should be picked
                  later.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  pickingStyles.feedbackButton,
                  pickingStyles.feedbackButtonWarning,
                ]}
                onPress={closeScanFeedback}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN CORRECT BATCH
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {batchBlockedNotice && (
        <Modal
          transparent
          visible={Boolean(batchBlockedNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setBatchBlockedNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.putawayExpiredOverlay}>
            <View style={pickingStyles.putawayExpiredCard}>
              <View style={pickingStyles.putawayExpiredIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.putawayExpiredEyebrow}>
                PICKING BLOCKED
              </Text>
              <Text style={pickingStyles.putawayExpiredTitle}>
                Batch cannot be picked
              </Text>
              <Text style={pickingStyles.putawayExpiredMessage}>
                {batchBlockedNotice.message}
              </Text>

              <View style={pickingStyles.putawayExpiredDetails}>
                <Text style={pickingStyles.putawayExpiredLabel}>BATCH</Text>
                <Text style={pickingStyles.putawayExpiredBatchCode}>
                  {batchBlockedNotice.batchCode}
                </Text>
                <Text style={pickingStyles.putawayExpiredLabel}>STATUS</Text>
                <Text style={pickingStyles.putawayExpiredDate}>
                  {batchBlockedNotice.status}
                </Text>
              </View>

              <TouchableOpacity
                style={pickingStyles.putawayExpiredButton}
                onPress={() => {
                  setBatchBlockedNotice(null);
                  resetScanner();
                }}
              >
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER BATCH
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {invalidBarcodeNotice && (
        <Modal
          transparent
          visible={Boolean(invalidBarcodeNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setInvalidBarcodeNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.putawayExpiredOverlay}>
            <View style={pickingStyles.putawayExpiredCard}>
              <View style={pickingStyles.putawayExpiredIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.putawayExpiredEyebrow}>
                INVALID BARCODE
              </Text>
              <Text style={pickingStyles.putawayExpiredTitle}>
                Batch not found
              </Text>
              <Text style={pickingStyles.putawayExpiredMessage}>
                This barcode does not match any batch in the inventory. Check
                the label and try scanning again.
              </Text>
              <View style={pickingStyles.putawayExpiredDetails}>
                <Text style={pickingStyles.putawayExpiredLabel}>
                  SCANNED BARCODE
                </Text>
                <Text style={pickingStyles.putawayExpiredBatchCode}>
                  {invalidBarcodeNotice.batchCode}
                </Text>
              </View>
              <TouchableOpacity
                style={pickingStyles.putawayExpiredButton}
                onPress={() => {
                  setInvalidBarcodeNotice(null);
                  resetScanner();
                }}
              >
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER BATCH
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {wrongItemNotice && (
        <Modal
          transparent
          visible={Boolean(wrongItemNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setWrongItemNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.wrongItemOverlay}>
            <View style={pickingStyles.wrongItemCard}>
              <View style={pickingStyles.wrongItemIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.wrongItemEyebrow}>ORDER MISMATCH</Text>
              <Text style={pickingStyles.wrongItemTitle}>
                This item is not on the order
              </Text>
              <Text style={pickingStyles.wrongItemMessage}>
                Check the scanned product and choose an item from this order.
              </Text>

              <View style={pickingStyles.wrongItemScanned}>
                <Text style={pickingStyles.wrongItemLabel}>SCANNED ITEM</Text>
                <Text style={pickingStyles.wrongItemScannedName}>
                  {wrongItemNotice.scannedItem}
                </Text>
              </View>

              <Text style={pickingStyles.wrongItemLabel}>
                ITEMS IN THIS ORDER
              </Text>
              <ScrollView
                style={pickingStyles.wrongItemList}
                contentContainerStyle={pickingStyles.wrongItemListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {wrongItemNotice.orderItems.length > 0 ? (
                  wrongItemNotice.orderItems.map((item, index) => (
                    <View
                      key={`${item}-${index}`}
                      style={pickingStyles.wrongItemOrderRow}
                    >
                      <View style={pickingStyles.wrongItemBullet} />
                      <Text style={pickingStyles.wrongItemOrderName}>
                        {item}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={pickingStyles.wrongItemEmpty}>
                    No order items are available.
                  </Text>
                )}
              </ScrollView>

              <TouchableOpacity
                style={pickingStyles.wrongItemButton}
                onPress={() => {
                  setWrongItemNotice(null);
                  resetScanner();
                }}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER ITEM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {alreadyFilledNotice && (
        <Modal
          transparent
          visible={Boolean(alreadyFilledNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setAlreadyFilledNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.alreadyFilledOverlay}>
            <View style={pickingStyles.alreadyFilledCard}>
              <View style={pickingStyles.alreadyFilledIcon}>
                <CheckCircle size={36} color="#047857" />
              </View>
              <Text style={pickingStyles.alreadyFilledEyebrow}>
                PICKING REQUIREMENT MET
              </Text>
              <Text style={pickingStyles.alreadyFilledTitle}>
                Item already filled
              </Text>
              <Text style={pickingStyles.alreadyFilledMessage}>
                The required quantity for this item has already been picked.
              </Text>

              <View style={pickingStyles.alreadyFilledDetails}>
                <Text style={pickingStyles.alreadyFilledLabel}>ITEM</Text>
                <Text style={pickingStyles.alreadyFilledItemName}>
                  {alreadyFilledNotice.itemName}
                </Text>
                <Text style={pickingStyles.alreadyFilledLabel}>QUANTITY</Text>
                <Text style={pickingStyles.alreadyFilledQuantity}>
                  {alreadyFilledNotice.quantity} /{" "}
                  {alreadyFilledNotice.quantity} picked
                </Text>
              </View>

              <TouchableOpacity
                style={pickingStyles.alreadyFilledButton}
                onPress={() => {
                  setAlreadyFilledNotice(null);
                  resetScanner();
                }}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER ITEM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {noStockNotice && (
        <Modal
          transparent
          visible={Boolean(noStockNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setNoStockNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.noStockOverlay}>
            <View style={pickingStyles.noStockCard}>
              <View style={pickingStyles.noStockIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.noStockEyebrow}>STOCK UNAVAILABLE</Text>
              <Text style={pickingStyles.noStockTitle}>
                No eligible batches
              </Text>
              <Text style={pickingStyles.noStockMessage}>
                There are no available, unexpired batches to pick for this item.
              </Text>

              <View style={pickingStyles.noStockDetails}>
                <Text style={pickingStyles.noStockLabel}>ITEM</Text>
                <Text style={pickingStyles.noStockItemName}>
                  {noStockNotice.itemName}
                </Text>
              </View>

              <TouchableOpacity
                style={pickingStyles.noStockButton}
                onPress={() => {
                  setNoStockNotice(null);
                  resetScanner();
                }}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER ITEM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {batchDepletedNotice && (
        <Modal
          transparent
          visible={Boolean(batchDepletedNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setBatchDepletedNotice(null);
            resetScanner();
          }}
        >
          <View style={pickingStyles.noStockOverlay}>
            <View style={pickingStyles.noStockCard}>
              <View style={pickingStyles.noStockIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.noStockEyebrow}>BATCH UNAVAILABLE</Text>
              <Text style={pickingStyles.noStockTitle}>Batch is depleted</Text>
              <Text style={pickingStyles.noStockMessage}>
                This batch has no remaining stock available to pick.
              </Text>

              <View style={pickingStyles.noStockDetails}>
                <Text style={pickingStyles.noStockLabel}>ITEM</Text>
                <Text style={pickingStyles.noStockItemName}>
                  {batchDepletedNotice.itemName}
                </Text>
                <Text style={pickingStyles.noStockSecondaryLabel}>
                  BATCH
                </Text>
                <Text style={pickingStyles.noStockItemName}>
                  {batchDepletedNotice.batchCode}
                </Text>
              </View>

              <TouchableOpacity
                style={pickingStyles.noStockButton}
                onPress={() => {
                  setBatchDepletedNotice(null);
                  resetScanner();
                }}
              >
                <ScanLine size={18} color="#FFFFFF" />
                <Text style={pickingStyles.feedbackButtonText}>
                  SCAN ANOTHER BATCH
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {completionSuccess && (
        <Modal
          transparent
          visible={Boolean(completionSuccess)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={pickingStyles.completionSuccessOverlay}>
            <View style={pickingStyles.completionSuccessCard}>
              <View style={pickingStyles.completionSuccessIcon}>
                <CheckCircle size={38} color="#047857" />
              </View>
              <Text style={pickingStyles.completionSuccessEyebrow}>
                {completionSuccess.queued
                  ? "PICKING QUEUED"
                  : "PICKING COMPLETE"}
              </Text>
              <Text style={pickingStyles.completionSuccessTitle}>
                {completionSuccess.queued
                  ? "Waiting to sync"
                  : "Inventory successfully deducted"}
              </Text>
              <Text style={pickingStyles.completionSuccessMessage}>
                {completionSuccess.queued
                  ? "The picking update is saved on this device. Inventory will be updated when you reconnect."
                  : "The order has been moved to shipping and is ready for the next step."}
              </Text>

              <View style={pickingStyles.completionStatusRow}>
                <View style={pickingStyles.completionStatusIcon}>
                  <CheckCircle size={19} color="#047857" />
                </View>
                <View style={pickingStyles.completionStatusCopy}>
                  <Text style={pickingStyles.completionStatusTitle}>
                    Inventory updated
                  </Text>
                  <Text style={pickingStyles.completionStatusText}>
                    Picked quantities have been deducted.
                  </Text>
                </View>
              </View>
              <View style={pickingStyles.completionStatusRow}>
                <View style={pickingStyles.completionStatusIcon}>
                  <Truck size={19} color="#047857" />
                </View>
                <View style={pickingStyles.completionStatusCopy}>
                  <Text style={pickingStyles.completionStatusTitle}>
                    {completionSuccess.queued
                      ? "Saved on this device"
                      : "Moved to shipping"}
                  </Text>
                  <Text style={pickingStyles.completionStatusText}>
                    {completionSuccess.queued
                      ? "This change has not reached the server yet."
                      : completionSuccess.emailSent
                        ? "Receipt sent to the client."
                        : "Shipping status updated successfully."}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={pickingStyles.completionSuccessButton}
                onPress={closeCompletionSuccess}
              >
                <Text style={pickingStyles.feedbackButtonText}>
                  BACK TO ORDERS
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}