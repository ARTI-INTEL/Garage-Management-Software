import PDFDocument from 'pdfkit';

// Shared helper: draw a garage header + invoice/quote meta block
const drawHeader = (doc, settings, title) => {
  const garageName = settings?.garage_name || 'Garage Management System';
  const garageAddress = settings?.address || '';
  const garagePhone = settings?.phone || '';

  doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(garageName, { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#555');
  if (garageAddress) doc.text(garageAddress, { align: 'center' });
  if (garagePhone) doc.text(garagePhone, { align: 'center' });
  doc.moveDown(1.2);
};

/**
 * Generate an invoice PDF and return it as a Buffer.
 * @param {Object} invoice - Full invoice object with items, customer, vehicle data
 * @returns {Promise<Buffer>}
 */
export const generateInvoicePDF = (invoice) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins
    const settings = invoice.settings || {};
    const currency = settings.currency || 'AED';

    // ===== HEADER =====
    drawHeader(doc, settings, 'INVOICE');

    // ===== INVOICE META (left) + CUSTOMER (right) =====
    const metaTop = doc.y;

    // Left column - Invoice details
    doc.fontSize(9).fillColor('#888').text('INVOICE NUMBER', 50, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(invoice.invoice_number, 50, metaTop + 13);
    
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('DATE', 50, metaTop + 35);
    doc.fontSize(10).fillColor('#000').text(new Date(invoice.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 50, metaTop + 48);

    doc.fontSize(9).fillColor('#888').text('STATUS', 50, metaTop + 70);
    doc.fontSize(10).fillColor(invoice.payment_status === 'Paid' ? '#16a34a' : '#dc2626')
      .font('Helvetica-Bold').text(invoice.payment_status, 50, metaTop + 83);

    // Right column - Customer
    const rightCol = 320;
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('BILL TO', rightCol, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(invoice.customer_name, rightCol, metaTop + 13);
    doc.fontSize(10).fillColor('#333').font('Helvetica')
      .text(invoice.mobile_number || '', rightCol, metaTop + 28);
    if (invoice.customer_email) {
      doc.text(invoice.customer_email, rightCol, metaTop + 41);
    }

    // Vehicle
    doc.fontSize(9).fillColor('#888').text('VEHICLE', rightCol, metaTop + 62);
    doc.fontSize(10).fillColor('#000').font('Helvetica-Bold')
      .text(`${invoice.registration_number}  —  ${invoice.make} ${invoice.model}`, rightCol, metaTop + 75);

    doc.y = metaTop + 110;

    // ===== LINE =====
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(1);

    // ===== ITEMS TABLE =====
    const tableTop = doc.y;
    const col1 = 50, col2 = 300, col3 = 380, col4 = 450;

    // Header
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555');
    doc.text('DESCRIPTION', col1, tableTop);
    doc.text('QTY', col2, tableTop, { width: 60, align: 'center' });
    doc.text('PRICE', col3, tableTop, { width: 60, align: 'right' });
    doc.text('TOTAL', col4, tableTop, { width: 95, align: 'right' });

    doc.moveTo(col1, tableTop + 15).lineTo(col4 + 95, tableTop + 15).strokeColor('#eee').stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fillColor('#000').fontSize(10);

    if (invoice.items && invoice.items.length > 0) {
      for (const item of invoice.items) {
        // Check if we need a new page
        if (y > doc.page.height - 150) {
          doc.addPage();
          y = 50;
        }
        
        const typeLabel = item.item_type === 'labour' ? '[Labour]' : '[Part]';
        doc.fontSize(10).fillColor('#000').text(`${typeLabel} ${item.description}`, col1, y, { width: 240 });
        doc.text(String(item.quantity), col2, y, { width: 60, align: 'center' });
        doc.text(`${currency} ${parseFloat(item.unit_price).toFixed(2)}`, col3, y, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').text(`${currency} ${parseFloat(item.total).toFixed(2)}`, col4, y, { width: 95, align: 'right' });
        doc.font('Helvetica');
        y += 22;
      }
    }

    // ===== TOTALS =====
    y += 10;
    doc.moveTo(col3 - 20, y).lineTo(col4 + 95, y).strokeColor('#ddd').stroke();
    y += 12;

    const drawTotalRow = (label, value, bold = false) => {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#333');
      doc.text(label, col3 - 20, y, { width: 80, align: 'right' });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#000' : '#333');
      doc.text(`${currency} ${parseFloat(value).toFixed(2)}`, col4, y, { width: 95, align: 'right' });
      y += 18;
    };

    drawTotalRow('Subtotal', invoice.subtotal);
    if (parseFloat(invoice.discount) > 0) {
      drawTotalRow('Discount', `-${invoice.discount}`);
    }
    if (parseFloat(invoice.tax) > 0) {
      drawTotalRow('Tax/VAT', invoice.tax);
    }

    y += 2;
    doc.moveTo(col3 - 20, y).lineTo(col4 + 95, y).strokeColor('#000').lineWidth(1.5).stroke();
    y += 8;
    doc.lineWidth(1);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000');
    doc.text('GRAND TOTAL', col3 - 40, y, { width: 100, align: 'right' });
    doc.text(`${currency} ${parseFloat(invoice.grand_total).toFixed(2)}`, col4, y, { width: 95, align: 'right' });

    // ===== FOOTER =====
    y += 50;
    if (y < doc.page.height - 100) {
      doc.fontSize(8).font('Helvetica').fillColor('#999')
        .text('Thank you for your business.', 50, y, { align: 'center', width: pageWidth });
      doc.text('This is a computer-generated invoice.', 50, y + 14, { align: 'center', width: pageWidth });
    }

    doc.end();
  });
};

/**
 * Generate a quotation PDF and return it as a Buffer.
 * @param {Object} quote - quotation + items + customer/vehicle/job data + settings
 * @returns {Promise<Buffer>}
 */
export const generateQuotePDF = (quote) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const settings = quote.settings || {};
    const currency = settings.currency || 'AED';

    drawHeader(doc, settings, 'QUOTATION');

    const metaTop = doc.y;
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('QUOTE NUMBER', 50, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(quote.quote_number, 50, metaTop + 13);
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('DATE', 50, metaTop + 35);
    doc.fontSize(10).fillColor('#000').text(new Date(quote.quote_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 50, metaTop + 48);
    doc.fontSize(9).fillColor('#888').text('STATUS', 50, metaTop + 70);
    const statusColor = quote.status === 'Approved' ? '#16a34a' : quote.status === 'Rejected' ? '#dc2626' : '#2563eb';
    doc.fontSize(10).fillColor(statusColor).font('Helvetica-Bold').text(quote.status, 50, metaTop + 83);

    const rightCol = 320;
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('FOR', rightCol, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(quote.customer_name, rightCol, metaTop + 13);
    doc.fontSize(10).fillColor('#333').font('Helvetica').text(quote.mobile_number || '', rightCol, metaTop + 28);
    doc.fontSize(9).fillColor('#888').text('VEHICLE', rightCol, metaTop + 52);
    doc.fontSize(10).fillColor('#000').font('Helvetica-Bold')
      .text(`${quote.registration_number}  —  ${quote.make} ${quote.model}`, rightCol, metaTop + 65);
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('WORK', rightCol, metaTop + 88);
    doc.fontSize(10).fillColor('#000').font('Helvetica').text(quote.job_title, rightCol, metaTop + 101, { width: 220 });

    doc.y = metaTop + 135;
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(1);

    // Items table (same layout as invoice)
    const tableTop = doc.y;
    const col1 = 50, col2 = 300, col3 = 380, col4 = 450;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555');
    doc.text('DESCRIPTION', col1, tableTop);
    doc.text('QTY', col2, tableTop, { width: 60, align: 'center' });
    doc.text('PRICE', col3, tableTop, { width: 60, align: 'right' });
    doc.text('TOTAL', col4, tableTop, { width: 95, align: 'right' });
    doc.moveTo(col1, tableTop + 15).lineTo(col4 + 95, tableTop + 15).strokeColor('#eee').stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fillColor('#000').fontSize(10);
    for (const item of quote.items || []) {
      if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
      const typeLabel = item.item_type === 'labour' ? '[Labour]' : '[Part]';
      doc.fontSize(10).fillColor('#000').text(`${typeLabel} ${item.description}`, col1, y, { width: 240 });
      doc.text(String(item.quantity), col2, y, { width: 60, align: 'center' });
      doc.text(`${currency} ${parseFloat(item.unit_price).toFixed(2)}`, col3, y, { width: 60, align: 'right' });
      doc.font('Helvetica-Bold').text(`${currency} ${parseFloat(item.total).toFixed(2)}`, col4, y, { width: 95, align: 'right' });
      doc.font('Helvetica');
      y += 22;
    }

    y += 10;
    doc.moveTo(col3 - 20, y).lineTo(col4 + 95, y).strokeColor('#ddd').stroke();
    y += 12;
    const drawRow = (label, value, bold = false) => {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#333');
      doc.text(label, col3 - 20, y, { width: 80, align: 'right' });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#000' : '#333');
      doc.text(`${currency} ${parseFloat(value).toFixed(2)}`, col4, y, { width: 95, align: 'right' });
      y += 18;
    };
    drawRow('Subtotal', quote.subtotal);
    if (parseFloat(quote.discount) > 0) drawRow('Discount', `-${quote.discount}`);
    if (parseFloat(quote.tax) > 0) drawRow('Tax/VAT', quote.tax);
    y += 2;
    doc.moveTo(col3 - 20, y).lineTo(col4 + 95, y).strokeColor('#000').lineWidth(1.5).stroke();
    y += 8;
    doc.lineWidth(1);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000');
    doc.text('TOTAL', col3 - 40, y, { width: 100, align: 'right' });
    doc.text(`${currency} ${parseFloat(quote.grand_total).toFixed(2)}`, col4, y, { width: 95, align: 'right' });

    y += 45;
    doc.fontSize(9).font('Helvetica').fillColor('#666')
      .text('This quotation is valid for 14 days. Repair work will begin after your approval.', 50, y, { align: 'center', width: pageWidth });

    doc.end();
  });
};

/**
 * Generate a payment receipt PDF and return it as a Buffer.
 * @param {{ payment, invoice, settings, totalPaid }} data
 * @returns {Promise<Buffer>}
 */
export const generateReceiptPDF = ({ payment, invoice, settings, totalPaid }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const currency = settings?.currency || 'AED';

    drawHeader(doc, settings, 'PAYMENT RECEIPT');

    const metaTop = doc.y;
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('RECEIPT #', 50, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(`RCPT-${String(payment.id).padStart(5, '0')}`, 50, metaTop + 13);
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('DATE', 50, metaTop + 35);
    doc.fontSize(10).fillColor('#000').text(new Date(payment.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 50, metaTop + 48);

    const rightCol = 320;
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('RECEIVED FROM', rightCol, metaTop);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(invoice.customer_name, rightCol, metaTop + 13);
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('FOR INVOICE', rightCol, metaTop + 40);
    doc.fontSize(10).fillColor('#000').font('Helvetica-Bold').text(invoice.invoice_number, rightCol, metaTop + 53);
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('VEHICLE', rightCol, metaTop + 75);
    doc.fontSize(10).fillColor('#000').font('Helvetica').text(`${invoice.registration_number} — ${invoice.make} ${invoice.model}`, rightCol, metaTop + 88);

    doc.y = metaTop + 125;
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(1.5);

    // Amount box
    const boxY = doc.y;
    doc.rect(50, boxY, pageWidth, 70).fill('#f8fafc');
    doc.fillColor('#000').fontSize(10).font('Helvetica').text('AMOUNT RECEIVED', 70, boxY + 15);
    doc.fontSize(26).font('Helvetica-Bold').text(`${currency} ${parseFloat(payment.amount).toFixed(2)}`, 70, boxY + 32);
    doc.fontSize(10).font('Helvetica').fillColor('#555')
      .text(`Method: ${payment.payment_method || 'N/A'}`, 380, boxY + 40, { width: 150, align: 'right' });

    doc.y = boxY + 95;
    const summaryY = doc.y;
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('Invoice total', 50, summaryY, { width: 200 });
    doc.text(`${currency} ${parseFloat(invoice.grand_total).toFixed(2)}`, 300, summaryY, { width: 200, align: 'right' });
    doc.text('Total paid to date', 50, summaryY + 20, { width: 200 });
    doc.text(`${currency} ${parseFloat(totalPaid).toFixed(2)}`, 300, summaryY + 20, { width: 200, align: 'right' });
    const balance = parseFloat(invoice.grand_total) - parseFloat(totalPaid);
    doc.font('Helvetica-Bold').fillColor(balance > 0 ? '#dc2626' : '#16a34a');
    doc.text(balance > 0 ? 'Balance due' : 'Balance', 50, summaryY + 42, { width: 200 });
    doc.text(`${currency} ${balance.toFixed(2)}`, 300, summaryY + 42, { width: 200, align: 'right' });

    doc.y = summaryY + 85;
    doc.fontSize(8).font('Helvetica').fillColor('#999')
      .text('This is a computer-generated receipt.', 50, doc.y, { align: 'center', width: pageWidth });

    doc.end();
  });
};

