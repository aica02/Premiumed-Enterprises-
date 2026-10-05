import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Product from "../models/Product.js";
import Batch from "../models/Batch.js";
import createActivityLog from "../utils/createActivityLogs.js";
import { fileURLToPath } from "url";

const router = express.Router();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../uploads/items");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "item-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter,
});

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || "Unknown",
  role: req.actor?.role || "Unknown",
});

router.get("/", async (req, res) => {
  try {
    const products = await Product.find().lean();
    const productsWithBatches = await Promise.all(
      products.map(async (product) => {
        const batches = await Batch.find({
          itemCode: product.itemCode,
        }).lean();
        return { ...product, batches };
      }),
    );

    const filteredProducts = productsWithBatches.filter(
      (p) => p.batches.length > 0,
    );
    res.json(filteredProducts);
  } catch (err) {
    console.error("Error fetching items:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/batches/all", async (req, res) => {
  try {
    const allBatches = await Batch.find({}).sort({ createdAt: -1 }).lean();

    const batchWithDetails = await Promise.all(
      allBatches.map(async (batch) => {
        try {
          const product = await Product.findOne({
            itemCode: batch.itemCode,
          }).lean();
          return {
            ...batch,
            product: product || null,
            isKit: product?.isKit || false,
          };
        } catch (err) {
          return {
            ...batch,
            product: null,
            isKit: false,
          };
        }
      }),
    );

    res.json(batchWithDetails);
  } catch (err) {
    console.error("Error fetching all batches:", err);
    res.status(500).json({
      message: "Failed to fetch batches",
      error: err.message,
    });
  }
});

router.get("/batches/pending", async (req, res) => {
  try {
    const pendingBatches = await Batch.find({
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .lean();

    const batchWithDetails = await Promise.all(
      pendingBatches.map(async (batch) => {
        try {
          const product = await Product.findOne({
            itemCode: batch.itemCode,
          }).lean();
          return {
            ...batch,
            product: product || null,
            isKit: product?.isKit || false,
          };
        } catch (err) {
          return {
            ...batch,
            product: null,
            isKit: false,
          };
        }
      }),
    );

    res.json(batchWithDetails);
  } catch (err) {
    console.error("Error fetching pending batches:", err);
    res.status(500).json({
      message: "Failed to fetch pending batches",
      error: err.message,
    });
  }
});

router.post("/batches", async (req, res) => {
  try {
    const {
      itemCode,
      itemName,
      supplierName,
      expirationDate,
      quantity,
      storageLocation,
      status = "pending",
    } = req.body;

    if (
      !itemCode ||
      !itemName ||
      !supplierName ||
      !expirationDate ||
      !quantity ||
      !storageLocation
    ) {
      return res.status(400).json({
        message: "Missing required fields",
        required: [
          "itemCode",
          "itemName",
          "supplierName",
          "expirationDate",
          "quantity",
          "storageLocation",
        ],
      });
    }

    const newBatch = new Batch({
      itemCode,
      itemName,
      supplierName,
      expirationDate: new Date(expirationDate),
      quantity: Number(quantity),
      storageLocation,
      status,
    });

    await newBatch.save();

    res.status(201).json({
      message: "Batch created successfully",
      batch: newBatch,
    });
  } catch (err) {
    console.error("Error creating batch:", err);
    res.status(500).json({
      message: "Failed to create batch",
      error: err.message,
    });
  }
});

router.get("/stored", async (req, res) => {
  try {
    const products = await Product.find().lean();

    const productsWithStoredBatches = await Promise.all(
      products.map(async (product) => {
        const batches = await Batch.find({
          itemCode: product.itemCode,
          // status: "stored",
          // status: { $ne: "disposed" },
          status: { $in: ["stored", "for disposal"] },
        }).lean();

        return { ...product, batches };
      }),
    );

    const filteredResults = productsWithStoredBatches.filter(
      (p) => p.batches.length > 0,
    );
    res.json(filteredResults);
  } catch (err) {
    console.error("Warehouse Map Fetch Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//ADD or RESTOCK in Inventory Mobile ( SUPPLY)
router.post("/", async (req, res) => {
  try {
    const {
      itemCode,
      name,
      category,
      unitType,
      supplierName,
      quantity,
      reorderLevel,
      expirationDate,
      storageLocation,
      itemImage,
    } = req.body;

    let product;
    let batch;

    // --- REGULAR ITEM (NON-KIT) ---
    let existingProduct = null;
    if (itemCode && itemCode !== "null" && itemCode !== "") {
      existingProduct = await Product.findOne({ itemCode });
    }

    if (existingProduct) {
      // RESTOCK: Update metadata only - DO NOT update totalQuantity
      existingProduct.unitType =
        unitType || existingProduct.unitType || "Piece";
      if (itemImage) {
        existingProduct.itemImage = itemImage;
      }
      await existingProduct.save();
      product = existingProduct;
    } else {
      // CREATE NEW: Create new product with totalQuantity = 0
      const productData = {
        name,
        category,
        supplierName: supplierName || "Unknown",
        reorderLevel: Number(reorderLevel) || 50,
        totalQuantity: 0,
        unitType: unitType || "Piece",
        isKit: false,
        kitItems: [],
      };

      if (itemImage) {
        productData.itemImage = itemImage;
      }

      if (itemCode && itemCode !== "null" && itemCode !== "") {
        productData.itemCode = itemCode;
      }

      product = new Product(productData);
      await product.save();
    }

    const batchData = {
      itemName: product.name,
      itemCode: product.itemCode,
      supplierName: supplierName || "Unknown",
      expirationDate:
        expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantity: Number(quantity) || 0,
      storageLocation: storageLocation || "R1-A",
      status: "pending",
      unitType: unitType || "Piece",
      disposedDate: null,
    };

    batch = new Batch(batchData);
    await batch.save();

    const savedProduct = await Product.findById(product._id).lean();
    const actor = getActor(req);

    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: itemCode ? "Restock supply" : "Create supply",
      module: "Inventory",
      description: `${product.name} was ${itemCode ? "restocked" : "added"} to inventory with pending batch ${batch.batchCode}.`,
    });

    res.status(201).json({
      success: true,
      product: savedProduct,
      batch: batch,
      message: itemCode
        ? "Item restocked successfully (pending storage)"
        : "Item added successfully (pending storage)",
      isKit: false,
    });
  } catch (err) {
    console.error("ERROR:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

//ADD or RESTOCK in Inventory Mobile (KIT)
router.post("/kit", async (req, res) => {
  try {
    const {
      itemCode,
      name,
      category,
      unitType,
      supplierName,
      quantity,
      reorderLevel,
      expirationDate,
      storageLocation,
      itemImage,
      kitItems,
    } = req.body;

    let product;
    let batch;

    // Check if product already exists (this is a RESTOCK)
    let existingProduct = null;
    if (itemCode && itemCode !== "null" && itemCode !== "") {
      existingProduct = await Product.findOne({ itemCode });
    }

    if (existingProduct) {
      // 1. Check if kit has items defined
      if (!existingProduct.kitItems || existingProduct.kitItems.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot restock: This kit has no items defined. Please recreate the kit.",
        });
      }

      // 2. Validate each kit item still exists in the database
      const validationResults = await Promise.all(
        existingProduct.kitItems.map(async (kitItem) => {
          const productItem = await Product.findOne({
            itemCode: kitItem.itemCode,
          });

          return {
            kitItem,
            exists: !!productItem,
            productItem,
          };
        }),
      );

      // 3. Check if any kit items are missing
      const missingItems = validationResults.filter((r) => !r.exists);

      if (missingItems.length > 0) {
        const missingNames = missingItems.map((r) => r.kitItem.name).join(", ");
        return res.status(400).json({
          success: false,
          message: `Cannot restock: The following kit items no longer exist in the database: ${missingNames}. Please recreate the kit.`,
          missingItems: missingItems.map((r) => r.kitItem),
        });
      }

      const stockCheck = await Promise.all(
        validationResults.map(async (r) => {
          const batches = await Batch.find({
            itemCode: r.kitItem.itemCode,
            status: "stored",
          });

          const totalAvailable = batches.reduce(
            (sum, b) => sum + b.quantity,
            0,
          );
          const requiredPerKit = r.kitItem.quantity || 1;
          const totalRequired = requiredPerKit * (Number(quantity) || 1);

          return {
            itemCode: r.kitItem.itemCode,
            name: r.kitItem.name,
            required: totalRequired,
            available: totalAvailable,
            hasStock: totalAvailable >= totalRequired,
          };
        }),
      );

      // Check if any item has insufficient stock
      const insufficientStock = stockCheck.filter((s) => !s.hasStock);

      if (insufficientStock.length > 0) {
        const stockDetails = insufficientStock
          .map(
            (s) => `${s.name} (needs ${s.required}, available: ${s.available})`,
          )
          .join("; ");

        return res.status(400).json({
          success: false,
          message: `Cannot restock: Insufficient stock for kit items: ${stockDetails}`,
          insufficientStock,
        });
      }

      // Update metadata only - kit composition is locked
      existingProduct.name = name;
      existingProduct.supplierName = supplierName || "Internal";
      existingProduct.reorderLevel = Number(reorderLevel) || 50;
      existingProduct.unitType =
        unitType || existingProduct.unitType || "Piece";
      if (itemImage) existingProduct.itemImage = itemImage;

      // existingProduct.kitItems remains unchanged

      await existingProduct.save();
      product = existingProduct;
    } else {
      if (!kitItems || kitItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Kit items are required for new kit creation",
        });
      }

      // Validate all kit items exist in database
      const itemValidation = await Promise.all(
        kitItems.map(async (item) => {
          const productItem = await Product.findOne({
            itemCode: item.itemCode,
          });
          return {
            item,
            exists: !!productItem,
            productItem,
          };
        }),
      );

      const missingItems = itemValidation.filter((r) => !r.exists);
      if (missingItems.length > 0) {
        const missingNames = missingItems.map((r) => r.item.name).join(", ");
        return res.status(400).json({
          success: false,
          message: `Cannot create kit: The following items do not exist in the database: ${missingNames}`,
          missingItems: missingItems.map((r) => r.item),
        });
      }

      // Check stock for kit items
      const stockValidation = await Promise.all(
        itemValidation.map(async (r) => {
          const batches = await Batch.find({
            itemCode: r.item.itemCode,
            status: "stored",
          });

          const totalAvailable = batches.reduce(
            (sum, b) => sum + b.quantity,
            0,
          );
          const requiredPerKit = r.item.quantity || 1;
          const totalRequired = requiredPerKit * (Number(quantity) || 1);

          return {
            itemCode: r.item.itemCode,
            name: r.item.name,
            required: totalRequired,
            available: totalAvailable,
            hasStock: totalAvailable >= totalRequired,
          };
        }),
      );

      const insufficientStock = stockValidation.filter((s) => !s.hasStock);

      if (insufficientStock.length > 0) {
        const stockDetails = insufficientStock
          .map(
            (s) => `${s.name} (needs ${s.required}, available: ${s.available})`,
          )
          .join("; ");

        return res.status(400).json({
          success: false,
          message: `Cannot create kit: Insufficient stock for kit items: ${stockDetails}`,
          insufficientStock,
        });
      }

      const resolvedKitItems = await Promise.all(
        kitItems.map(async (item) => {
          const productItem = await Product.findOne({
            itemCode: item.itemCode,
          });
          return {
            _id: productItem._id,
            name: productItem.name,
            itemCode: productItem.itemCode,
            quantity: item.quantity || 1,
            totalQuantity: (item.quantity || 1) * (Number(quantity) || 1),
            category: productItem.category,
            unitType: productItem.unitType || "Piece",
          };
        }),
      );

      const productData = {
        name,
        category: "Medical Kits",
        supplierName: supplierName || "Internal",
        reorderLevel: Number(reorderLevel) || 50,
        totalQuantity: 0,
        unitType: unitType || "Piece",
        itemImage: itemImage || null,
        isKit: true,
        kitItems: resolvedKitItems,
      };

      if (itemCode && itemCode !== "null" && itemCode !== "") {
        productData.itemCode = itemCode;
      }

      product = new Product(productData);
      await product.save();
    }

    // Create batch with PENDING status
    const batchData = {
      itemName: product.name,
      itemCode: product.itemCode,
      supplierName: supplierName || "Internal",
      expirationDate:
        expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantity: Number(quantity) || 1,
      storageLocation: storageLocation || "R1-A",
      status: "pending",
      unitType: unitType || "Piece",
      isKit: true,
      disposedDate: null,
    };

    batch = new Batch(batchData);
    await batch.save();

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: existingProduct ? "Restock kit" : "Create kit",
      module: "Inventory",
      description: existingProduct
        ? `Kit ${product.name} was restocked with pending batch ${batch.batchCode}.`
        : `Kit ${product.name} was created with pending batch ${batch.batchCode}.`,
    });

    res.status(201).json({
      success: true,
      message: existingProduct
        ? "Kit restocked with PENDING status."
        : "Kit created with PENDING status. Inventory will be updated when stored.",
      product: product,
      batch: batch,
      isKit: true,
      pendingDeduction: true,
      isRestock: !!existingProduct,
      kitItems: product.kitItems.map((item) => ({
        name: item.name,
        quantity: item.totalQuantity || item.quantity || 1,
        unitType: item.unitType || "Piece",
      })),
    });
  } catch (err) {
    console.error("ERROR creating/restocking kit:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// putaway of batches
router.patch("/batch/stored", async (req, res) => {
  try {
    const { batchCode, itemCode } = req.body;

    const batch = await Batch.findOne({ batchCode, itemCode });
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    if (batch.status === "stored") {
      return res.status(400).json({ message: "Batch is already stored" });
    }

    // CHECK IF BATCH IS EXPIRED
    let warningMessage = null;
    let daysUntilExpiry = null;

    if (batch.expirationDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiryDate = new Date(batch.expirationDate);
      expiryDate.setHours(0, 0, 0, 0);

      // Check if expired - BLOCK STORAGE
      if (expiryDate < today) {
        return res.status(400).json({
          success: false,
          message: `Cannot store expired batch. Expiration Date: ${batch.expirationDate.toISOString().split("T")[0]}`,
          batch: {
            batchCode: batch.batchCode,
            itemCode: batch.itemCode,
            expirationDate: batch.expirationDate,
            quantity: batch.quantity,
          },
        });
      }
    }

    const product = await Product.findOne({ itemCode });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let deductionResults = [];

    if (
      product.isKit === true &&
      product.kitItems &&
      product.kitItems.length > 0
    ) {
      // --- KIT DEDUCTION LOGIC ---
      for (const kitItem of product.kitItems) {
        try {
          const itemToDeduct = await Product.findById(kitItem._id);
          if (!itemToDeduct) {
            console.warn(
              "Product",
              kitItem._id,
              "not found, skipping deduction",
            );
            continue;
          }

          const deductQty = kitItem.totalQuantity || kitItem.quantity || 0;

          if (deductQty <= 0) {
            console.warn(
              "Invalid deduction quantity for",
              itemToDeduct.name + ":",
              deductQty,
            );
            continue;
          }

          const availableBatches = await Batch.find({
            itemCode: itemToDeduct.itemCode,
            status: "stored",
            quantity: { $gt: 0 },
            expirationDate: { $gt: new Date() },
          }).sort({ expirationDate: 1 });

          const totalStoredQty = availableBatches.reduce(
            (sum, b) => sum + b.quantity,
            0,
          );
          const actualDeduct = Math.min(deductQty, totalStoredQty);

          itemToDeduct.totalQuantity = Math.max(
            0,
            itemToDeduct.totalQuantity - actualDeduct,
          );
          await itemToDeduct.save();

          let remainingToDeduct = actualDeduct;
          let batchesUpdated = 0;

          for (const batchToDeduct of availableBatches) {
            if (remainingToDeduct <= 0) break;

            const take = Math.min(batchToDeduct.quantity, remainingToDeduct);
            batchToDeduct.quantity = Math.max(0, batchToDeduct.quantity - take);
            remainingToDeduct -= take;
            batchesUpdated++;

            await batchToDeduct.save();
          }

          deductionResults.push({
            item: itemToDeduct.name,
            itemCode: itemToDeduct.itemCode,
            deducted: actualDeduct,
            remaining: itemToDeduct.totalQuantity,
            batchesUpdated,
            wasShort: totalStoredQty < deductQty,
          });
        } catch (deductError) {
          console.error(
            "Error deducting",
            kitItem.name + ":",
            deductError.message,
          );
        }
      }

      // Update kit batch status to stored
      batch.status = "stored";
      await batch.save();

      product.totalQuantity += batch.quantity;
      await product.save();

      const actor = getActor(req);
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Store kit batch",
        module: "Putaway",
        description: `Kit ${product.name} batch ${batch.batchCode} was stored. Components deducted from inventory. Total kit quantity: ${product.totalQuantity}`,
      });

      return res.status(200).json({
        success: true,
        message: "Kit batch stored and inventory deducted (FEFO)",
        warning: warningMessage,
        daysUntilExpiry: daysUntilExpiry,
        batch: batch,
        product: product,
        deductions: deductionResults,
        isKit: true,
      });
    } else {
      // --- NON-KIT STORAGE LOGIC ---
      batch.status = "stored";
      await batch.save();

      product.totalQuantity += batch.quantity;
      await product.save();

      const actor = getActor(req);
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Store batch",
        module: "Putaway",
        description: `Batch ${batch.batchCode} for ${product.name} was stored successfully. Quantity: ${batch.quantity}`,
      });

      res.status(200).json({
        success: true,
        message: "Batch stored successfully",
        warning: warningMessage,
        daysUntilExpiry: daysUntilExpiry,
        batch: batch,
        product: product,
        isKit: false,
      });
    }
  } catch (err) {
    console.error("ERROR storing batch:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

router.get("/pending-kits", async (req, res) => {
  try {
    const pendingKits = await Batch.find({
      status: "pending",
    }).lean();

    const pendingKitsWithDetails = await Promise.all(
      pendingKits.map(async (batch) => {
        const product = await Product.findOne({
          itemCode: batch.itemCode,
        }).lean();
        return {
          ...batch,
          product: product || null,
          isKit: product?.isKit || false,
          kitItems: product?.kitItems || [],
        };
      }),
    );

    res.json(pendingKitsWithDetails);
  } catch (err) {
    console.error("Error fetching pending kits:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//DISPOSE BATCH on Mobile
router.patch("/batch/:batchCode/dispose", async (req, res) => {
  const { batchCode } = req.params;
  const { userId, username, role } = req.body;
  const actor = {
    userId: userId || req.actor?.userId || null,
    username: username || req.actor?.username || "Unknown",
    role: role || req.actor?.role || "Unknown",
  };

  try {
    const batch = await Batch.findOne({ batchCode: batchCode });
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    if (batch.status !== "for disposal") {
      return res.status(400).json({
        message: 'Batch must be marked "for disposal" first',
      });
    }

    if (batch.status === "disposed") {
      return res.status(400).json({
        message: "Batch is already disposed",
      });
    }

    const product = await Product.findOne({ itemCode: batch.itemCode });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const disposedQuantity = batch.quantity;
    const oldTotalQuantity = product.totalQuantity;

    if (product.totalQuantity < disposedQuantity) {
      product.totalQuantity = 0;
    } else {
      product.totalQuantity = Math.max(
        0,
        product.totalQuantity - disposedQuantity,
      );
    }

    await product.save();

    batch.status = "disposed";
    batch.disposedDate = new Date().toISOString().split("T")[0];
    await batch.save();

    // Log the activity
    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: "Dispose batch",
      module: "To Dispose",
      description: `Batch ${batch.batchCode} for ${product.name} (${batch.itemCode}) was disposed. Quantity: ${disposedQuantity}. Remaining inventory: ${product.totalQuantity}`,
    });

    res.json({
      success: true,
      message: "Batch disposed successfully",
      batch: {
        batchCode: batch.batchCode,
        itemName: batch.itemName,
        itemCode: batch.itemCode,
        disposedQuantity: disposedQuantity,
        oldTotalQuantity: oldTotalQuantity,
        remainingProductQuantity: product.totalQuantity,
        status: batch.status,
        disposedDate: batch.disposedDate,
      },
    });
  } catch (error) {
    console.error("Error disposing batch:", error);
    res
      .status(500)
      .json({ message: "Failed to dispose batch: " + error.message });
  }
});

export default router;
