import express from 'express';
const router = express.Router();
import Supplier from '../models/Supplier.js';
import createActivityLog from '../utils/createActivityLogs.js';

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || 'Unknown',
  role: req.actor?.role || 'Unknown',
});

router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const lastSupplier = await Supplier.findOne().sort({ createdAt: -1 });
    let nextId = "SUP-001";
    
    if (lastSupplier && lastSupplier.id) {
      const lastNum = parseInt(lastSupplier.id.split('-')[1]);
      nextId = `SUP-${String(lastNum + 1).padStart(3, '0')}`;
    }

    const newSupplier = new Supplier({
      ...req.body,
      id: nextId
    });

    const savedSupplier = await newSupplier.save();

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || savedSupplier.name,
      role: actor.role || 'Admin',
      action: 'Create supplier',
      module: 'Supplier Management',
      description: `Supplier "${savedSupplier.name}" was created.`,
    });

    res.status(201).json(savedSupplier);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { id: req.params.id }, 
      { $set: req.body },
      { new: true, runValidators: true } 
    );
    
    if (!updatedSupplier) return res.status(404).json({ message: "Supplier not found" });

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || updatedSupplier.name,
      role: actor.role || 'Admin',
      action: 'Update supplier',
      module: 'Supplier Management',
      description: `Supplier "${updatedSupplier.name}" was updated.`,
    });

    res.json(updatedSupplier);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndDelete({ id: req.params.id });
    
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || supplier.name,
      role: actor.role || 'Admin',
      action: 'Delete supplier',
      module: 'Supplier Management',
      description: `Supplier "${supplier.name}" was deleted.`,
    });

    res.json({ message: "Supplier deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.patch('/:id', async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id, 
      { status: req.body.status }, 
      { new: true }
    );
    
    if (!updatedSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || updatedSupplier.name,
      role: actor.role || 'Admin',
      action: 'Update supplier status',
      module: 'Supplier Management',
      description: `Supplier "${updatedSupplier.name}" status was updated.`,
    });
    
    res.json(updatedSupplier);
  } catch (err) {m
    res.status(500).json({ error: err.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    const data = await Supplier.find({ status: "Active" }).sort({ name: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;