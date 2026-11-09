// server.js — Main Express application entry point
require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const cors       = require('cors');
const path       = require('path');

// Initialize database (runs schema + seed)
require('./database');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Validate session secret
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing. Please configure it in .env');
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// ── Auth middleware ─────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  // Allow API calls to return 401
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/');
}

// ── Route modules ───────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/students', requireAuth, require('./routes/students'));
app.use('/api/faculty',  requireAuth, require('./routes/faculty'));
app.use('/api/blocks',   requireAuth, require('./routes/blocks'));
app.use('/api/rooms',    requireAuth, require('./routes/rooms'));
app.use('/api/seating',  requireAuth, require('./routes/seating'));

// ── Serve HTML pages ────────────────────────────────────────
// All other GET requests → SPA-style, serve the right HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard',       requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/students',        requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'students.html')));
app.get('/faculty',         requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'faculty.html')));
app.get('/blocks-rooms',    requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'blocks-rooms.html')));
app.get('/seating-generator', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'seating-generator.html')));
app.get('/seating-viewer',  requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'seating-viewer.html')));
app.get('/faculty-duty',    requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'faculty-duty.html')));
app.get('/faculty-signin',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'faculty-signin.html')));

// ── Start server ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎓 Seating Arrangement System`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Login: admin / admin123\n`);
});
