import express from 'express';
import { getGarages, createGarage, updateGarage, setGarageStatus, deleteGarage } from '../controllers/garageController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);
router.use(authorize('super_admin'));

const updateGarageSchema = {
  garage_name: { required: true, type: 'string', max: 100, label: 'Garage name' },
  garage_code: { type: 'string', max: 30, label: 'Garage code' },
  phone: { type: 'string', max: 20, label: 'Phone' },
  address: { type: 'string', max: 2000, label: 'Address' }
};

router.route('/')
  .get(getGarages)
  .post(createGarage);

router.put('/:id', validate(updateGarageSchema), updateGarage);
router.patch('/:id/status', validate({
  is_active: { required: true, type: 'boolean', label: 'Active' }
}), setGarageStatus);

router.delete('/:id', deleteGarage);

export default router;
