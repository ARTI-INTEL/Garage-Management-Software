import express from 'express';
import { getParts, createPart, updatePart, deletePart } from '../controllers/partController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

const partSchema = {
  part_number: { required: true, type: 'string', max: 50, label: 'Part number' },
  name: { required: true, type: 'string', max: 100, label: 'Name' },
  cost_price: { type: 'number', min: 0, label: 'Cost price' },
  sell_price: { type: 'number', min: 0, label: 'Sell price' },
  qty_in_stock: { type: 'integer', min: 0, label: 'Quantity in stock' },
  low_stock_threshold: { type: 'integer', min: 0, label: 'Low stock threshold' }
};

router.route('/')
  .get(getParts)
  .post(authorize('admin'), validate(partSchema), createPart);

router.route('/:id')
  .put(authorize('admin'), validate(partSchema), updatePart)
  .delete(authorize('admin'), deletePart);

export default router;
