// routes/students.js
const express  = require('express');
const multer   = require('multer');
const { parse }= require('csv-parse/sync');
const db       = require('../database');
const router   = express.Router();

const upload   = multer({ storage: multer.memoryStorage() });

// ── Branch name normalisation map ────────────────────────────
// Maps various spellings/abbreviations → canonical branch name
const BRANCH_ALIASES = {
  // CSE variants
  'CSE':          'CSE',
  'CS':           'CSE',
  'COMPUTER SCIENCE': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  // CSE-DS variants
  'CSE-DS':       'CSE-DS',
  'CSE(DS)':      'CSE-DS',
  'CSEDS':        'CSE-DS',
  'CSE DS':       'CSE-DS',
  'DATA SCIENCE': 'CSE-DS',
  // CSE-AIML variants
  'CSE-AIML':     'CSE-AIML',
  'CSE(AIML)':    'CSE-AIML',
  'AIML':         'CSE-AIML',
  'AI & ML':      'CSE-AIML',
  'AI&ML':        'CSE-AIML',
  'AI AND ML':    'CSE-AIML',
  // CSE-AIDS variants
  'CSE-AIDS':     'CSE-AIDS',
  'CSE(AIDS)':    'CSE-AIDS',
  'AIDS':         'CSE-AIDS',
  'AI & DS':      'CSE-AIDS',
  'AI&DS':        'CSE-AIDS',
  'AI AND DS':    'CSE-AIDS',
  // IT
  'IT':           'IT',
  'INFORMATION TECHNOLOGY': 'IT',
  // ECE
  'ECE':          'ECE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'ELECTRONICS': 'ECE',
  // EEE
  'EEE':          'EEE',
  'ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  'ELECTRICAL': 'EEE',
  // Mechanical
  'MECHANICAL':   'Mechanical',
  'MECH':         'Mechanical',
  'ME':           'Mechanical',
  'MECHANICAL ENGINEERING': 'Mechanical',
  // Civil
  'CIVIL':        'Civil',
  'CIV':          'Civil',
  'CIVIL ENGINEERING': 'Civil',
  // MBA
  'MBA':          'MBA',
  'MASTER OF BUSINESS ADMINISTRATION': 'MBA',
};

function normalizeBranch(raw) {
  if (!raw) return null;
  const up = raw.trim().toUpperCase().replace(/\s+/g,' ');
  return BRANCH_ALIASES[up] || raw.trim(); // fall back to trimmed original
}

// ── Clean a roll number from CSV ─────────────────────────────
function cleanRollNo(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

// ─────────────────────────────────────────────────────────────
// GET /api/students — list all; optional ?year= ?branch=
// ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { year, branch } = req.query;
  let sql = 'SELECT * FROM students WHERE 1=1';
  const params = [];
  if (year)   { sql += ' AND year = ?';   params.push(Number(year)); }
  if (branch) { sql += ' AND branch = ?'; params.push(branch); }
  sql += ' ORDER BY year, branch, roll_no';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/students/stats — count per year (and optionally per branch)
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT year, COUNT(*) AS count FROM students GROUP BY year ORDER BY year
  `).all();
  res.json(stats);
});

// GET /api/students/branch-stats — count per branch per year
router.get('/branch-stats', (req, res) => {
  const stats = db.prepare(`
    SELECT branch, year, COUNT(*) AS count
    FROM students GROUP BY branch, year ORDER BY branch, year
  `).all();
  res.json(stats);
});

// GET /api/students/branches — distinct branch list
router.get('/branches', (req, res) => {
  const branches = db.prepare(
    `SELECT DISTINCT branch FROM students ORDER BY branch`
  ).all().map(r => r.branch);
  res.json(branches);
});

// GET /api/students/:id
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// POST /api/students — add single
router.post('/', (req, res) => {
  const { roll_no, name, year, branch } = req.body;
  if (!roll_no || !name || !year || !branch)
    return res.status(400).json({ error: 'All fields required' });
  const normBranch = normalizeBranch(branch);
  try {
    const info = db.prepare(`
      INSERT INTO students (roll_no, name, year, branch) VALUES (?, ?, ?, ?)
    `).run(cleanRollNo(roll_no), name.trim(), Number(year), normBranch);
    res.json({ id: info.lastInsertRowid, message: 'Student added' });
  } catch (e) {
    res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Roll number already exists' : e.message });
  }
});

// PUT /api/students/:id
router.put('/:id', (req, res) => {
  const { roll_no, name, year, branch } = req.body;
  const normBranch = normalizeBranch(branch);
  try {
    db.prepare(`
      UPDATE students SET roll_no=?, name=?, year=?, branch=? WHERE id=?
    `).run(cleanRollNo(roll_no), name.trim(), Number(year), normBranch, req.params.id);
    res.json({ message: 'Updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/students/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/students/upload-csv
// Handles messy CSVs: extra empty columns, lowercase roll_no,
// trailing spaces in names, mixed branch name formats.
// ─────────────────────────────────────────────────────────────
router.post('/upload-csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // Parse — relax=column count so extra empty columns are silently ignored
    const records = parse(req.file.buffer, {
      columns:           true,
      skip_empty_lines:  true,
      trim:              true,
      relax_column_count: true,  // ← handles ,,,,,, trailing commas
    });

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO students (roll_no, name, year, branch) VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction(rows => {
      let inserted = 0, skipped = 0, errors = [];
      for (const row of rows) {
        // Accept various column header spellings
        const r = cleanRollNo(row.roll_no || row['Roll No'] || row['RollNo'] || row['ROLL_NO'] || row['HT_NO'] || row['ht_no']);
        const n = (row.name || row['Name'] || row['NAME'] || row['Student Name'] || '').trim();
        const y = row.year || row['Year'] || row['YEAR'];
        const b = normalizeBranch(row.branch || row['Branch'] || row['BRANCH']);

        // Skip rows that are clearly junk (e.g. the note row in the CSV)
        if (!r || !n || !y || !b) { skipped++; continue; }
        if (isNaN(Number(y)) || Number(y) < 1 || Number(y) > 4) { skipped++; continue; }

        try {
          const info = insertStmt.run(r, n, Number(y), b);
          if (info.changes) inserted++; else skipped++;
        } catch (rowErr) {
          errors.push(`${r}: ${rowErr.message}`);
          skipped++;
        }
      }
      return { inserted, skipped, errors: errors.slice(0, 5) }; // return max 5 errors
    });

    const result = insertMany(records);
    res.json({
      message: `Imported ${result.inserted} students, ${result.skipped} skipped`,
      errors:  result.errors
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
module.exports.normalizeBranch = normalizeBranch;
