// routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database');
const router  = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  req.session.admin = { id: admin.id, name: admin.name, username: admin.username };
  res.json({ success: true, name: admin.name });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session && req.session.admin)
    return res.json(req.session.admin);
  res.status(401).json({ error: 'Not logged in' });
});

module.exports = router;
