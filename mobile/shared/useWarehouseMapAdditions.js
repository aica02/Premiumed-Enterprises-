import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { offlineFetch } from "./offlineApi";
import { warehouseMapLayout } from "./warehouseMapLayout";

const WAREHOUSE_MAP_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/warehouse-map/layout?version=2`;

const staticLocations = [
  ...warehouseMapLayout.racks.map((location) => ({
    ...location,
    type: "rack",
    top: Number.parseFloat(location.top),
    left: Number.parseFloat(location.left),
    width: Number.parseFloat(location.width),
    height: Number.parseFloat(location.height),
  })),
  ...warehouseMapLayout.pallets.map((location) => ({
    ...location,
    type: "pallet",
    top: Number.parseFloat(location.top),
    left: Number.parseFloat(location.left),
    width: Number.parseFloat(location.width),
    height: Number.parseFloat(location.height),
  })),
];

export default function useWarehouseMapAdditions() {
  const [locations, setLocations] = useState(staticLocations);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadLocations = async () => {
        try {
          const response = await offlineFetch(WAREHOUSE_MAP_URL);
          if (!response.ok) {
            throw new Error(`Warehouse map request failed (${response.status}).`);
          }

          const data = await response.json();
          if (!Array.isArray(data.locations)) {
            throw new Error("Warehouse map response has an invalid locations list.");
          }

          const currentLocations =
            data.version >= 2
              ? data.locations
              : [
                  ...staticLocations,
                  ...data.locations.filter(
                    (location) =>
                      !staticLocations.some(
                        (staticLocation) =>
                          staticLocation.id.toLowerCase() ===
                          location.id.toLowerCase(),
                      ),
                  ),
                ];
          if (isActive) setLocations(currentLocations);
        } catch (error) {
          console.error("Failed to load shared warehouse map additions:", error);
        }
      };

      loadLocations();
      return () => {
        isActive = false;
      };
    }, []),
  );

  return locations.map((location) => ({
    ...location,
    top: `${location.top}%`,
    left: `${location.left}%`,
    width: `${location.width}%`,
    height: `${location.height}%`,
    className:
      location.type === "rack"
        ? location.className || "custom-rack"
        : undefined,
  }));
}
