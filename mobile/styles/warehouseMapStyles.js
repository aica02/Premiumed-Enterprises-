import { StyleSheet } from "react-native";

export const warehouseMapStyles = StyleSheet.create({
  warehouseContainer: {
    marginTop: 0,
    margin: 10,
    height: 350,
    backgroundColor: "#F9FAFB",
    position: "relative",
  },

  line: {
    position: "absolute",
    backgroundColor: "#111827",
  },

  table: {
    position: "absolute",
    backgroundColor: "#9CA3AF",
    borderRadius: 4,
  },

  label: {
    position: "absolute",
    textAlign: "center",
    fontSize: 8,
    fontWeight: "600",
    color: "#374151",
  },

  area: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#111827",
    borderStyle: "dashed",
    zIndex: 0,
  },

  rack: {
    position: "absolute",
    backgroundColor: "#E5E7EB",
    borderWidth: 0.5,
    borderColor: "#9CA3AF",
    justifyContent: "center",
    alignItems: "center",
  },

  rackTypeA: {
    borderTopLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(0,0,0,0.25)",
    borderBottomWidth: 3,
    borderBottomColor: "rgba(0,0,0,0.5)",
  },

  rackLabel: {
    fontSize: 5.5,
    fontWeight: "bold",
    color: "#111827",
  },

  mapPanel: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#F9FAFB",
  },

  mapTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },

  mapHint: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
  },

  legendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 8,
    gap: 12,
    flexWrap: "wrap",
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "600",
  },
});
