import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export const pickingStyles = StyleSheet.create({
  // Existing Sidebar Styles
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-start",
  },
  menuContainer: {
    width: "75%",
    height: "100%",
    backgroundColor: "#FFFFFF",
    paddingTop: 60,
    paddingHorizontal: 20,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  // logoImage: {
  //   width: 60,
  //   height: 60,
  //   resizeMode: "contain",
  // },

  menuTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#1F2937",
    letterSpacing: 1,
    marginRight: 16,
  },

  closeButton: {
    padding: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  menuItemActive: {
    backgroundColor: "#FFF7E6",
    borderRadius: 10,
    borderBottomColor: "transparent",
    paddingLeft: 12,
    paddingRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4B5563",
    marginLeft: 15,
  },
  menuItemTextActive: {
    color: "#7C4A03",
    fontWeight: "700",
  },

  // for putaway list - number of not stored supplies.
  menuContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  notificationBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },

  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
});
