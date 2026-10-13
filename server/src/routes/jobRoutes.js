import express from 'express';
import { getJobsByVehicle, createJob, updateJob, addPartToJob, removePart, getMyJobs, getJobHistory, getJobNotifyWhatsApp } from '../controllers/jobController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

// Keep in sync with the repair_jobs.status enum in migrations/schema.sql
const JOB_STATUSES = ['Awaiting Diagnosis', 'Diagnosed', 'Awaiting Approval', 'Awaiting Repair', 'In Progress', 'Fixed', 'Unable to Fix'];

const jobSchema = {
  vehicle_id: { required: true, type: 'integer', label: 'Vehicle' },
  title: { required: true, type: 'string', max: 100, label: 'Title' },
  description: { type: 'string', max: 5000, label: 'Description' },
  diagnosis_notes: { type: 'string', max: 5000, label: 'Diagnosis notes' },
  labour_cost: { type: 'number', min: 0, label: 'Labour cost' },
  mechanic_id: { type: 'integer', label: 'Mechanic' },
  priority: { type: 'enum', enum: ['low', 'medium', 'high'], label: 'Priority' },
  status: { type: 'enum', enum: JOB_STATUSES, label: 'Status' }
};

// Admin partial update (status-only PATCHes are valid) and mechanic status
// updates share one schema; every field above is optional for PUT.
const jobUpdateSchema = Object.fromEntries(
  Object.entries(jobSchema).map(([key, rule]) => [key, { ...rule, required: false }])
);

const jobPartSchema = {
  part_name: { required: true, type: 'string', max: 100, label: 'Part name' },
  part_number: { type: 'string', max: 50, label: 'Part number' },
  quantity: { required: true, type: 'integer', min: 1, label: 'Quantity' },
  unit_price: { required: true, type: 'number', min: 0, label: 'Unit price' },
  notes: { type: 'string', max: 500, label: 'Notes' },
  catalog_part_id: { type: 'integer', label: 'Catalog part' }
};

router.get('/my-jobs', authorize('mechanic'), getMyJobs);
router.get('/vehicle/:vehicleId', getJobsByVehicle);
router.get('/:id/history', getJobHistory);
router.get('/:id/notify-whatsapp', getJobNotifyWhatsApp);

router.post('/', authorize('admin'), validate(jobSchema), createJob);
router.put('/:id', validate(jobUpdateSchema), updateJob); // Admin or assigned mechanic

router.post('/:id/parts', authorize('admin'), validate(jobPartSchema), addPartToJob);
router.delete('/:id/parts/:partId', authorize('admin'), removePart);

export default router;

