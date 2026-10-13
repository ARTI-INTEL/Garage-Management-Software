import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getSettings)
  .put(authorize('admin'), validate({
    garage_name: { required: true, type: 'string', max: 100, label: 'Garage name' },
    address: { type: 'string', max: 2000, label: 'Address' },
    phone: { type: 'string', max: 20, label: 'Phone' },
    logo_url: { type: 'string', max: 255, label: 'Logo URL' },
    currency: { type: 'string', max: 10, label: 'Currency' },
    tax_rate: { type: 'number', min: 0, max: 100, label: 'Tax rate' },
    whatsapp_template: { type: 'string', max: 5000, label: 'WhatsApp template' }
  }), updateSettings);

export default router;
