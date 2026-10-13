import pool from '../config/db.js';

// @desc    Get all jobs for a vehicle
// @route   GET /api/jobs/vehicle/:vehicleId
// @access  Private
export const getJobsByVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const [jobs] = await pool.query(
      `SELECT j.*, u.username as mechanic_username 
       FROM repair_jobs j 
       JOIN vehicles v ON j.vehicle_id = v.id
       LEFT JOIN users u ON j.mechanic_id = u.id 
       WHERE j.vehicle_id = ? AND v.garage_id = ? ORDER BY j.created_at DESC`,
      [vehicleId, req.user.garage_id]
    );

    // Fetch parts for each job
    for (let job of jobs) {
      const [parts] = await pool.query('SELECT * FROM repair_parts WHERE repair_job_id = ?', [job.id]);
      job.parts = parts;
    }

    res.json({ status: 'success', data: jobs });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new repair job
// @route   POST /api/jobs
// @access  Private (Admin)
export const createJob = async (req, res, next) => {
  try {
    const { vehicle_id, title, description, diagnosis_notes, labour_cost, mechanic_id, priority, status } = req.body;

    if (!vehicle_id || !title) {
      return res.status(400).json({ status: 'error', message: 'Vehicle and Title are required' });
    }

    // Vehicle must belong to this garage
    const [veh] = await pool.query('SELECT id FROM vehicles WHERE id = ? AND garage_id = ?', [vehicle_id, req.user.garage_id]);
    if (veh.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Vehicle not found' });
    }
    // Mechanic (if assigned) must work in this garage
    if (mechanic_id) {
      const [mech] = await pool.query('SELECT id FROM users WHERE id = ? AND garage_id = ? AND role = ?', [mechanic_id, req.user.garage_id, 'mechanic']);
      if (mech.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Mechanic not found' });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO repair_jobs (garage_id, vehicle_id, title, description, diagnosis_notes, labour_cost, mechanic_id, priority, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.garage_id, vehicle_id, title, description, diagnosis_notes, labour_cost || 0, mechanic_id || null, priority || 'medium', status || 'Awaiting Diagnosis']
    );

    res.status(201).json({ status: 'success', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a repair job
// @route   PUT /api/jobs/:id
// @access  Private (Admin / Mechanic can only update status)
export const updateJob = async (req, res, next) => {
  try {
    const jobId = req.params.id;
    const { title, description, diagnosis_notes, labour_cost, mechanic_id, priority, status } = req.body;

    // Check permissions
    const [existing] = await pool.query('SELECT mechanic_id, status FROM repair_jobs WHERE id = ? AND garage_id = ?', [jobId, req.user.garage_id]);
    if (existing.length === 0) return res.status(404).json({ status: 'error', message: 'Job not found' });

    if (req.user.role === 'mechanic') {
      // Mechanic can only update their own job status
      if (existing[0].mechanic_id !== req.user.id) {
        return res.status(403).json({ status: 'error', message: 'Not authorized to update this job' });
      }
      if (!status) {
        return res.status(400).json({ status: 'error', message: 'Status is required' });
      }
      const completionDate = (status === 'Fixed' || status === 'Unable to Fix') ? new Date() : null;
      await pool.query(
        'UPDATE repair_jobs SET status = ?, completed_at = ? WHERE id = ?',
        [status, completionDate, jobId]
      );
      await recordStatusHistory(jobId, existing[0].status, status, req.user.id);
      await maybeLogService(jobId, status);
    } else {
      // Admin update — only write fields actually present in the request so a
      // status-only PATCH doesn't null out title/description/etc.
      const sets = [];
      const params = [];
      const updatable = { title, description, diagnosis_notes, labour_cost, priority, status };
      for (const [field, value] of Object.entries(updatable)) {
        if (value !== undefined) {
          sets.push(`${field} = ?`);
          params.push(value);
        }
      }
      // mechanic_id: present in body (even empty string) means "set/clear";
      // absent means "leave unchanged".
      if (mechanic_id !== undefined) {
        sets.push('mechanic_id = ?');
        params.push(mechanic_id || null);
      }
      if (sets.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      // Maintain completed_at whenever the effective status changes
      const newStatus = status !== undefined ? status : existing[0].status;
      const completionDate = (newStatus === 'Fixed' || newStatus === 'Unable to Fix') ? new Date() : null;
      sets.push('completed_at = ?');
      params.push(completionDate);

      params.push(jobId);
      await pool.query(`UPDATE repair_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
      if (status !== undefined && status !== existing[0].status) {
        await recordStatusHistory(jobId, existing[0].status, status, req.user.id);
        await maybeLogService(jobId, status);
      }
    }

    res.json({ status: 'success', message: 'Job updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Add part to a job
// @route   POST /api/jobs/:id/parts
// @access  Private (Admin)
export const addPartToJob = async (req, res, next) => {
  try {
    const { part_name, part_number, quantity, unit_price, notes, catalog_part_id } = req.body;
    const jobId = req.params.id;

    if (!part_name) return res.status(400).json({ status: 'error', message: 'Part name is required' });

    // Job must belong to this garage
    const [job] = await pool.query('SELECT id FROM repair_jobs WHERE id = ? AND garage_id = ?', [jobId, req.user.garage_id]);
    if (job.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Job not found' });
    }
    // Catalog part (if used) must belong to this garage
    if (catalog_part_id) {
      const [cat] = await pool.query('SELECT id FROM parts_catalog WHERE id = ? AND garage_id = ?', [catalog_part_id, req.user.garage_id]);
      if (cat.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Catalog part not found' });
      }
    }

    await pool.query(
      `INSERT INTO repair_parts (repair_job_id, part_name, part_number, quantity, unit_price, notes, catalog_part_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jobId, part_name, part_number || null, quantity || 1, unit_price || 0, notes || null, catalog_part_id || null]
    );

    // Deduct from inventory when the part came from the catalog
    if (catalog_part_id) {
      await pool.query(
        'UPDATE parts_catalog SET qty_in_stock = qty_in_stock - ? WHERE id = ?',
        [quantity || 1, catalog_part_id]
      );
    }

    res.status(201).json({ status: 'success', message: 'Part added successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove part from a job
// @route   DELETE /api/jobs/:id/parts/:partId
// @access  Private (Admin)
export const removePart = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT rp.id, rp.quantity, rp.catalog_part_id
       FROM repair_parts rp
       JOIN repair_jobs j ON rp.repair_job_id = j.id
       WHERE rp.id = ? AND rp.repair_job_id = ? AND j.garage_id = ?`,
      [req.params.partId, req.params.id, req.user.garage_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Part not found' });
    }
    await pool.query('DELETE FROM repair_parts WHERE id = ?', [req.params.partId]);

    // Return stock to inventory if it came from the catalog
    if (rows[0].catalog_part_id) {
      await pool.query(
        'UPDATE parts_catalog SET qty_in_stock = qty_in_stock + ? WHERE id = ?',
        [rows[0].quantity, rows[0].catalog_part_id]
      );
    }

    res.json({ status: 'success', message: 'Part removed' });
  } catch (error) {
    next(error);
  }
};

// Helper: append a row to the status audit trail
const recordStatusHistory = async (jobId, fromStatus, toStatus, userId) => {
  if (!toStatus || fromStatus === toStatus) return;
  await pool.query(
    'INSERT INTO job_status_history (job_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)',
    [jobId, fromStatus, toStatus, userId]
  );
};

// Helper: when a job is fixed, log a service record using the vehicle's odometer
const maybeLogService = async (jobId, status) => {
  if (status !== 'Fixed') return;
  const [jobs] = await pool.query('SELECT vehicle_id, title FROM repair_jobs WHERE id = ?', [jobId]);
  if (jobs.length === 0) return;
  const [vehicles] = await pool.query('SELECT odometer FROM vehicles WHERE id = ?', [jobs[0].vehicle_id]);
  await pool.query(
    'INSERT INTO service_records (vehicle_id, repair_job_id, service_date, odometer, description) VALUES (?, ?, CURDATE(), ?, ?)',
    [jobs[0].vehicle_id, jobId, vehicles[0]?.odometer || null, jobs[0].title]
  );
};

// @desc    Status history for a job
// @route   GET /api/jobs/:id/history
// @access  Private
export const getJobHistory = async (req, res, next) => {
  try {
    const [history] = await pool.query(
      `SELECT h.*, u.username AS changed_by_name
       FROM job_status_history h
       JOIN repair_jobs j ON h.job_id = j.id
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.job_id = ? AND j.garage_id = ?
       ORDER BY h.changed_at DESC`,
      [req.params.id, req.user.garage_id]
    );
    res.json({ status: 'success', data: history });
  } catch (error) {
    next(error);
  }
};

// @desc    WhatsApp link: job complete, notify the customer
// @route   GET /api/jobs/:id/notify-whatsapp
// @access  Private (Admin or assigned mechanic)
export const getJobNotifyWhatsApp = async (req, res, next) => {
  try {
    const [jobs] = await pool.query(
      `SELECT j.*, v.registration_number, v.make, v.model, c.full_name AS customer_name, c.whatsapp_number, c.mobile_number
       FROM repair_jobs j
       JOIN vehicles v ON j.vehicle_id = v.id
       JOIN customers c ON v.customer_id = c.id
       WHERE j.id = ? AND v.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );
    if (jobs.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Job not found' });
    }
    const job = jobs[0];
    if (job.status !== 'Fixed' && job.status !== 'Unable to Fix') {
      return res.status(400).json({ status: 'error', message: 'Job must be Fixed or Unable to Fix before notifying' });
    }
    const phone = job.whatsapp_number || job.mobile_number;
    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Customer does not have a WhatsApp or mobile number' });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const message = job.status === 'Fixed'
      ? `Hello ${job.customer_name},\n\nGood news! The repair on *${job.registration_number}* (${job.make} ${job.model}) — *${job.title}* — has been completed.\n\nYour vehicle is ready for collection. Please contact us at your convenience.\n\nThank you.`
      : `Hello ${job.customer_name},\n\nWe have an update regarding *${job.registration_number}* (${job.make} ${job.model}) — *${job.title}*.\n\nUnfortunately we were unable to complete this repair. Please contact us to discuss the options.\n\nThank you.`;

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    res.json({ status: 'success', data: { whatsapp_url: whatsappUrl, message } });
  } catch (error) {
    next(error);
  }
};

// @desc    Get jobs assigned to current mechanic
// @route   GET /api/jobs/my-jobs
// @access  Private (Mechanic)
export const getMyJobs = async (req, res, next) => {
  try {
    const [jobs] = await pool.query(
      `SELECT j.*, v.registration_number, v.make, v.model
       FROM repair_jobs j
       JOIN vehicles v ON j.vehicle_id = v.id
       WHERE j.mechanic_id = ? AND j.garage_id = ?
       ORDER BY j.created_at DESC`,
      [req.user.id, req.user.garage_id]
    );
    res.json({ status: 'success', data: jobs });
  } catch (error) {
    next(error);
  }
};

