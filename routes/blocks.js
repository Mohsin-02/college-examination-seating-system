// routes/blocks.js
const express = require('express');
const db      = require('../database');
const router  = express.Router();

// GET /api/blocks — all blocks with room counts and enabled status
router.get('/', (req, res) => {
  const blocks = db.prepare(`
    SELECT b.*, 
      COUNT(r.id) AS room_count,
      SUM(CASE WHEN r.enabled=1 THEN 1 ELSE 0 END) AS enabled_rooms,
      SUM(r.capacity) AS total_capacity
    FROM blocks b
    LEFT JOIN rooms r ON b.id = r.block_id
    GROUP BY b.id ORDER BY b.name
  `).all();
  res.json(blocks);
});

// GET /api/blocks/:id/rooms
router.get('/:id/rooms', (req, res) => {
  const rooms = db.prepare(`
    SELECT r.*, b.name AS block_name FROM rooms r
    JOIN blocks b ON r.block_id = b.id
    WHERE r.block_id = ? ORDER BY r.room_no
  `).all(req.params.id);
  res.json(rooms);
});

// POST /api/blocks
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Block name required' });
  try {
    const info = db.prepare('INSERT INTO blocks (name,enabled) VALUES (?,1)')
      .run(name.trim().toUpperCase());
    res.json({ id: info.lastInsertRowid, message: 'Block created' });
  } catch (e) {
    res.status(400).json({ error: 'Block name already exists' });
  }
});

// PUT /api/blocks/:id
router.put('/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE blocks SET name=? WHERE id=?')
    .run(name.trim().toUpperCase(), req.params.id);
  res.json({ message: 'Updated' });
});

// PATCH /api/blocks/:id/toggle — enable or disable entire block
router.patch('/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  db.prepare('UPDATE blocks SET enabled=? WHERE id=?')
    .run(enabled ? 1 : 0, req.params.id);
  // Optionally cascade to rooms
  if (req.body.cascade) {
    db.prepare('UPDATE rooms SET enabled=? WHERE block_id=?')
      .run(enabled ? 1 : 0, req.params.id);
  }
  res.json({ message: `Block ${enabled ? 'enabled' : 'disabled'}` });
});

// DELETE /api/blocks/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM blocks WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
