import express from 'express';
import { getUsers, getMechanics, createUser, updateUser, changeOwnPassword, issueResetCode } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

const userCreateSchema = {
  username: { required: true, type: 'string', max: 50, label: 'Username' },
  password: { required: true, type: 'string', min: 6, label: 'Password' },
  role: { required: true, type: 'enum', enum: ['admin', 'mechanic'], label: 'Role' },
  full_name: { type: 'string', max: 100, label: 'Full name' },
  phone_number: { type: 'string', max: 20, label: 'Phone' }
};

// PUT: partial update — every field optional (self-lockout guards live in
// the controller, which knows the target user).
const userUpdateSchema = {
  role: { type: 'enum', enum: ['admin', 'mechanic'], label: 'Role' },
  is_active: { type: 'boolean', label: 'Status' },
  full_name: { type: 'string', max: 100, label: 'Full name' },
  phone_number: { type: 'string', max: 20, label: 'Phone' },
  new_password: { type: 'string', min: 6, label: 'New password' }
};

// Self-service password change (any authenticated user) — before admin-only guard
router.put('/me/password', validate({
  current_password: { required: true, type: 'string', label: 'Current password' },
  new_password: { required: true, type: 'string', min: 6, label: 'New password' }
}), changeOwnPassword);

router.use(authorize('admin'));

router.get('/', getUsers);
router.get('/mechanics', getMechanics);
router.post('/', validate(userCreateSchema), createUser);
router.post('/:id/reset-code', issueResetCode);
router.put('/:id', validate(userUpdateSchema), updateUser);

export default router;
