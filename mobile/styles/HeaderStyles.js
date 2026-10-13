import { StyleSheet, Dimensions } from "react-native";
const { width } = Dimensions.get("window");

export const headerStyles = StyleSheet.create({
  // header
  headerContainer: {
    height: 70,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 2,
    paddingHorizontal: 15,
    paddingVertical: 15,
    marginTop: 15,
    marginBottom: 10,
    zIndex: 100,
    top: "3%",
    marginHorizontal: 10,
  },

  profileWrapper: {
    position: "relative",
  },

  profilePill: {
    flexDirection: "row",
    alignItems: "center",
    // backgroundColor: "#F9FAFB",
    borderRadius: 30,
    // paddingHorizontal: 15,
    paddingVertical: 8,
  },

  textContainer: {
    marginRight: 10,
    alignItems: "flex-end",
  },

  staffName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },

  staffPosition: {
    fontSize: 12,
    color: "#6B7280",
  },

  dropdown: {
    position: "absolute",
    top: 58,
    right: 0,
    width: 200,
    backgroundColor: "#FFF",
    borderRadius: 12,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,

    elevation: 8,
    zIndex: 999,
  },

  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },

  dropdownText: {
    marginLeft: 12,
    fontSize: 15,
    color: "#374151",
  },

  logoutText: {
    marginLeft: 12,
    fontSize: 15,
    color: "#DC2626",
    fontWeight: "600",
  },

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },

  // logout
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
  },

  logoutModalContainer: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 25,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },

  logoutIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF8E1",
    borderWidth: 1,
    borderColor: "#F1D77A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  logoutModalTitle: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },

  logoutModalMessage: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    // marginBottom: 7,
  },

  // logoutModalSubMessage: {
  //   fontSize: 13,
  //   color: "#6B7280",
  //   textAlign: "center",
  //   lineHeight: 19,
  //   marginBottom: 25,
  // },

  logoutModalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 25,
  },

  logoutModalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },

  logoutCancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  logoutCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  logoutConfirmButton: {
    backgroundColor: "#D4AF37",
  },

  logoutConfirmButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Password Modal Styles
  passwordModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  passwordModalContainer: {
    width: width * 0.9,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  passwordModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  passwordModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    letterSpacing: 0.5,
  },
  passwordModalBody: {
    padding: 20,
  },
  passwordModalFooter: {
    flexDirection: "row",
    padding: 20,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  // Form Input Styles
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 8,
  },

  // Password Input with Eye Icon
  passwordInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: "#1F2937",
  },
  eyeIcon: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  forgotPassWrapper: {
    marginTop: 5,
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  forgotPasswordText: {
    fontSize: 14,
    color: "blue",
    textDecorationLine: "underline",
  },

  // Button Styles
  passwordButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  confirmButton: {
    backgroundColor: "#D4AF37",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 14,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  resetDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
    textAlign: "center",
  },

  resetMessageContainer: {
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 10,
    width: "100%",
  },

  successMessage: {
    backgroundColor: "#DEF7EC",
    borderWidth: 1,
    borderColor: "#0E9F6E",
  },

  errorMessage: {
    backgroundColor: "#FDE8E8",
    borderWidth: 1,
    borderColor: "#F05252",
  },

  resetMessageText: {
    fontSize: 14,
    textAlign: "center",
    color: "#1F2937",
  },
  passwordSuccessOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  passwordSuccessCard: {
    width: "100%",
    maxWidth: 390,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderTopWidth: 5,
    borderTopColor: "#059669",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  passwordSuccessIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    marginBottom: 16,
  },
  passwordSuccessTitle: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 7,
  },
  passwordSuccessMessage: {
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 18,
  },
  passwordSuccessButton: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#047857",
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 4,
  },
  passwordSuccessButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  passwordRequirementsContainer: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  requirementsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  requirementText: {
    fontSize: 13,
    marginLeft: 8,
  },
  requirementMet: {
    color: "#10B981",
  },
  requirementUnmet: {
    color: "#EF4444",
  },
  strengthContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  strengthBar: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "right",
  },
  errorItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: -10,
    marginHorizontal: 10,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
