import express from 'express';
import { generateQuote, getQuotes, getQuoteById, updateQuoteStatus, getQuoteWhatsApp } from '../controllers/quoteController.js';
import { getQuotePDF } from '../controllers/quotePdfController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin'), getQuotes);
router.post('/generate', authorize('admin'), validate({
  repair_job_id: { required: true, type: 'integer', label: 'Repair job' },
  discount: { type: 'number', min: 0, label: 'Discount' },
  tax_rate: { type: 'number', min: 0, max: 100, label: 'Tax rate' },
  notes: { type: 'string', max: 2000, label: 'Notes' }
}), generateQuote);

router.get('/:id', getQuoteById);
router.get('/:id/pdf', getQuotePDF);
router.get('/:id/whatsapp', authorize('admin'), getQuoteWhatsApp);
router.put('/:id/status', authorize('admin'), validate({
  status: { required: true, type: 'enum', enum: ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'], label: 'Status' }
}), updateQuoteStatus);

export default router;
