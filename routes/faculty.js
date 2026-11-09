// routes/faculty.js
const express = require('express');
const db      = require('../database');
const router  = express.Router();

// GET /api/faculty
router.get('/', (req, res) => {
  const { available } = req.query;
  let sql = 'SELECT * FROM faculty WHERE 1=1';
  const params = [];
  if (available !== undefined) { sql += ' AND available=?'; params.push(Number(available)); }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/faculty/stats
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(available) as available,
      COUNT(*) - SUM(available) as unavailable
    FROM faculty
  `).get();
  res.json(stats);
});

// GET /api/faculty/:id
router.get('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM faculty WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(f);
});

// POST /api/faculty
router.post('/', (req, res) => {
  const { emp_id, name, department, phone, available } = req.body;
  if (!emp_id || !name || !department)
    return res.status(400).json({ error: 'emp_id, name, department required' });
  try {
    const info = db.prepare(`
      INSERT INTO faculty (emp_id, name, department, phone, available)
      VALUES (?, ?, ?, ?, ?)
    `).run(emp_id.trim().toUpperCase(), name.trim(), department.trim(), phone || '', available ? 1 : 1);
    res.json({ id: info.lastInsertRowid, message: 'Faculty added' });
  } catch (e) {
    res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Employee ID already exists' : e.message });
  }
});

// PUT /api/faculty/:id
router.put('/:id', (req, res) => {
  const { emp_id, name, department, phone, available } = req.body;
  try {
    db.prepare(`
      UPDATE faculty SET emp_id=?, name=?, department=?, phone=?, available=? WHERE id=?
    `).run(emp_id.trim().toUpperCase(), name.trim(), department.trim(), phone || '', available ? 1 : 0, req.params.id);
    res.json({ message: 'Updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/faculty/:id/availability
router.patch('/:id/availability', (req, res) => {
  const { available } = req.body;
  db.prepare('UPDATE faculty SET available=? WHERE id=?').run(available ? 1 : 0, req.params.id);
  res.json({ message: 'Availability updated' });
});

// DELETE /api/faculty/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM faculty WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// GET /api/faculty/signin/:planId — get faculty with sign-in status
router.get('/signin/:planId', (req, res) => {
  const rows = db.prepare(`
    SELECT fa.id, fa.signed_in, f.name, f.emp_id, f.department, f.phone,
           r.room_no, b.name as block_name
    FROM faculty_assignments fa
    JOIN faculty f ON fa.faculty_id = f.id
    JOIN rooms r ON fa.room_id = r.id
    JOIN blocks b ON r.block_id = b.id
    WHERE fa.plan_id = ?
    ORDER BY f.name
  `).all(req.params.planId);
  res.json(rows);
});

// PATCH /api/faculty/signin/:assignmentId
router.patch('/signin/:assignmentId', (req, res) => {
  const { signed_in } = req.body;
  db.prepare('UPDATE faculty_assignments SET signed_in=? WHERE id=?')
    .run(signed_in ? 1 : 0, req.params.assignmentId);
  res.json({ message: 'Sign-in updated' });
});

module.exports = router;
