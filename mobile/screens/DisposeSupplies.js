import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  RefreshControl,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { XCircle, Scan, TriangleAlert } from "lucide-react-native";
import Header from "./Header";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickingStyles } from "../styles/PickingStyles";
import { warehouseMapStyles } from "../styles/warehouseMapStyles";
import { warehouseMapLayout } from "../shared/warehouseMapLayout";
import { offlineFetch as fetch } from "../shared/offlineApi";

export default function DisposeSupplies({ navigation }) {
  const [disposalBatches, setDisposalBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scannerModalVisible, setScannerModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [highlightedRack, setHighlightedRack] = useState(null);

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [batchToConfirm, setBatchToConfirm] = useState(null);

  const isProcessing = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const { tables, labels, lines, areas, pallets, racks } = warehouseMapLayout;
  const INVENTORY_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/inventoryPage`;
  const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

  useEffect(() => {
    fetchDisposalBatches();
    loadUserData();
  }, []);

  const fetchDisposalBatches = async () => {
    try {
      setLoading(true);
      const response = await fetch(INVENTORY_URL);
      const data = await response.json();

      const inventoryData = Array.isArray(data) ? data : data.items || [];

      // Find all batches marked for disposal
      const batchesForDisposal = [];
      inventoryData.forEach((item) => {
        if (item.batches) {
          item.batches.forEach((batch) => {
            if (batch.status === "for disposal") {
              batchesForDisposal.push({
                ...batch,
                itemName: item.name,
                itemCode: item.itemCode,
                category: item.category,
                storageLocation: batch.storageLocation || "Unknown",
                itemId: item._id,
              });
            }
          });
        }
      });

      setDisposalBatches(batchesForDisposal);
    } catch (error) {
      console.error("Error fetching disposal batches:", error);
      Alert.alert("Error", "Failed to load disposal batches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUserData = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUserName = await AsyncStorage.getItem("userName");

      if (storedUserId) {
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
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const resetScanner = () => {
    isProcessing.current = false;
    setScanned(false);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setScanned(true);

    const scannedBatchCode = data.trim();
    console.log("Scanned batch for disposal:", scannedBatchCode);

    // Find the batch in disposal list
    const batchToDispose = disposalBatches.find(
      (batch) => batch.batchCode && batch.batchCode.trim() === scannedBatchCode,
    );

    if (
      !batchToDispose ||
      batchToDispose.batchCode !== selectedBatch?.batchCode
    ) {
      Alert.alert(
        "Invalid Batch",
        "This batch is not marked for disposal or does not exist.",
        [{ text: "OK", onPress: resetScanner }],
      );
      return;
    }

    setSelectedBatch(batchToDispose);

    // Show confirmation dialog
    setScannerModalVisible(false);
    setBatchToConfirm(batchToDispose);
    setConfirmModalVisible(true);
  };

  const handleDisposeBatch = async (batch) => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUsername = await AsyncStorage.getItem("username");
      const storedRole = await AsyncStorage.getItem("userRole");

      const response = await fetch(
        `${INVENTORY_URL}/batch/${batch.batchCode}/dispose`,
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
            userId: storedUserId,
            username: storedUsername,
            role: storedRole,
          }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        Alert.alert(
          result.queued ? "Saved Offline" : "Success",
          result.queued
            ? `Disposal of batch ${batch.batchCode} is saved on this device and will sync when you reconnect.`
            : `Batch ${batch.batchCode} has been disposed successfully.`,
          [
            {
              text: "OK",
              onPress: () => {
                setScannerModalVisible(false);
                setSelectedBatch(null);
                fetchDisposalBatches();
                resetScanner();
              },
            },
          ],
        );
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.message || "Failed to dispose batch", [
          { text: "OK", onPress: resetScanner },
        ]);
      }
    } catch (error) {
      console.error("Error disposing batch:", error);
      Alert.alert("Error", "Network error. Please try again.", [
        { text: "OK", onPress: resetScanner },
      ]);
    }
  };

  const openScannerForBatch = async (batch) => {
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
    setSelectedBatch(batch);
    setScannerModalVisible(true);
    setScanned(false);
  };

  const renderBatchCard = (batch) => {
    const isSelected = highlightedRack === batch.storageLocation;

    return (
      <TouchableOpacity
        key={batch.batchCode}
        style={[
          styles.batchCard,
          isSelected && { borderColor: "#EF4444", borderWidth: 2 },
        ]}
        onPress={() => {
          setHighlightedRack((prev) =>
            prev === batch.storageLocation ? null : batch.storageLocation,
          );
        }}
        activeOpacity={0.85}
      >
        <View style={styles.batchHeader}>
          <Text style={styles.batchCode}>Batch: {batch.batchCode}</Text>
          <View style={[styles.statusBadge, { backgroundColor: "#EF4444" }]}>
            <Text style={styles.statusText}>FOR DISPOSAL</Text>
          </View>
        </View>

        <View style={styles.batchDetails}>
          <Text style={styles.batchItemName}>
            Supply name: {batch.itemName}
          </Text>
          <Text style={styles.batchInfo}>
            Location: {batch.storageLocation}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => openScannerForBatch(batch)}
        >
          <Scan size={20} color="#FFFFFF" />
          <Text style={styles.scanButtonText}>SCAN TO DISPOSE</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Header
        navigation={navigation}
        staffName={staffName}
        staffPosition={staffPosition}
        onMenuPress={() => navigation.openDrawer()}
      />

      <View style={styles.container}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={fetchDisposalBatches}
            />
          }
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.mapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.legendText}>Pick Here</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: "#E5E7EB" }]} />
              <Text style={styles.legendText}>Other Racks</Text>
            </View>
          </View>

          <View style={styles.mapPanel}>
            <View
              style={[
                warehouseMapStyles.warehouseContainer,
                styles.warehouseContainer,
              ]}
            >
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

              {areas.map((area) => (
                <View
                  key={area.id}
                  style={{
                    position: "absolute",
                    top: area.top,
                    left: area.left,
                    width: area.width,
                    height: area.height,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#111827",
                    zIndex: 0,
                  }}
                >
                  <Text
                    style={{
                      position: "absolute",
                      top: 5,
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#6B7280",
                    }}
                  >
                    {area.label}
                  </Text>
                </View>
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
                    },
                  ]}
                />
              ))}

              {pallets.map((pallet, index) => (
                <View
                  key={`${pallet.id}-${index}`}
                  style={[
                    warehouseMapStyles.rack,
                    {
                      top: pallet.top,
                      left: pallet.left,
                      width: pallet.width,
                      height: pallet.height,
                    },
                  ]}
                >
                  <Text style={warehouseMapStyles.rackLabel}>{pallet.id}</Text>
                </View>
              ))}

              {racks.map((rack, index) => {
                const rackStyle =
                  [
                    "R1",
                    "R2",
                    "R3",
                    "R4",
                    "R5",
                    "R6",
                    "R7",
                    "R8",
                    "R9",
                  ].includes(rack.className) && warehouseMapStyles.rackTypeA;
                const isHighlighted = highlightedRack === rack.id;

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
                        backgroundColor: isHighlighted ? "#EF4444" : "#E5E7EB",
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
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#D4AF37"
              style={styles.loader}
            />
          ) : disposalBatches.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No supplies marked for disposal
              </Text>
              <Text style={styles.emptyStateSubtext}>
                Items will appear here when marked for disposal in the admin
                panel
              </Text>
            </View>
          ) : (
            disposalBatches.map(renderBatchCard)
          )}
        </ScrollView>
      </View>

      {/* Scanner Modal */}
      {scannerModalVisible && (
        <View style={pickingStyles.scannerOverlay}>
          <View style={pickingStyles.scannerModalContainer}>
            <TouchableOpacity
              style={styles.closeScannerButton}
              onPress={() => {
                setScannerModalVisible(false);
                setScanned(false);
                setSelectedBatch(null);
                resetScanner();
              }}
            >
              <XCircle size={32} color="#EF4444" />
            </TouchableOpacity>

            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>
                Scan Batch: {selectedBatch?.batchCode || "..."}
              </Text>
              <Text style={styles.scannerSubtitle}>
                {selectedBatch?.itemName || ""}
              </Text>
            </View>

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
                  <ActivityIndicator size="large" color="#D4AF37" />
                  <Text style={styles.scanningText}>Processing...</Text>
                </View>
              )}
            </View>

            <View style={styles.scannerInfo}>
              <Text style={styles.scannerInfoTitle}>INSTRUCTIONS</Text>
              <Text style={styles.scannerInfoText}>
                1. Scan the batch code to verify{"\n"}
                2. Confirm disposal in the popup{"\n"}
                3. This action cannot be undone
              </Text>
            </View>
          </View>
        </View>
      )}

      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.modalTitle}>Confirm Disposal</Text>
            <View style={styles.modalDetails}>
              <Text style={styles.modalLabel}>Batch Code</Text>
              <Text style={styles.modalValue}>{batchToConfirm?.batchCode}</Text>

              <Text style={styles.modalLabel}>Supply Name</Text>
              <Text style={styles.modalValue}>{batchToConfirm?.itemName}</Text>
              <Text style={styles.modalLabel}>Category</Text>
              <Text style={styles.modalValue}>
                {batchToConfirm?.category || "N/A"}
              </Text>

              <Text style={styles.modalLabel}>Quantity</Text>
              <Text style={styles.modalValue}>{batchToConfirm?.quantity}</Text>

              <Text style={styles.modalLabel}>Location</Text>
              <Text style={styles.modalValue}>
                {batchToConfirm?.storageLocation || "N/A"}
              </Text>

              <Text style={styles.modalLabel}>Expiry Date</Text>
              <Text style={styles.modalValue}>
                {batchToConfirm?.expirationDate
                  ? new Date(batchToConfirm.expirationDate).toLocaleDateString()
                  : "N/A"}
              </Text>
            </View>

            <View style={styles.modalWarning}>
              <TriangleAlert size={18} color="#EF4444" />
              <Text style={styles.modalWarningText}>
                This action cannot be undone!
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setConfirmModalVisible(false);
                  setScannerModalVisible(true);
                  resetScanner();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.disposeButton}
                onPress={() => {
                  setConfirmModalVisible(false);
                  handleDisposeBatch(batchToConfirm);
                }}
              >
                <Text style={styles.disposeButtonText}>Confirm Disposal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    top: "3%",
    flex: 1,
    backgroundColor: "#F5F5F5",
    marginHorizontal: 10,
  },

  mapLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 5,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "600",
  },

  scrollView: {
    flex: 1,
  },

  loader: {
    marginTop: 50,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  batchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  batchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  batchCode: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  batchDetails: {
    marginTop: 4,
    marginBottom: 12,
  },
  batchItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  batchInfo: {
    fontSize: 13,
    color: "#6B7280",
    marginVertical: 1,
  },
  scanButton: {
    backgroundColor: "#D4AF37",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  closeScannerButton: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 20,
    padding: 4,
  },
  scannerHeader: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  scannerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
  },
  scannerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  scannerInfo: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    marginTop: 10,
  },
  scannerInfoTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  scannerInfoText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
  },
  scanningText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },

  confirmModal: {
    width: "88%",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 22,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },

  modalWarning: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  modalWarningText: {
    color: "#EF4444",
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "600",
  },

  modalDetails: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
  },

  modalLabel: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 8,
  },

  modalValue: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },

  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },

  cancelButton: {
    flex: 1,
    backgroundColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 8,
    marginRight: 8,
    alignItems: "center",
  },

  disposeButton: {
    flex: 1,
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: "center",
  },

  cancelButtonText: {
    color: "#111827",
    fontWeight: "700",
  },

  disposeButtonText: {
    color: "#FFF",
    fontWeight: "700",
  },
});
