import mongoose from "mongoose";

const categoryMap = {
  "Cardiovascular & Emergency Medications": "CARD",
  "IV & Injectable Medications": "INJK",
  "Intravenous Fluids & Solutions": "IVFS",
  "Dialysis / Blood Administration Supplies": "DIAL",
  "Respiratory Supplies & Equipment": "RESP",
  "Minor Surgical & Clinical Instruments": "MSCI",
  "Medical Equipment & Furniture": "EQPT",
  "Personal Protective Equipment (PPE)": "PPE",
  "Injection & Sharps Supplies": "SHRP",
  "Antiseptics & Disinfectants & Sterilization": "ANTK",
  "Surgical & Clinical Instruments": "SURG",
  "Medical Kits": "KITS",
  "Kit Inclusions": "KITI",
};


const productSchema = new mongoose.Schema(
  {
    itemCode: { type: String, unique: true },
    name: { type: String, required: true, trim: true },
    category: { 
      type: String, 
      required: true, 
      enum: Object.keys(categoryMap) 
    },
    unitType: { type: String, required: true },
    totalQuantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, required: true, min: 0 },
    supplierName: { type: String, required: true },
    itemImage: { type: String, default: null },
    price: { type: Number, default: 0, min: 0 },
    isKit: { type: Boolean, default: false },
    kitItems: { type: Array, default: [] },
  },
  { timestamps: true }
);

productSchema.pre("save", async function () {
  if (!this.itemCode) {
    const shortCat = categoryMap[this.category] || "GEN";
    
    // Find the product in this category with the highest itemCode
    const lastProduct = await mongoose.model("Product")
      .findOne({ category: this.category })
      .sort({ itemCode: -1 }) // Sort descending to get the highest code
      .lean();

    let nextSeries = 1;

    if (lastProduct && lastProduct.itemCode) {
      // Extract the last 3 digits from 'PRMED-CARD-001'
      const parts = lastProduct.itemCode.split("-");
      const lastNum = parseInt(parts[parts.length - 1]);
      nextSeries = lastNum + 1;
    }

    const series = nextSeries.toString().padStart(3, "0");
    this.itemCode = `PRMED-${shortCat}-${series}`;
  }
});

export default mongoose.model("Product", productSchema);