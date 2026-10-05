import { StyleSheet } from "react-native";

export const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F9",
    padding: 20,
  },

  header: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    marginBottom: 10,
    position: "relative",
  },

  backButton: {
    position: "absolute",
    left: 10,
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
    textTransform: "uppercase",
    marginBottom: 15,
  },

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 15,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  label: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },

  value: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600",
  },

  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  statusOnline: {
    marginLeft: 6,
    color: "#16A34A",
    fontWeight: "700",
    fontSize: 14,
  },

  syncButton: {
    marginTop: 30,
    backgroundColor: "#D4AF37",
    height: 45,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },

  syncButtonText: {
    marginLeft: 10,
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});