import { warehouseMapLayout } from "../../mobile/shared/warehouseMapLayout.js";
import WarehouseMapLayout from "../models/WarehouseMapLayout.js";

const toPercentageNumber = (value) => {
  if (typeof value === "number") return value;
  return Number.parseFloat(value);
};

export const getDefaultWarehouseLocations = () => [
  ...warehouseMapLayout.racks.map((rack) => ({
    id: rack.id,
    type: "rack",
    top: toPercentageNumber(rack.top),
    left: toPercentageNumber(rack.left),
    width: toPercentageNumber(rack.width),
    height: toPercentageNumber(rack.height),
    className: rack.className,
  })),
  ...warehouseMapLayout.pallets.map((pallet) => ({
    id: pallet.id,
    type: "pallet",
    top: toPercentageNumber(pallet.top),
    left: toPercentageNumber(pallet.left),
    width: toPercentageNumber(pallet.width),
    height: toPercentageNumber(pallet.height),
  })),
];

export async function ensureWarehouseMapDefaults() {
  let layout = await WarehouseMapLayout.findOne();
  if (!layout) {
    layout = new WarehouseMapLayout();
  }

  if (!layout.defaultsSeeded) {
    const existingIds = new Set(
      layout.locations.map((location) => location.id.toLowerCase()),
    );
    const missingLocations = getDefaultWarehouseLocations().filter(
      (location) => !existingIds.has(location.id.toLowerCase()),
    );
    layout.locations.push(...missingLocations);
    layout.defaultsSeeded = true;
    await layout.save();
  }

  return layout;
}
