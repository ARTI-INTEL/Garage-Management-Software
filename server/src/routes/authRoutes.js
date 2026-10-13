import express from 'express';
import { login, getMe, resetPassword } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.post('/login', validate({
  username: { required: true, type: 'string', max: 50, label: 'Username' },
  password: { required: true, type: 'string', label: 'Password' },
  garage_code: { required: true, type: 'string', max: 30, label: 'Garage code' }
}), login);

// Consume an admin-issued reset code (rate-limited in app.js)
router.post('/reset-password', validate({
  username: { required: true, type: 'string', max: 50, label: 'Username' },
  garage_code: { required: true, type: 'string', max: 30, label: 'Garage code' },
  code: { required: true, type: 'string', max: 10, label: 'Reset code' },
  new_password: { required: true, type: 'string', min: 6, label: 'New password' }
}), resetPassword);

router.get('/me', protect, getMe);

export default router;

