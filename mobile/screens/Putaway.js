import React, {
  useState,
  useEffect,
  useCallback,
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
  Modal,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { pickingStyles } from "../styles/PickingStyles";
import { warehouseMapStyles } from "../styles/warehouseMapStyles";
import Sidebar from "./Sidebar";
import Header from "./Header";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AlertTriangle, CheckCircle, PackageCheck } from "lucide-react-native";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";
import { offlineFetch as fetch } from "../shared/offlineApi";
import useWarehouseMapAdditions from "../shared/useWarehouseMapAdditions";

export default function PutawayList({ navigation }) {
  const [batches, setBatches] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [highlightedRack, setHighlightedRack] = useState(null);
  const [storingBatchId, setStoringBatchId] = useState(null);
  const [storeSuccess, setStoreSuccess] = useState(null);
  const [expiredBatchNotice, setExpiredBatchNotice] = useState(null);

  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [userId, setUserId] = useState(null);

  const isProcessingRef = useRef(false);

  const { tables, labels, lines, areas, pallets, racks } = warehouseMapLayout;
  const additionalLocations = useWarehouseMapAdditions();
  const mobilePallets = [
    ...pallets,
    ...additionalLocations.filter((location) => location.type === "pallet"),
  ];
  const mobileRacks = [
    ...racks,
    ...additionalLocations.filter((location) => location.type === "rack"),
  ];

  const API_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage/batches/pending`;
  const INVENTORY_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage/stored`;
  const BATCH_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage/batches/all`;
  const COMPLETE_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage/batch/stored`;
  const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

  const NEAR_EXPIRY_DAYS = 30;

  // 1. Fetch data function
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [putawayRes, inventoryRes] = await Promise.all([
        fetch(API_URL),
        fetch(INVENTORY_URL),
      ]);

      const putawayData = await putawayRes.json();
      const inventoryData = await inventoryRes.json();

      setBatches(Array.isArray(putawayData) ? putawayData : []);
      setInventory(
        Array.isArray(inventoryData)
          ? inventoryData
          : inventoryData.items || [],
      );
    } catch (error) {
      console.error("Fetch Error:", error);
      Alert.alert("Error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    loadUserData();
  }, [fetchData]);

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
        console.log("No userId found in storage");
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

  const handleStoreBatch = async (batchId) => {
    if (isProcessingRef.current) {
      return;
    }

    if (storingBatchId === batchId) {
      return;
    }

    try {
      isProcessingRef.current = true;
      setStoringBatchId(batchId);

      const batchResponse = await fetch(BATCH_URL);
      const allBatches = await batchResponse.json();
      const batch = allBatches.find((b) => b._id === batchId);

      if (!batch) {
        Alert.alert("Error", "Batch not found");
        setStoringBatchId(null);
        isProcessingRef.current = false;
        return;
      }

      if (batch.status === "stored") {
        Alert.alert("Info", "This batch is already stored.");
        setStoringBatchId(null);
        isProcessingRef.current = false;
        await fetchData();
        return;
      }

      if (batch.expirationDate) {
        const today = new Date();

        const expiryDate = new Date(batch.expirationDate);
        expiryDate.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
          setExpiredBatchNotice({
            batchCode: batch.batchCode,
            expirationDate: expiryDate.toISOString().split("T")[0],
            message:
              "This batch has expired and cannot be stored. Please discard it.",
          });
          setStoringBatchId(null);
          isProcessingRef.current = false;
          return;
        }
      }

      const isKit = batch.isKit || false;

      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const response = await fetch(COMPLETE_URL, {
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
      });

      const result = await response.json();

      if (response.ok) {
        setHighlightedRack(null);
        setStoreSuccess({
          isKit,
          queued: result.queued,
          itemName: batch.itemName,
          batchCode: batch.batchCode,
          storageLocation: batch.storageLocation,
        });
        await fetchData();
      } else {
        if (
          result.message &&
          result.message.toLowerCase().includes("expired")
        ) {
          setExpiredBatchNotice({
            batchCode: batch.batchCode,
            message: result.message,
          });
        } else {
          Alert.alert("Error", result.message || "Failed to store batch");
        }
      }
    } catch (error) {
      Alert.alert("Error", "Server connection failed. Please try again.");
    } finally {
      setStoringBatchId(null);
      isProcessingRef.current = false;
    }
  };

  const computeDynamicStatus = (rackId, items) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasLowStock = false;
    let hasNearExpiry = false;
    let hasAnyBatch = false;

    items.forEach((item) => {
      const itemReorder = Number(item.reorderLevel) || 50;
      let totalInRack = 0;
      let hasBatchInRack = false;

      (item.batches || []).forEach((batch) => {
        const qty = Number(batch.quantity) || 0;
        if (
          batch.storageLocation !== rackId ||
          batch.status === "disposed" ||
          qty <= 0
        )
          return;

        hasBatchInRack = true;
        hasAnyBatch = true;
        totalInRack += qty;

        const expDate = new Date(batch.expirationDate);
        expDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        if (daysLeft <= NEAR_EXPIRY_DAYS) {
          hasNearExpiry = true;
        }
      });

      if (hasBatchInRack && totalInRack <= itemReorder) {
        hasLowStock = true;
      }
    });

    if (!hasAnyBatch) return "no-items";
    if (hasNearExpiry) return "nearExpiry";
    if (hasLowStock) return "lowStock";
    return "good";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "good":
        return "#22C55E";
      case "lowStock":
        return "#F59E0B";
      case "nearExpiry":
        return "#EF4444";
      default:
        return "#E5E7EB";
    }
  };

  const getPalletStatusColor = (status) => {
    switch (status) {
      case "good":
        return "#3BB143";
      case "lowStock":
        return "#ED7117";
      case "nearExpiry":
        return "#C21A09";
      default:
        return "#E5E7EB";
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
          <View style={warehouseMapStyles.legendRow}>
            <View style={warehouseMapStyles.legendItem}>
              <View
                style={[
                  warehouseMapStyles.legendDot,
                  { backgroundColor: "#22C55E" },
                ]}
              />
              <Text style={warehouseMapStyles.legendText}>Good stock</Text>
            </View>
            <View style={warehouseMapStyles.legendItem}>
              <View
                style={[
                  warehouseMapStyles.legendDot,
                  { backgroundColor: "#F59E0B" },
                ]}
              />
              <Text style={warehouseMapStyles.legendText}>Low stock</Text>
            </View>
            <View style={warehouseMapStyles.legendItem}>
              <View
                style={[
                  warehouseMapStyles.legendDot,
                  { backgroundColor: "#EF4444" },
                ]}
              />
              <Text style={warehouseMapStyles.legendText}>Near/expired</Text>
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

            {/* PALLETS */}
            {mobilePallets.map((pallet, index) => {
              const status = computeDynamicStatus(pallet.id, inventory);
              const selectedRackId = highlightedRack?.trim();
              const isHighlighted = selectedRackId === pallet.id;

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
                      backgroundColor: highlightedRack
                        ? isHighlighted
                          ? "#D4AF37"
                          : "#E5E7EB"
                        : getPalletStatusColor(status),
                    },
                  ]}
                >
                  <Text
                    style={[
                      warehouseMapStyles.rackLabel,
                      {
                        color: highlightedRack
                          ? isHighlighted
                            ? "#FFFFFF"
                            : "#111827"
                          : status === "no-items"
                            ? "#111827"
                            : "#FFFFFF",
                      },
                    ]}
                  >
                    {pallet.id}
                  </Text>
                </View>
              );
            })}

            {/* RACKS */}
            {mobileRacks.map((rack, index) => {
              const rackStyle = [
                "R1",
                "R2",
                "R3",
                "R4",
                "R5",
                "R6",
                "R7",
                "R8",
                "R9",
              ].includes(rack.className) || rack.className === "custom-rack"
                ? warehouseMapStyles.rackTypeA
                : ["R3", "R4", "R5"].includes(rack.className)
                  ? warehouseMapStyles.rackTypeB
                  : null;
              const status = computeDynamicStatus(rack.id, inventory);
              const selectedRackId = highlightedRack?.trim();
              const isHighlighted = selectedRackId === rack.id;

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
                      backgroundColor: highlightedRack
                        ? isHighlighted
                          ? "#D4AF37"
                          : "#E5E7EB"
                        : getStatusColor(status),
                    },
                  ]}
                >
                  <Text
                    style={[
                      warehouseMapStyles.rackLabel,
                      {
                        color: highlightedRack
                          ? isHighlighted
                            ? "#FFFFFF"
                            : "#111827"
                          : status === "no-items"
                            ? "#111827"
                            : "#FFFFFF",
                      },
                    ]}
                  >
                    {rack.id}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={pickingStyles.listHeader}>
            <Text style={pickingStyles.headerTitle}>PENDING SUPPLY</Text>
          </View>

          {loading && !refreshing ? (
            <ActivityIndicator
              size="large"
              color="#D4AF37"
              style={{ marginTop: 20 }}
            />
          ) : batches.length > 0 ? (
            batches.map((item) => {
              const isStoring = storingBatchId === item._id;
              const isDisabled = isStoring || isProcessingRef.current;

              return (
                <TouchableOpacity
                  key={item._id}
                  onPress={() =>
                    setHighlightedRack((current) =>
                      current === item.storageLocation
                        ? null
                        : item.storageLocation,
                    )
                  }
                  style={[
                    pickingStyles.card,
                    highlightedRack === item.storageLocation && {
                      borderColor: "#D4AF37",
                      borderWidth: 2,
                    },
                    isStoring && { opacity: 0.6 },
                  ]}
                  disabled={isStoring}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 15 }}>
                      {item.itemName}
                    </Text>
                    <Text style={{ fontSize: 13 }}>
                      Batch ID: {item.batchCode}
                    </Text>
                    <Text style={{ fontSize: 13 }}>
                      Quantity: {item.quantity}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#D4AF37",
                        fontWeight: "bold",
                      }}
                    >
                      Loc: {item.storageLocation}
                    </Text>
                    {item.isKit && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#8B5CF6",
                          fontWeight: "600",
                        }}
                      >
                        🔹 KIT - Deducts items on store
                      </Text>
                    )}
                    {item.status === "stored" && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#059669",
                          fontWeight: "600",
                        }}
                      >
                        Already Stored
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      pickingStyles.viewDetailsBtn,
                      {
                        backgroundColor: isStoring ? "#9CA3AF" : "#059669",
                      },
                    ]}
                    onPress={() => handleStoreBatch(item._id)}
                    disabled={isStoring || item.status === "stored"}
                  >
                    <Text style={pickingStyles.btnText}>
                      {isStoring ? "STORING..." : "STORE"}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text
              style={{ textAlign: "center", marginTop: 20, color: "#6B7280" }}
            >
              No Pending.
            </Text>
          )}
        </ScrollView>
      </View>

      {storeSuccess && (
        <Modal
          transparent
          visible={Boolean(storeSuccess)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setStoreSuccess(null)}
        >
          <View style={pickingStyles.putawaySuccessOverlay}>
            <View style={pickingStyles.putawaySuccessCard}>
              <View style={pickingStyles.putawaySuccessIcon}>
                <PackageCheck size={38} color="#047857" />
              </View>
              <Text style={pickingStyles.putawaySuccessEyebrow}>
                {storeSuccess.queued ? "PUTAWAY QUEUED" : "PUTAWAY COMPLETE"}
              </Text>
              <Text style={pickingStyles.putawaySuccessTitle}>
                {storeSuccess.queued
                  ? "Waiting to sync"
                  : "Batch stored successfully"}
              </Text>
              <Text style={pickingStyles.putawaySuccessMessage}>
                {storeSuccess.queued
                  ? "The putaway update is saved on this device and will sync when you reconnect."
                  : storeSuccess.isKit
                    ? "The kit was stored and its inventory components were deducted."
                    : "The batch is now available in stored inventory."}
              </Text>

              <View style={pickingStyles.putawayStatusRow}>
                <View style={pickingStyles.putawayStatusIcon}>
                  <CheckCircle size={19} color="#047857" />
                </View>
                <View style={pickingStyles.putawayStatusCopy}>
                  <Text style={pickingStyles.putawayStatusTitle}>
                    {storeSuccess.itemName}
                  </Text>
                  <Text style={pickingStyles.putawayStatusText}>
                    {storeSuccess.queued
                      ? `Batch ${storeSuccess.batchCode} - pending sync`
                      : `Batch ${storeSuccess.batchCode}`}
                  </Text>
                </View>
              </View>
              <View style={pickingStyles.putawayStatusRow}>
                <View style={pickingStyles.putawayStatusIcon}>
                  <PackageCheck size={19} color="#047857" />
                </View>
                <View style={pickingStyles.putawayStatusCopy}>
                  <Text style={pickingStyles.putawayStatusTitle}>
                    Stored at {storeSuccess.storageLocation}
                  </Text>
                  <Text style={pickingStyles.putawayStatusText}>
                    {storeSuccess.queued
                      ? "Server inventory has not changed yet"
                      : storeSuccess.isKit
                        ? "Kit inventory updated"
                        : "Inventory location updated"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={pickingStyles.putawaySuccessButton}
                onPress={() => setStoreSuccess(null)}
              >
                <Text style={pickingStyles.feedbackButtonText}>
                  BACK TO PENDING
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {expiredBatchNotice && (
        <Modal
          transparent
          visible={Boolean(expiredBatchNotice)}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setExpiredBatchNotice(null)}
        >
          <View style={pickingStyles.putawayExpiredOverlay}>
            <View style={pickingStyles.putawayExpiredCard}>
              <View style={pickingStyles.putawayExpiredIcon}>
                <AlertTriangle size={36} color="#B91C1C" />
              </View>
              <Text style={pickingStyles.putawayExpiredEyebrow}>
                PUTAWAY BLOCKED
              </Text>
              <Text style={pickingStyles.putawayExpiredTitle}>
                Batch has expired
              </Text>
              <Text style={pickingStyles.putawayExpiredMessage}>
                {expiredBatchNotice.message}
              </Text>

              <View style={pickingStyles.putawayExpiredDetails}>
                <Text style={pickingStyles.putawayExpiredLabel}>BATCH</Text>
                <Text style={pickingStyles.putawayExpiredBatchCode}>
                  {expiredBatchNotice.batchCode}
                </Text>
                {expiredBatchNotice.expirationDate && (
                  <>
                    <Text style={pickingStyles.putawayExpiredLabel}>
                      EXPIRED ON
                    </Text>
                    <Text style={pickingStyles.putawayExpiredDate}>
                      {expiredBatchNotice.expirationDate}
                    </Text>
                  </>
                )}
              </View>

              <TouchableOpacity
                style={pickingStyles.putawayExpiredButton}
                onPress={() => setExpiredBatchNotice(null)}
              >
                <Text style={pickingStyles.feedbackButtonText}>GOT IT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
