import pool from '../config/db.js';

// @desc    Dashboard statistics (scoped to the user's garage)
// @route   GET /api/dashboard/stats
// @access  Private
export const getStats = async (req, res, next) => {
  try {
    const garageId = req.user.garage_id;

    const [[{ totalVehicles }]] = await pool.query('SELECT COUNT(*) AS totalVehicles FROM vehicles WHERE garage_id = ?', [garageId]);
    const [[{ totalCustomers }]] = await pool.query('SELECT COUNT(*) AS totalCustomers FROM customers WHERE garage_id = ?', [garageId]);
    const [[{ jobsInProgress }]] = await pool.query(
      "SELECT COUNT(*) AS jobsInProgress FROM repair_jobs WHERE status IN ('In Progress', 'Awaiting Repair', 'Diagnosed', 'Awaiting Approval') AND garage_id = ?",
      [garageId]
    );
    const [[{ readyForCollection }]] = await pool.query(
      "SELECT COUNT(*) AS readyForCollection FROM repair_jobs WHERE status = 'Fixed' AND garage_id = ?",
      [garageId]
    );
    const [[{ awaitingDiagnosis }]] = await pool.query(
      "SELECT COUNT(*) AS awaitingDiagnosis FROM repair_jobs WHERE status = 'Awaiting Diagnosis' AND garage_id = ?",
      [garageId]
    );

    // Invoice figures
    const [[{ unpaidInvoices, unpaidTotal }]] = await pool.query(
      "SELECT COUNT(*) AS unpaidInvoices, COALESCE(SUM(grand_total), 0) AS unpaidTotal FROM invoices WHERE payment_status IN ('Unpaid', 'Partially Paid') AND garage_id = ?",
      [garageId]
    );
    const [[{ paidTotalThisMonth }]] = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS paidTotalThisMonth
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE MONTH(p.payment_date) = MONTH(CURDATE()) AND YEAR(p.payment_date) = YEAR(CURDATE())
         AND i.garage_id = ?`,
      [garageId]
    );
    const [[{ totalRevenue }]] = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS totalRevenue
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE i.garage_id = ?`,
      [garageId]
    );

    // Job status breakdown (for chart)
    const [statusBreakdown] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM repair_jobs WHERE garage_id = ? GROUP BY status',
      [garageId]
    );

    // Revenue for last 6 months (for chart)
    const [monthlyRevenue] = await pool.query(
      `SELECT DATE_FORMAT(p.payment_date, '%Y-%m') AS month, SUM(p.amount) AS total
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       WHERE p.payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         AND i.garage_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [garageId]
    );

    res.json({
      status: 'success',
      data: {
        totalVehicles,
        totalCustomers,
        jobsInProgress,
        readyForCollection,
        awaitingDiagnosis,
        unpaidInvoices,
        unpaidTotal: parseFloat(unpaidTotal),
        paidTotalThisMonth: parseFloat(paidTotalThisMonth),
        totalRevenue: parseFloat(totalRevenue),
        statusBreakdown,
        monthlyRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};
