import express from 'express';
import { getVehicles, getVehicleById, createVehicle, updateVehicle } from '../controllers/vehicleController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import pool from '../config/db.js';

const router = express.Router();

router.use(protect);

const vehicleSchema = {
  customer_id: { required: true, type: 'integer', label: 'Customer' },
  registration_number: { required: true, type: 'string', max: 20, label: 'Registration number' },
  make: { required: true, type: 'string', max: 50, label: 'Make' },
  model: { required: true, type: 'string', max: 50, label: 'Model' },
  year: { type: 'integer', min: 1900, max: 2100, label: 'Year' },
  colour: { type: 'string', max: 30, label: 'Colour' },
  vehicle_type: { type: 'string', max: 50, label: 'Vehicle type' },
  vin: { type: 'string', max: 50, label: 'VIN' },
  odometer: { type: 'integer', min: 0, label: 'Odometer' },
  notes: { type: 'string', max: 5000, label: 'Notes' }
};

// Mechanics can view vehicles, but only admins can create/update them
router.route('/')
  .get(getVehicles)
  .post(authorize('admin'), validate(vehicleSchema), createVehicle);

router.route('/:id')
  .get(getVehicleById)
  .put(authorize('admin'), validate(vehicleSchema), updateVehicle);

// Service history (odometer tracking) for a vehicle
router.get('/:id/services', async (req, res, next) => {
  try {
    // Vehicle must belong to this garage
    const [veh] = await pool.query('SELECT id FROM vehicles WHERE id = ? AND garage_id = ?', [req.params.id, req.user.garage_id]);
    if (veh.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found' });
    }
    const [services] = await pool.query(
      `SELECT s.*, j.title AS job_title
       FROM service_records s
       LEFT JOIN repair_jobs j ON s.repair_job_id = j.id
       WHERE s.vehicle_id = ?
       ORDER BY s.service_date DESC, s.id DESC`,
      [req.params.id]
    );
    res.json({ status: 'success', data: services });
  } catch (error) {
    next(error);
  }
});

export default router;

