// routes/rooms.js
const express = require('express');
const db      = require('../database');
const router  = express.Router();

// GET /api/rooms — all rooms with block info + enabled status
router.get('/', (req, res) => {
  const rooms = db.prepare(`
    SELECT r.*, b.name AS block_name, b.enabled AS block_enabled
    FROM rooms r JOIN blocks b ON r.block_id = b.id
    ORDER BY b.name, r.room_no
  `).all();
  res.json(rooms);
});

// GET /api/rooms/:id
router.get('/:id', (req, res) => {
  const r = db.prepare(`
    SELECT r.*, b.name AS block_name FROM rooms r
    JOIN blocks b ON r.block_id = b.id WHERE r.id=?
  `).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// POST /api/rooms
router.post('/', (req, res) => {
  const { block_id, room_no, capacity, num_rows, num_cols } = req.body;
  if (!block_id || !room_no || !capacity)
    return res.status(400).json({ error: 'block_id, room_no, capacity required' });
  try {
    const info = db.prepare(`
      INSERT INTO rooms (block_id, room_no, capacity, num_rows, num_cols, enabled)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(Number(block_id), room_no.trim().toUpperCase(), Number(capacity),
           Number(num_rows)||8, Number(num_cols)||4);
    res.json({ id: info.lastInsertRowid, message: 'Room added' });
  } catch (e) {
    res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Room number already exists' : e.message });
  }
});

// PUT /api/rooms/:id
router.put('/:id', (req, res) => {
  const { block_id, room_no, capacity, num_rows, num_cols } = req.body;
  try {
    db.prepare(`
      UPDATE rooms SET block_id=?, room_no=?, capacity=?, num_rows=?, num_cols=? WHERE id=?
    `).run(Number(block_id), room_no.trim().toUpperCase(), Number(capacity),
           Number(num_rows)||8, Number(num_cols)||4, req.params.id);
    res.json({ message: 'Updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/rooms/:id/toggle — enable or disable a single room
router.patch('/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  db.prepare('UPDATE rooms SET enabled=? WHERE id=?').run(enabled ? 1 : 0, req.params.id);
  res.json({ message: `Room ${enabled ? 'enabled' : 'disabled'}` });
});

// DELETE /api/rooms/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
