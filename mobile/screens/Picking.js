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
  const [completionSuccess, setCompletionSuccess] = useState(null);
  const isProcessing = useRef(false);
  const [pickedCounts, setPickedCounts] = useState({});

  const [permission, requestPermission] = useCameraPermissions();
  const [refreshing, setRefreshing] = useState(false);

  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [userId, setUserId] = useState(null);

  const { tables, labels, lines, areas, racks } = warehouseMapLayout;


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
    processScannedBarcode(data);
  };

  const processScannedBarcode = (data) => {

    if (!selectedOrder || !inventory) {
      showScanAlert("Error", "Order or inventory data not available");
      resetScanner();
      return;
    }

    const scannedBatchCode = data.trim();

    let foundItem = null;
    let scannedBatch = null;

    for (const item of inventory) {
      if (item && item.batches) {
        const batch = item.batches.find(
          (b) => b && b.batchCode && b.batchCode.trim() === scannedBatchCode,
        );
        if (batch) {
          foundItem = item;
          scannedBatch = batch;
          break;
        }
      }
    }

    if (!scannedBatch) {
      showScanAlert("Invalid Barcode", "Batch not found in inventory.", [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    if (
      scannedBatch.status === "disposed" ||
      scannedBatch.status === "on-hold"
    ) {
      showScanAlert("Batch Blocked", `Batch status is ${scannedBatch.status}.`, [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    const orderItem = selectedOrder?.items?.find((i) => {
      if (!i) return false;

      return (
        (i.itemCode && i.itemCode === foundItem.itemCode) ||
        (i.productId && i.productId === foundItem.itemCode) ||
        (i.productId && i.productId === foundItem._id) ||
        (i.name && i.name === foundItem.name) ||
        (i.name && i.name.toLowerCase() === foundItem.name?.toLowerCase()) ||
        (i.itemCode &&
          i.itemCode.toLowerCase() === foundItem.itemCode?.toLowerCase())
      );
    });

    if (!orderItem) {
      showScanAlert(
        "Wrong Item",
        `Item "${foundItem.name || foundItem.itemCode}" is not part of this order.\n\n` +
          `Order items in this order:\n${selectedOrder.items.map((i) => `- ${i.name || i.itemCode || i.productId}`).join("\n")}\n\n` +
          `Scanned item: ${foundItem.name || foundItem.itemCode}\n\n` +
          `Please check if the correct item was scanned.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const itemBatches = foundItem.batches.map((b) => b.batchCode);
    const totalAlreadyPicked = Object.entries(pickedCounts)
      .filter(([bCode]) => itemBatches.includes(bCode))
      .reduce((sum, [, qty]) => sum + qty, 0);

    const orderedQuantity = orderItem.quantity;
    const remainingNeeded = orderedQuantity - totalAlreadyPicked;

    if (remainingNeeded <= 0) {
      showScanAlert(
        "Already Filled",
        `This item requirement is already satisfied. (${orderedQuantity}/${orderedQuantity})`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    const today = new Date();

    const validBatches = foundItem.batches
      .filter((b) => {
        if (!b || b.quantity <= 0 || b.status === "disposed") return false;

        const pickedFromThisBatch = pickedCounts[b.batchCode] || 0;
        const remainingInBatch = b.quantity - pickedFromThisBatch;

        return remainingInBatch > 0 && new Date(b.expirationDate) > today;
      })
      .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));

    if (validBatches.length === 0) {
      showScanAlert("No Stock", "No valid batches available for this item.", [
        { text: "OK", onPress: resetScanner },
      ]);
      return;
    }

    const earliestBatch = validBatches[0];

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

    const alreadyPickedFromThisBatch =
      pickedCounts[scannedBatch.batchCode] || 0;
    const remainingInThisBatch =
      scannedBatch.quantity - alreadyPickedFromThisBatch;

    if (remainingInThisBatch <= 0) {
      showScanAlert(
        "Batch Depleted",
        `Batch ${scannedBatch.batchCode} has no remaining stock.`,
        [{ text: "OK", onPress: resetScanner }],
      );
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
      console.warn("Preventing over-pick:", {
        totalAlreadyPicked,
        amountToPick,
        newTotalPicked,
        orderedQuantity,
      });
      showScanAlert(
        "Over-pick Prevention",
        `Cannot pick ${amountToPick} pcs. Only ${remainingNeeded} pcs remaining to fulfill the order.`,
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    setPickedCounts((prev) => {
      const newCounts = {
        ...prev,
        [scannedBatch.batchCode]:
          (prev[scannedBatch.batchCode] || 0) + amountToPick,
      };

      const newTotal = Object.entries(newCounts)
        .filter(([bCode]) => itemBatches.includes(bCode))
        .reduce((sum, [, qty]) => sum + qty, 0);

      return newCounts;
    });
  };
  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;

    if (Object.keys(pickedCounts).length === 0) {
      Alert.alert("Error", "No items have been scanned.");
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

      const orderItems = selectedOrder.items || [];
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
        setCompletionSuccess({ emailSent: responseData.emailSent });
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
        // Check permissions first
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
        setModalVisible(false);

        if (newStatus === "APPROVED") {
          // Check permissions first
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
            {/* TABLES */}
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

            {/* LABELS */}
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

            {/* WALL LINES */}
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

            {/* areas */}
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

            {/* RACKS */}
            {racks.map((rack, index) => {
              const rackStyle =
                ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"].includes(
                  rack.className,
                ) && warehouseMapStyles.rackTypeA;
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

        {/* Details Modal */}
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
                {selectedOrder?.items?.map((item, index) => (
                  <View key={index} style={pickingStyles.itemRow}>
                    <Text style={pickingStyles.itemName}>
                      {item.name || item.itemName}
                    </Text>
                    <Text style={pickingStyles.itemQty}>x{item.quantity}</Text>
                  </View>
                ))}
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
                      SCAN NEXT SUPPLY
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={[pickingStyles.infoBox, { marginTop: 10 }]}>
              <Text style={pickingStyles.infoTitle}>SUPPLIES TO PICK</Text>

              <ScrollView style={{ maxHeight: 150 }}>
                {selectedOrder?.items?.map((item, index) => {
                  let picked = 0;

                  Object.entries(pickedCounts).forEach(([batchCode, qty]) => {
                    const invItem = inventory.find(
                      (inv) =>
                        inv &&
                        inv.batches &&
                        inv.batches.some((b) => b && b.batchCode === batchCode),
                    );

                    if (
                      invItem &&
                      (invItem.itemCode === item.itemCode ||
                        invItem.itemCode === item.productId ||
                        invItem.name === item.name)
                    ) {
                      picked += qty;
                    }
                  });

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
                    backgroundColor: "#059669",
                  },
                ]}
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
                scanFeedback.type === "fefo" && pickingStyles.feedbackCardWarning,
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
                Expires {new Date(scanFeedback.earliestBatch.expirationDate).toLocaleDateString()}
              </Text>
              <Text style={pickingStyles.feedbackDetailTextMuted}>
                Batch {scanFeedback.scannedBatch.batchCode} should be picked later.
              </Text>
            </View>

            <TouchableOpacity
              style={[pickingStyles.feedbackButton, pickingStyles.feedbackButtonWarning]}
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
              PICKING COMPLETE
            </Text>
            <Text style={pickingStyles.completionSuccessTitle}>
              Inventory successfully deducted
            </Text>
            <Text style={pickingStyles.completionSuccessMessage}>
              The order has been moved to shipping and is ready for the next step.
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
                  Moved to shipping
                </Text>
                <Text style={pickingStyles.completionStatusText}>
                  {completionSuccess.emailSent
                    ? "Receipt sent to the client."
                    : "Shipping status updated successfully."}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={pickingStyles.completionSuccessButton}
              onPress={closeCompletionSuccess}
            >
              <Text style={pickingStyles.feedbackButtonText}>BACK TO ORDERS</Text>
            </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
