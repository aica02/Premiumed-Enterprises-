import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { offlineFetch } from "./offlineApi";

const WAREHOUSE_MAP_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/warehouse-map/layout`;

export default function useWarehouseMapAdditions() {
  const [locations, setLocations] = useState([]);

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

          if (isActive) setLocations(data.locations);
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
    className: location.type === "rack" ? "custom-rack" : undefined,
  }));
}
