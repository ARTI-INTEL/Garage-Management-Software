import express from 'express';
import jwt from 'jsonwebtoken';
import { getInvoices, getInvoiceById, getInvoicesByVehicle, generateInvoice, recordPayment } from '../controllers/invoiceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config/env.js';
import pool from '../config/db.js';
import { generateInvoicePDF } from '../services/pdfService.js';
import { generateReceiptPDF } from '../services/pdfService.js';

const router = express.Router();

// Signed, no-login PDF share link (token expires after 30 days).
// Registered before `protect` so customers can open it from WhatsApp.
const signInvoiceShareToken = (invoiceId) =>
  jwt.sign({ invoice_id: invoiceId, type: 'invoice-share' }, config.jwt.secret, { expiresIn: '30d' });

router.get('/shared/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, config.jwt.secret);
    } catch {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired invoice link' });
    }
    if (payload.type !== 'invoice-share') {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired invoice link' });
    }

    const [invoices] = await pool.query(
      `SELECT i.*, v.registration_number, v.make, v.model, v.year, v.colour,
              c.full_name as customer_name, c.mobile_number, c.whatsapp_number, c.email as customer_email, c.address as customer_address
       FROM invoices i
       JOIN vehicles v ON i.vehicle_id = v.id
       JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ?`,
      [payload.invoice_id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const invoice = invoices[0];
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
    invoice.items = items;

    // Settings belong to the garage that owns the invoice (share links carry
    // no user token, so scope from the invoice row, not req.user)
    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [invoice.garage_id]);
    invoice.settings = settingsRows[0] || null;

    const pdfBuffer = await generateInvoicePDF(invoice);

    // `inline` so the customer's phone opens the PDF in the WhatsApp browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

router.use(protect);

router.get('/', authorize('admin'), getInvoices);
router.post('/generate', authorize('admin'), validate({
  vehicle_id: { required: true, type: 'integer', label: 'Vehicle' },
  discount: { type: 'number', min: 0, label: 'Discount' },
  tax_rate: { type: 'number', min: 0, max: 100, label: 'Tax rate' },
  notes: { type: 'string', max: 2000, label: 'Notes' }
}), generateInvoice);

router.get('/vehicle/:vehicleId', getInvoicesByVehicle);
router.get('/:id', getInvoiceById);

router.post('/:id/payments', authorize('admin'), validate({
  amount: { required: true, type: 'number', min: 0.01, label: 'Amount' },
  payment_method: { type: 'string', max: 30, label: 'Payment method' }
}), recordPayment);

// PDF download endpoint
router.get('/:id/pdf', async (req, res, next) => {
  try {
    // Get full invoice data
    const [invoices] = await pool.query(
      `SELECT i.*, v.registration_number, v.make, v.model, v.year, v.colour,
              c.full_name as customer_name, c.mobile_number, c.whatsapp_number, c.email as customer_email, c.address as customer_address
       FROM invoices i
       JOIN vehicles v ON i.vehicle_id = v.id
       JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ? AND i.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const invoice = invoices[0];
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
    invoice.items = items;

    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [invoice.garage_id]);
    invoice.settings = settingsRows[0] || null;

    const pdfBuffer = await generateInvoicePDF(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Payment receipt PDF download
router.get('/:id/payments/:paymentId/receipt', authorize('admin'), async (req, res, next) => {
  try {
    const [payments] = await pool.query('SELECT * FROM payments WHERE id = ? AND invoice_id = ?', [req.params.paymentId, req.params.id]);
    if (payments.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }
    const [invoices] = await pool.query(
      `SELECT i.*, v.registration_number, c.full_name AS customer_name
       FROM invoices i
       JOIN vehicles v ON i.vehicle_id = v.id
       JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ? AND i.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );
    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }
    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [invoices[0].garage_id]);
    const [paidRows] = await pool.query('SELECT SUM(amount) AS paid FROM payments WHERE invoice_id = ?', [req.params.id]);

    const pdfBuffer = await generateReceiptPDF({
      payment: payments[0],
      invoice: invoices[0],
      settings: settingsRows[0] || null,
      totalPaid: parseFloat(paidRows[0].paid) || 0
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payments[0].id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// WhatsApp share endpoint — returns click-to-chat URL
router.get('/:id/whatsapp', authorize('admin'), async (req, res, next) => {
  try {
    const [invoices] = await pool.query(
      `SELECT i.*, v.registration_number, c.full_name as customer_name, c.whatsapp_number, c.mobile_number
       FROM invoices i
       JOIN vehicles v ON i.vehicle_id = v.id
       JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ? AND i.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const invoice = invoices[0];
    const phone = invoice.whatsapp_number || invoice.mobile_number;

    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Customer does not have a WhatsApp or mobile number' });
    }

    // Strip non-numeric chars for WhatsApp URL
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // Use garage settings: custom template + currency
    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [invoice.garage_id]);
    const settings = settingsRows[0] || {};
    const currency = settings.currency || 'AED';
    const total = parseFloat(invoice.grand_total).toFixed(2);

    const defaultTemplate = `Hello {name},\n\nThank you for choosing our garage.\n\nYour invoice *{invoice_number}* for vehicle *{vehicle}* has been prepared.\n\nTotal Amount: *{currency} {total}*\nPayment Status: *{status}*\n\nPlease contact us if you have any questions.\n\nThank you.`;
    const template = settings.whatsapp_template && settings.whatsapp_template.trim()
      ? settings.whatsapp_template
      : defaultTemplate;

    // No-login PDF link so the customer receives the invoice file as well
    const shareUrl = `${config.publicUrl}/api/invoices/shared/${signInvoiceShareToken(invoice.id)}`;

    let message = template
      .replaceAll('{name}', invoice.customer_name)
      .replaceAll('{invoice_number}', invoice.invoice_number)
      .replaceAll('{vehicle}', invoice.registration_number)
      .replaceAll('{total}', total)
      .replaceAll('{currency}', currency)
      .replaceAll('{status}', invoice.payment_status)
      .replaceAll('{pdf_link}', shareUrl);

    // Default placement when the template doesn't specify one
    if (!template.includes('{pdf_link}')) {
      message += `\n\nView or download the invoice PDF:\n${shareUrl}`;
    }

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    res.json({
      status: 'success',
      data: {
        whatsapp_url: whatsappUrl,
        phone: cleanPhone,
        message,
        pdf_url: shareUrl,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

