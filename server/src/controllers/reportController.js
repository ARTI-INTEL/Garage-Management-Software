import pool from '../config/db.js';

// @desc    Reports: monthly revenue, mechanic performance, top customers, VAT
// @route   GET /api/reports
// @access  Private (Admin)
export const getReports = async (req, res, next) => {
  try {
    const garageId = req.user.garage_id;

    // Revenue by month (last 12 months)
    const [revenueByMonth] = await pool.query(
      `SELECT DATE_FORMAT(p.payment_date, '%Y-%m') AS month, SUM(p.amount) AS total
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         AND i.garage_id = ?
       GROUP BY month ORDER BY month ASC`,
      [garageId]
    );

    // Mechanic performance: jobs completed + avg turnaround (hours created -> completed)
    const [mechanicPerformance] = await pool.query(
      `SELECT u.username, m.full_name,
              COUNT(j.id) AS jobs_completed,
              ROUND(AVG(TIMESTAMPDIFF(HOUR, j.created_at, j.completed_at)), 1) AS avg_hours
       FROM repair_jobs j
       JOIN users u ON j.mechanic_id = u.id
       LEFT JOIN mechanic_profiles m ON u.id = m.user_id
       WHERE j.completed_at IS NOT NULL AND j.garage_id = ?
       GROUP BY u.id, u.username, m.full_name
       ORDER BY jobs_completed DESC`,
      [garageId]
    );

    // Top customers by invoiced total
    const [topCustomers] = await pool.query(
      `SELECT c.id, c.full_name, COUNT(i.id) AS invoices, SUM(i.grand_total) AS total_billed
       FROM customers c
       JOIN invoices i ON c.id = i.customer_id
       WHERE c.garage_id = ?
       GROUP BY c.id, c.full_name
       ORDER BY total_billed DESC
       LIMIT 10`,
      [garageId]
    );

    // VAT summary: tax collected on all invoices + this month
    const [vatRows] = await pool.query(
      `SELECT COALESCE(SUM(tax), 0) AS total_tax,
              COALESCE(SUM(CASE WHEN invoice_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN tax END), 0) AS tax_this_month,
              COALESCE(SUM(subtotal), 0) AS total_subtotal,
              COUNT(*) AS invoice_count
       FROM invoices
       WHERE garage_id = ?`,
      [garageId]
    );

    // Payment method breakdown
    const [paymentMethods] = await pool.query(
      `SELECT p.payment_method, COUNT(*) AS count, SUM(p.amount) AS total
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE i.garage_id = ?
       GROUP BY p.payment_method
       ORDER BY total DESC`,
      [garageId]
    );

    res.json({
      status: 'success',
      data: {
        revenueByMonth,
        mechanicPerformance,
        topCustomers,
        vat: vatRows[0],
        paymentMethods
      }
    });
  } catch (error) {
    next(error);
  }
};
