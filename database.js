// database.js — SQLite schema + safe migrations + smart seed
// ──────────────────────────────────────────────────────────────
// Branches supported (10 total):
//   CSE, CSE-DS, CSE-AIML, CSE-AIDS, IT, ECE, EEE, Mechanical, Civil, MBA
//
// Roll-number format (VJIT style):
//   YY 9 11 A <branch-code> <serial>
//   Example: 22911A0501 → Batch 2022, CSE, Serial 01
//
// Branch codes (2-digit prefix):
//   CSE=05  CSE-DS=67  CSE-AIML=66  CSE-AIDS=72
//   IT=12   ECE=04     EEE=02       Mechanical=03  Civil=01  MBA=50
// ──────────────────────────────────────────────────────────────
const Database    = require('better-sqlite3');
const path        = require('path');
const bcrypt      = require('bcryptjs');
const fs          = require('fs');
const REAL_STUDS  = require('./seed-data/real_students');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'seating.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Safe migration helper ─────────────────────────────────────
function safeAddColumn(table, col, def) {
  try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run(); }
  catch (_) {}
}

// ─────────────────────────────────────────────────────────────
// BASE SCHEMA
// ─────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    year INTEGER NOT NULL CHECK(year BETWEEN 1 AND 4),
    branch TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS faculty (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    phone TEXT,
    available INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    room_no TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 30
  );
  CREATE TABLE IF NOT EXISTS seating_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_type TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    years TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    generated_by TEXT DEFAULT 'Admin'
  );
  CREATE TABLE IF NOT EXISTS seat_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    seat_number INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS faculty_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
    faculty_id INTEGER NOT NULL REFERENCES faculty(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    signed_in INTEGER DEFAULT 0
  );
`);

// ─────────────────────────────────────────────────────────────
// MIGRATIONS (v2 additions)
// ─────────────────────────────────────────────────────────────
safeAddColumn('blocks', 'enabled', 'INTEGER DEFAULT 1');
safeAddColumn('rooms', 'enabled',  'INTEGER DEFAULT 1');
safeAddColumn('rooms', 'num_rows', 'INTEGER DEFAULT 8');
safeAddColumn('rooms', 'num_cols', 'INTEGER DEFAULT 4');
safeAddColumn('seating_plans', 'exam_name',        'TEXT');
safeAddColumn('seating_plans', 'mid_type',         'TEXT');
safeAddColumn('seating_plans', 'faculty_per_room', 'INTEGER DEFAULT 2');
safeAddColumn('seat_assignments', 'col_no',    'INTEGER DEFAULT 1');
safeAddColumn('seat_assignments', 'row_no',    'INTEGER DEFAULT 1');
safeAddColumn('seat_assignments', 'bench_pos', 'TEXT DEFAULT "C"');

// ─────────────────────────────────────────────────────────────
// BRANCH & ROLL-NUMBER CONFIG
// ─────────────────────────────────────────────────────────────
// Canonical branch names used throughout the system
const ALL_BRANCHES = [
  'CSE', 'CSE-DS', 'CSE-AIML', 'CSE-AIDS',
  'IT', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MBA'
];

// VJIT branch code map → used to generate roll numbers
const BRANCH_CODE = {
  'CSE':         '05',
  'CSE-DS':      '67',
  'CSE-AIML':    '66',
  'CSE-AIDS':    '72',
  'IT':          '12',
  'ECE':         '04',
  'EEE':         '02',
  'Mechanical':  '03',
  'Civil':       '01',
  'MBA':         '50',
};

// Batch-year prefix per student year (2025 current: year1=2025, year2=2024, year3=2023, year4=2022)
const YEAR_BATCH = { 1: 25, 2: 24, 3: 23, 4: 22 };

// Typical section size per branch+year (approximate real VJIT sizes)
const BRANCH_COUNT = {
  'CSE':         { 1: 60, 2: 58, 3: 56, 4: 55 },
  'CSE-DS':      { 1: 20, 2: 22, 3: 20, 4: 70 }, // year4 = real data
  'CSE-AIML':    { 1: 25, 2: 24, 3: 23, 4: 22 },
  'CSE-AIDS':    { 1: 20, 2: 20, 3: 18, 4: 18 },
  'IT':          { 1: 30, 2: 30, 3: 28, 4: 28 },
  'ECE':         { 1: 50, 2: 48, 3: 46, 4: 45 },
  'EEE':         { 1: 35, 2: 34, 3: 32, 4: 30 },
  'Mechanical':  { 1: 30, 2: 28, 3: 26, 4: 24 },
  'Civil':       { 1: 25, 2: 24, 3: 22, 4: 20 },
  'MBA':         { 1: 30, 2: 28, 3: 0,  4: 0  }, // MBA is 2-year program
};

// ── Generate a single VJIT roll number ────────────────────────
function makeRollNo(year, branch, serial) {
  const batch = YEAR_BATCH[year] || 22;
  const code  = BRANCH_CODE[branch] || '99';
  return `${batch}911A${code}${String(serial).padStart(2, '0')}`;
}

// ── Name pools for auto-generation ───────────────────────────
const FIRST_NAMES = [
  'Aarav','Aditya','Akash','Ananya','Arjun','Ashwin','Bhavana','Charan',
  'Deepika','Divya','Ganesh','Harish','Ishaan','Jyothi','Karthik','Kavya',
  'Lakshmi','Madhav','Meera','Mounika','Naveen','Nikhil','Pooja','Pranav',
  'Priya','Rahul','Ravi','Rohith','Sai','Sandeep','Shivani','Sneha',
  'Suresh','Swathi','Tejas','Uday','Uma','Varun','Vidya','Vikram',
  'Yamini','Zeeshan','Amulya','Bhargav','Chaitanya','Deepthi','Eswar',
  'Farhan','Girish','Haritha','Imran','Jayesh','Keerthi','Lohith',
  'Madhuri','Nagesh','Omkar','Pavani','Rajesh','Sirisha','Tarun',
];
const LAST_NAMES = [
  'Kumar','Reddy','Sharma','Singh','Patel','Nair','Rao','Gupta',
  'Verma','Iyer','Pillai','Menon','Naidu','Goud','Chowdary','Babu',
  'Raju','Prasad','Shetty','Varma','Yadav','Teja','Srinivas','Mohan',
];

function randomName(seed) {
  const fn = FIRST_NAMES[seed % FIRST_NAMES.length];
  const ln = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${fn} ${ln}`;
}

// ─────────────────────────────────────────────────────────────
// SEED FUNCTION
// ─────────────────────────────────────────────────────────────
function seedDatabase() {
  if (db.prepare('SELECT COUNT(*) AS c FROM admins').get().c > 0) {
    // DB already seeded — but still sync real students in case they were added
    syncRealStudents();
    return;
  }

  console.log('🌱 Seeding database with sample data...');

  // ── Admin ──────────────────────────────────────────────────
  db.prepare('INSERT INTO admins (username,password,name) VALUES (?,?,?)')
    .run('admin', bcrypt.hashSync('admin123', 10), 'System Administrator');

  // ── Blocks ─────────────────────────────────────────────────
  ['A','B','C','D','E','S','N'].forEach(n =>
    db.prepare('INSERT OR IGNORE INTO blocks (name,enabled) VALUES (?,1)').run(n)
  );

  // ── Rooms (VJIT-accurate layout) ───────────────────────────
  const roomDefs = [
    ['S','S 003',24,8,3],['S','S 005',24,8,3],['S','S 006',24,8,3],
    ['S','S 007',24,8,3],['S','S 103',24,8,3],['S','S 104',40,8,5],
    ['S','S 105',24,8,3],['S','S 106',24,8,3],['S','S 107',24,8,3],
    ['S','S 203',20,7,3],['S','S 204',20,7,3],['S','S 205',24,8,3],
    ['S','S 206',24,8,3],['S','S 207',24,8,3],['S','S 302',40,8,5],
    ['S','S 303',27,9,3],['S','S 304',34,8,4],['S','S 305',24,8,3],
    ['S','S 306',24,8,3],['S','S 307',24,8,3],
    ['C','C 301',29,7,4],['C','C 302',29,7,4],['C','C 304',29,7,4],['C','C 305',30,8,4],
    ['N','N 005',24,8,3],['N','N 006',24,8,3],['N','N 007',24,8,3],
    ['N','N 105',24,8,3],['N','N 107',24,8,3],['N','N 207',24,8,3],
    ['N','N 208',18,6,3],['N','N 305',19,7,3],['N','N 307',24,8,3],
    ['D','D 101',20,7,3],['D','D 102',20,7,3],['D','D 110',27,9,3],
    ['D','D 201',34,8,4],['D','D 202',30,8,4],['D','D 205',30,8,4],
    ['E','E 001',28,7,4],['E','E 003',24,8,3],['E','E 004',18,6,3],
    ['E','E 011',40,8,5],['E','E 012',40,8,5],['E','E 109',24,8,3],
    ['E','E 111',24,8,3],['E','E 112',24,8,3],['E','E 113',24,8,3],
    ['E','E 202',24,8,3],['E','E 213',24,8,3],['E','E 214',24,8,3],['E','E 215',24,8,3],
    ['A','A 101',33,8,4],['A','A 102',30,8,4],['A','A 104',24,8,3],
    ['A','A 201',28,7,4],['A','A 202',31,8,4],['A','A 203',48,8,6],
    ['A','A 204',42,8,5],['A','A 209',30,8,4],
    ['B','B 001',22,7,3],['B','B 002',20,7,3],
  ];
  const insRoom = db.prepare(`
    INSERT OR IGNORE INTO rooms (block_id,room_no,capacity,num_rows,num_cols,enabled)
    VALUES ((SELECT id FROM blocks WHERE name=?),?,?,?,?,1)
  `);
  roomDefs.forEach(([blk,rno,cap,nr,nc]) => insRoom.run(blk,rno,cap,nr,nc));

  // ── Faculty ────────────────────────────────────────────────
  const facList = [
    ['Dr. P. Venkata Rao','CSE'],   ['Dr. K. Sunitha','ECE'],
    ['Prof. M. Ravi Shankar','EEE'],['Dr. S. Lakshmi Devi','CSE'],
    ['Prof. T. Narasimha','Mechanical'],['Dr. B. Srinivas','IT'],
    ['Prof. N. Priya','CSE'],       ['Dr. G. Mahesh','ECE'],
    ['Prof. V. Annapurna','EEE'],   ['Dr. R. Kishore','Civil'],
    ['Prof. C. Swathi','CSE-DS'],   ['Dr. A. Raju','ECE'],
    ['Prof. H. Padmavathi','IT'],   ['Dr. L. Subrahmanyam','Mechanical'],
    ['Prof. F. Madhuri','EEE'],     ['Dr. J. Prakash','CSE'],
    ['Prof. Q. Kavitha','CSE-AIML'],['Dr. O. Nagendra','Civil'],
    ['Prof. W. Bhavani','IT'],      ['Dr. Y. Ramakrishna','Mechanical'],
    ['Prof. Z. Padma','MBA'],       ['Dr. X. Srikanth','CSE-AIDS'],
    ['Prof. U. Vasantha','ECE'],    ['Dr. V. Satyanarayana','EEE'],
    ['Prof. S. Renuka','CSE'],      ['Dr. T. Nagamani','IT'],
  ];
  const insFac = db.prepare(`
    INSERT OR IGNORE INTO faculty (emp_id,name,department,phone,available) VALUES (?,?,?,?,1)
  `);
  facList.forEach(([name,dept],i) =>
    insFac.run(`EMP${String(i+1).padStart(3,'0')}`, name, dept,
      `9${String(700000000 + i*17).substring(0,9)}`)
  );

  // ── Students: first insert real data, then auto-gen the rest ─
  seedStudents();
  console.log('✅ Database seeded successfully.');
}

// ── Insert / sync real students (idempotent) ─────────────────
function syncRealStudents() {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO students (roll_no,name,year,branch) VALUES (?,?,?,?)`
  );
  let count = 0;
  const tx  = db.transaction(() => {
    for (const s of REAL_STUDS) {
      const r = ins.run(s.roll_no.toUpperCase(), s.name.trim(), s.year, s.branch);
      if (r.changes) count++;
    }
  });
  tx();
  if (count > 0) console.log(`📥 Synced ${count} real students into DB.`);
}

// ── Auto-generate students for branches/years with no data ───
function seedStudents() {
  // 1. First insert all real students
  syncRealStudents();

  // 2. For every branch × year, check if any exist; if not, auto-generate
  const ins = db.prepare(
    `INSERT OR IGNORE INTO students (roll_no,name,year,branch) VALUES (?,?,?,?)`
  );

  const autoGenTx = db.transaction(() => {
    let generated = 0;

    ALL_BRANCHES.forEach(branch => {
      for (let year = 1; year <= 4; year++) {
        const target = BRANCH_COUNT[branch]?.[year] ?? 0;
        if (target === 0) continue; // MBA yr 3/4 etc.

        // Find which serials already exist for this branch+year batch
        const batchPrefix = `${YEAR_BATCH[year]}911A${BRANCH_CODE[branch]}`;
        const existing = db.prepare(
          `SELECT roll_no FROM students WHERE branch=? AND year=? AND roll_no LIKE ?`
        ).all(branch, year, `${batchPrefix}%`).map(r => r.roll_no);

        const existingSerials = new Set(
          existing.map(r => parseInt(r.replace(batchPrefix,''), 10)).filter(n => !isNaN(n))
        );

        // How many to generate
        const currentCount = db.prepare(
          `SELECT COUNT(*) AS c FROM students WHERE branch=? AND year=?`
        ).get(branch, year).c;

        if (currentCount >= target) continue; // already enough
        const toGenerate = target - currentCount;

        let serial = 1, nameIdx = (year * 100 + ALL_BRANCHES.indexOf(branch) * 7);
        let added = 0;
        while (added < toGenerate && serial <= 999) {
          if (!existingSerials.has(serial)) {
            const rn   = makeRollNo(year, branch, serial);
            const name = randomName(nameIdx + serial);
            const r    = ins.run(rn, name, year, branch);
            if (r.changes) { added++; generated++; }
          }
          serial++;
        }
      }
    });

    console.log(`🤖 Auto-generated ${generated} students for missing branches/years.`);
  });
  autoGenTx();
}

seedDatabase();

module.exports = db;
module.exports.ALL_BRANCHES = ALL_BRANCHES;
module.exports.BRANCH_CODE  = BRANCH_CODE;
