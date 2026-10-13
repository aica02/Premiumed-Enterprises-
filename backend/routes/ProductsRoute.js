// routes/inventory.js
import express from "express";
import Product from "../models/Product.js";
import Batch from "../models/Batch.js";
import createActivityLog from "../utils/createActivityLogs.js";
const router = express.Router();

// GET all inventory items with their batches
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().lean();
    const productsWithBatches = await Promise.all(
      products.map(async (product) => {
        const batches = await Batch.find({ itemCode: product.itemCode }).lean();
        return { ...product, batches };
      })
    );

    const filteredProducts = productsWithBatches.filter(product => {
      const hasPriceZero = product.price === 0 || product.price === "0";
      
      const hasStoredBatch = product.batches?.some(batch => batch.status === 'stored');
      
      if (hasPriceZero || !hasStoredBatch) {
        return false;
      }
      
      return true;
    });

    res.json(filteredProducts);
  } catch (err) {
    console.error("GET /api/inventoryPage error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET stored items (for warehouse map)
router.get("/stored", async (req, res) => {
  try {
    const products = await Product.find().lean();
    
    const productsWithStoredBatches = await Promise.all(
      products.map(async (product) => {
        const batches = await Batch.find({ 
          itemCode: product.itemCode,
          status: "stored" 
        }).lean();
        
        return { ...product, batches };
      })
    );

    const filteredResults = productsWithStoredBatches.filter(p => p.batches.length > 0);
    res.json(filteredResults);
  } catch (err) {
    console.error("Warehouse Map Fetch Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST - Add or restock item (with Cloudinary URL)
router.post("/", async (req, res) => {
  try {
    const {
      itemCode, name, category, supplierName,
      quantity, reorderLevel, expirationDate, storageLocation,
      itemImage
    } = req.body;

    // SUPER DETAILED LOGGING
    console.log("\n========== BACKEND RECEIVED REQUEST ==========");
    console.log("1. Full request body:", JSON.stringify(req.body, null, 2));
    console.log("2. itemImage value:", itemImage);
    console.log("3. itemImage type:", typeof itemImage);
    console.log("4. itemImage length:", itemImage?.length);
    console.log("5. itemImage starts with http:", itemImage?.startsWith('http'));
    console.log("6. itemImage first 50 chars:", itemImage?.substring(0, 50));
    console.log("7. itemImage last 50 chars:", itemImage?.substring(itemImage?.length - 50));

    // Check Product schema
    console.log("\n========== SCHEMA CHECK ==========");
    console.log("8. Product schema paths:", Object.keys(Product.schema.paths));
    console.log("9. Is itemImage a schema path?", !!Product.schema.paths.itemImage);
    if (Product.schema.paths.itemImage) {
     
    }

    let product;

    if (itemCode && itemCode !== 'null' && itemCode !== '') {
      // Restock existing item
      console.log("\n========== RESTOCKING EXISTING ITEM ==========");
      product = await Product.findOne({ itemCode });
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      console.log("12. Found existing product:", {
        id: product._id,
        currentImage: !!product.itemImage,
        oldImageUrl: product.itemImage ? product.itemImage.substring(0, 50) + "..." : null
      });

      // Update product
      product.totalQuantity += Number(quantity);
      
      // Update image if new one provided
      if (itemImage) {
        console.log("13. Updating image for existing product with URL:", itemImage.substring(0, 50) + "...");
        product.itemImage = itemImage;
      }
      
      console.log("14. Product before save:", {
        totalQuantity: product.totalQuantity,
        hasImage: !!product.itemImage,
        imageUrl: product.itemImage ? product.itemImage.substring(0, 50) + "..." : null
      });
      
      await product.save();
      
      // Verify after save
      const afterSave = await Product.findById(product._id).lean();
      console.log("15. Product after save:", {
        id: afterSave._id,
        hasImage: !!afterSave.itemImage,
        imageUrl: afterSave.itemImage ? afterSave.itemImage.substring(0, 50) + "..." : null,
        allFields: Object.keys(afterSave)
      });
    } else {
      // Create new item
      console.log("\n========== CREATING NEW PRODUCT ==========");
      
      const productData = {
        name,
        category,
        supplierName,
        reorderLevel: Number(reorderLevel),
        totalQuantity: Number(quantity),
      };
      
      console.log("16. Base product data (without image):", productData);
      
      // Add image URL if provided
      if (itemImage) {
        console.log("17. Adding image URL to new product:", itemImage.substring(0, 50) + "...");
        productData.itemImage = itemImage;
        console.log("18. Product data after adding image:", {
          ...productData,
          itemImage: productData.itemImage ? productData.itemImage.substring(0, 50) + "..." : null
        });
      } else {
        console.log("17. No image to add to product");
      }
      
      console.log("19. Creating new Product instance with data");
      product = new Product(productData);
      
      console.log("20. Product instance before save:", {
        id: product._id,
        hasImage: !!product.itemImage,
        imageUrl: product.itemImage ? product.itemImage.substring(0, 50) + "..." : null
      });
      
      try {
        await product.save();
        console.log("21. Product saved successfully");
      } catch (saveError) {
        console.error("21. ERROR saving product:", saveError);
        console.error("21a. Validation errors:", saveError.errors);
        throw saveError;
      }
      
      // Verify what MongoDB actually saved
      const savedCheck = await Product.findById(product._id).lean();
      console.log("22. VERIFYING SAVE - What MongoDB actually saved:", {
        id: savedCheck._id,
        hasImage: !!savedCheck.itemImage,
        imageUrl: savedCheck.itemImage ? savedCheck.itemImage.substring(0, 100) + "..." : null,
        allFields: Object.keys(savedCheck),
        fullImageUrl: savedCheck.itemImage
      });
      
      console.log("23. Product image saved in memory:", !!product.itemImage);
    }

    // Create batch
    console.log("\n========== CREATING BATCH ==========");
    const batchData = {
      itemName: product.name,
      itemCode: product.itemCode,
      supplierName,
      expirationDate,
      quantity: Number(quantity),
      storageLocation,
      status: "pending"
    };
    console.log("24. Batch data being saved:", batchData);
    
    const batch = new Batch(batchData);
    await batch.save();
    console.log("25. Batch created with code:", batch.batchCode);

    // Final verification - fetch directly from MongoDB
    console.log("\n========== FINAL VERIFICATION ==========");
    const finalProductCheck = await Product.findById(product._id).lean();
    console.log("26. FINAL CHECK - Product in MongoDB:", {
      id: finalProductCheck._id,
      hasImage: !!finalProductCheck.itemImage,
      imageUrl: finalProductCheck.itemImage ? finalProductCheck.itemImage.substring(0, 100) + "..." : null,
      imageExists: finalProductCheck.itemImage ? "YES" : "NO",
      fullImageInDB: finalProductCheck.itemImage
    });

    // Check if image field exists but is null/undefined
    console.log("27. Does itemImage field exist in DB document?", 'itemImage' in finalProductCheck);
    console.log("28. itemImage value type:", typeof finalProductCheck.itemImage);
    console.log("29. itemImage value:", finalProductCheck.itemImage);

    // Prepare response
    console.log("\n========== BACKEND RESPONSE ==========");
    const responseData = {
      success: true,
      product: finalProductCheck,
      batch,
      message: itemCode ? "Item restocked successfully" : "Item added successfully"
    };
    
    console.log("30. Response product has image:", !!finalProductCheck?.itemImage);
    console.log("31. Full response being sent:", JSON.stringify({
      ...responseData,
      product: {
        ...responseData.product,
        itemImage: responseData.product.itemImage ? 
          responseData.product.itemImage.substring(0, 50) + "..." : null
      }
    }, null, 2));

    res.status(201).json(responseData);

  } catch (err) {
    console.error("\n========== BACKEND ERROR ==========");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Full error:", err);
    if (err.name === 'ValidationError') {
      console.error("Validation errors:", err.errors);
    }
    res.status(500).json({ message: err.message });
  }
});

// DISPOSE batch
router.patch('/dispose', async (req, res) => {
  const { itemCode, batchCode } = req.body;

  try {
    const batch = await Batch.findOne({ itemCode, batchCode });

    if (!batch || batch.status === "disposed") {
      return res.status(404).send({ message: "Active batch not found" });
    }

    const batchQty = batch.quantity;
    batch.status = "disposed";
    await batch.save();

    await Product.findOneAndUpdate(
      { itemCode: itemCode },
      { $inc: { totalQuantity: -batchQty } }
    );

    res.send({ message: "Batch disposed and total quantity updated" });
  } catch (error) {
    console.error("Dispose error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

router.put("/updatePrices", async (req, res) => {
  const { prices } = req.body;
  
  try {
    const productIds = Object.keys(prices);
    
    const products = await Product.find({ 
      _id: { $in: productIds } 
    });
    
    const productMap = {};
    products.forEach(product => {
      productMap[product._id.toString()] = product;
    });
    
    const updatePromises = productIds.map(async (id) => {
      const price = Number(prices[id]);
      const product = productMap[id];
      
      if (!product) {
        console.warn(`Product with ID ${id} not found`);
        return null;
      }
      
      const updated = await Product.findByIdAndUpdate(
        id,
        { price: price },
        { new: true }
      );
      
      return updated;
    });
    
    const updatedProducts = await Promise.all(updatePromises);
    const validUpdates = updatedProducts.filter(p => p !== null);
    
    console.log("Updated products:", validUpdates.map(p => ({ 
      itemCode: p.itemCode, 
      price: p.price 
    })));

    if (validUpdates.length > 0) {
      const actor = req.actor || {};
      const changedPrices = validUpdates
        .slice(0, 10)
        .map((product) => `${product.name} (${product.itemCode}): ${product.price}`)
        .join("; ");
      const remainingCount = validUpdates.length - 10;

      await createActivityLog({
        userId: actor.userId || null,
        username:
          actor.username && actor.username !== "Unknown"
            ? actor.username
            : "Admin",
        role: actor.role && actor.role !== "Unknown" ? actor.role : "Admin",
        action: "Set supply prices",
        module: "Inventory",
        description: `Prices were set for ${validUpdates.length} ${validUpdates.length === 1 ? "supply" : "supplies"}: ${changedPrices}${remainingCount > 0 ? `; and ${remainingCount} more` : ""}.`,
      });
    }
    
    res.status(200).json({ 
      message: "Prices updated successfully",
      updated: validUpdates.length 
    });
    
  } catch (error) {
    console.error("Price update error:", error);
    res.status(500).json({ error: "Failed to update prices" });
  }
});

export default router;