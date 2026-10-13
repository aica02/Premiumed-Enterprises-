import { StyleSheet } from "react-native";

export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  crownImage: {
    width: 300,
    height: 150,
    resizeMode: "contain",
  },
  brandName: {
    color: "#D4AF37",
    fontWeight: "bold",
    fontSize: 18,
    marginTop: 10,
  },
  loginCard: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 8,
  },
  goldBar: {
    width: "100%",
    height: 20,
    backgroundColor: "#D4AF37",
    position: "absolute",
    top: -10,
    borderRadius: 5,
  },
  loginHeader: {
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 25,
    color: "#000",
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 5,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: "#FAFAFA",
  },
  // New styles for password field with eye icon
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 5,
    backgroundColor: "#FAFAFA",
  },
  passwordInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 15,
    backgroundColor: "#FAFAFA",
  },
  eyeIcon: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  loginErrorContainer: {
    width: "100%",
    backgroundColor: "#FEE2E2",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
  },
  loginFieldErrorText: {
    width: "100%",
    color: "#B91C1C",
    fontSize: 12,
    marginTop: -10,
    marginBottom: 12,
  },
  loginErrorText: {
    color: "#B91C1C",
    fontSize: 13,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: "#D4AF37",
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 5,
    marginTop: 10,
  },
  loginButtonText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },

  // forgot pass
  forgotPasswordWrapper: {
    alignSelf: "flex-end",
    marginTop: -5,
    marginBottom: 18,
  },

  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "600",
    color: "blue",
    textDecorationLine: "underline",
  },

  resetModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  resetModalContainer: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },

  resetModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  resetModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },

  resetModalBody: {
    padding: 22,
  },

  resetDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 21,
    marginBottom: 22,
    textAlign: "center",
  },

  resetLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },

  resetInput: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#1F2937",
  },

  resetMessageContainer: {
    marginTop: 15,
    padding: 12,
    borderRadius: 8,
  },

  successMessage: {
    backgroundColor: "#DCFCE7",
  },

  errorMessage: {
    backgroundColor: "#FEE2E2",
  },

  resetMessageText: {
    fontSize: 13,
    textAlign: "center",
    color: "#374151",
  },

  resetModalFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 20,
    paddingTop: 0,
  },

  resetButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  resetCancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  resetCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  resetConfirmButton: {
    backgroundColor: "#D4AF37",
  },

  resetConfirmButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  resetDisabledButton: {
    opacity: 0.6,
  },
});
