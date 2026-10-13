import express from 'express';
import { getCustomers, getCustomerById, createCustomer, updateCustomer } from '../controllers/customerController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

const customerSchema = {
  full_name: { required: true, type: 'string', max: 100, label: 'Full name' },
  mobile_number: { required: true, type: 'string', max: 20, label: 'Mobile number' },
  whatsapp_number: { type: 'string', max: 20, label: 'WhatsApp number' },
  email: { type: 'string', max: 100, label: 'Email' },
  address: { type: 'string', max: 2000, label: 'Address' },
  notes: { type: 'string', max: 5000, label: 'Notes' }
};

router.route('/')
  .get(getCustomers)
  .post(validate(customerSchema), createCustomer);

router.route('/:id')
  .get(getCustomerById)
  .put(validate(customerSchema), updateCustomer);

export default router;

