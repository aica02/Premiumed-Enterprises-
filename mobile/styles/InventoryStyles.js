import { MoveRight } from "lucide-react-native";
import { StyleSheet, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const styles = StyleSheet.create({
  // MAIN LAYOUT

  container: {
    top: "3%",
    flex: 1,
    backgroundColor: "#F5F5F5",
    marginHorizontal: 10,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 5,
    backgroundColor: "#F9FAFB",
  },
  pickerWrapper: {
    flex: 2,
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    backgroundColor: "#FFF",
    height: 15,
    justifyContent: "center",
    overflow: "hidden",
  }, // Tab Styles - Add to your styles object
  tabContainer: {
    flexDirection: "row",
    marginBottom: 15,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    gap: 8,
  },
  activeTab: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  activeTabText: {
    color: "#D4AF37",
  },
  miniPicker: {
    height: 220,
    width: "200%",
    marginLeft: "-50%",
    transform: [{ scaleX: 0.5 }, { scaleY: 0.5 }],
  },
  headerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 15,
  },

  // SEARCH & ADD BAR
  actionContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 15,
    alignItems: "center",
    elevation: 2,
    height: 45,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
  },
  addBtn: {
    backgroundColor: "#D4AF37",
    borderRadius: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addBtnText: {
    color: "#FFF",
    fontWeight: "700",
  },

  retrieveBtn: {
    backgroundColor: "#D4AF37",
    borderRadius: 15,
    padding: 5,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 15,
  },

  // LIST CARDS
  card: {
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    elevation: 2,
    alignItems: "center",
    marginHorizontal: 10,
  },
  itemName: {
    fontWeight: "700",
    color: "#1F2937",
  },
  itemSubtext: {
    fontSize: 12,
    color: "#6B7280",
  },
  qtyBadge: {
    backgroundColor: "#F6EFD7",
    padding: 10,
    position: "relative",
    borderRadius: 8,
  },
  qtyText: {
    color: "#D4AF37",
    fontWeight: "800",
  },

  // MODAL CORE
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    height: "85%",
    backgroundColor: "#FFF",
    borderRadius: 10,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#EEE",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
  },

  // FORM INPUTS
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 5,
    marginTop: 15,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fieldErrorText: {
    color: "#B91C1C",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pickerContainer: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    maxHeight: 70,
    height: 45,
    justifyContent: "center",
    borderColor: "#E5E7EB",
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  // SCANNER (INLINE & FULLSCREEN)
  inlineScannerContainer: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    overflow: "hidden",
    height: 50,
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  scannerGuide: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scannerTarget: {
    width: 180,
    height: 100,
    borderWidth: 2,
    borderColor: "#D4AF37",
    borderRadius: 8,
    backgroundColor: "rgba(212, 175, 55, 0.1)",
  },
  scanIconButton: {
    backgroundColor: "#1F2937",
    padding: 12,
    borderRadius: 8,
  },
  closeCameraBtn: {
    position: "absolute",
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  viewfinder: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#D4AF37",
    backgroundColor: "transparent",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  laser: {
    width: "80%",
    height: 2,
    backgroundColor: "#EF4444",
  },
  cancelScan: {
    marginTop: 50,
    backgroundColor: "#EF4444",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
  }, // Viewfinder Masking
  cameraContainer: {
    height: 220, // Height of the whole scanner area
    width: "100%",
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
    marginVertical: 10,
  },
  fullCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  maskOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  maskOutside: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  maskCenter: {
    flexDirection: "row",
  },
  viewfinderWindow: {
    width: "85%",
    height: 120,
    borderWidth: 2,
    borderColor: "#D4AF37",
    backgroundColor: "transparent",
    borderRadius: 10,
  },

  // SAVE BUTTON
  saveBtn: {
    backgroundColor: "#D4AF37",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 40,
  },
  saveBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 16,
  },
  // Add these to your styles object
  batchModalContainer: {
    width: "95%",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingBottom: 20,
    paddingHorizontal: 10,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  addRestockBtn: {
    flexDirection: "row",
    backgroundColor: "#D4AF37",
    padding: 10,
    borderRadius: 8,
    alignSelf: "flex-end",
    marginRight: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  addRestockText: {
    color: "#FFF",
    fontWeight: "bold",
    marginLeft: 5,
    fontSize: 12,
  },
  batchTableHeader: {
    flexDirection: "row",
    backgroundColor: "#FFF9E6",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#EEE",
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#4B5563",
    textAlign: "center",
  },
  batchRow: {
    flexDirection: "row",
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    alignItems: "center",
  },
  batchCell: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  statusBadge: {
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 2,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  modalSubTitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  successModalContainer: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 30,
    alignItems: "center",
    elevation: 10,
  },
  errorModalContainer: {
    width: "88%",
    maxWidth: 400,
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderTopWidth: 5,
    borderTopColor: "#EF4444",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  errorIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    marginBottom: 14,
  },
  errorEyebrow: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  errorTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 7,
  },
  errorMessage: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 10,
  },
  errorButton: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#B91C1C",
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 20,
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 15,
    color: "#1F2937",
  },
  successDetailBox: {
    backgroundColor: "#F3F4F6",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 5,
  },
  detailValue: {
    color: "#1F2937",
    fontWeight: "bold",
  },
  printSection: {
    width: "100%",
    marginBottom: 20,
  },
  printLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 5,
  },
  printInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    textAlign: "center",
    fontSize: 18,
    backgroundColor: "#FFF",
    color: "#1F2937",
  },
  printButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  printIcon: {
    marginRight: 10,
  },
  dismissBtn: {
    marginTop: -10,
  },
  dismissBtnText: {
    color: "#9CA3AF",
    fontWeight: "bold",
  },
  imagePickerContainer: {
    marginBottom: 20,
  },
  imagePreviewWrapper: {
    alignItems: "center",
  },
  imagePreview: {
    width: 150,
    height: 150,
    borderRadius: 8,
    marginBottom: 10,
  },
  changeImageBtn: {
    padding: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
  },
  changeImageText: {
    color: "#374151",
    fontWeight: "500",
  },
  imagePlaceholder: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 5,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    maxWidth: 50,
    height: 50,
  },
  imagePlaceholderText: {
    marginTop: 10,
    color: "#374151",
    fontWeight: "500",
  },
  imagePlaceholderSubtext: {
    marginTop: 5,
    color: "#9CA3AF",
    fontSize: 12,
  },
  compactImagePicker: {
    padding: 5,
    height: 50,
    width: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
  },
  compactImagePreview: {
    width: 50,
    height: 50,
    borderRadius: 4,
    marginRight: 5,
  },
  compactImageText: {
    fontSize: 10,
    color: "#374151",
    fontWeight: "500",
  },

  // confirmation
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  confirmModal: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },

  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  confirmIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  confirmTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#111827",
  },

  confirmSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 3,
  },

  confirmErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 11,
    marginBottom: 12,
    gap: 8,
  },

  confirmErrorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },

  confirmClose: {
    width: 35,
    height: 35,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  supplyPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
  },

  supplyIcon: {
    width: 55,
    height: 55,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },

  supplyImage: {
    width: "100%",
    height: "100%",
  },

  supplyName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },

  itemCode: {
    fontSize: 11,
    color: "#D4AF37",
    fontWeight: "600",
    marginTop: 2,
  },

  categoryText: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },

  confirmDetails: {
    maxHeight: 220,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  detailLabel: {
    fontSize: 13,
    color: "#6B7280",
  },

  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    textAlign: "right",
    // maxWidth: "60%",
  },

  imageStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  confirmNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 11,
    marginTop: 15,
    gap: 8,
  },

  confirmNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400E",
  },

  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },

  confirmButton: {
    flex: 1.4,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#D4AF37",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  confirmButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
