// routes/seating.js — Bench-wise seating generation algorithm (v2)
// ─────────────────────────────────────────────────────────────────
// BENCH LAYOUT MODEL:
//   A room has num_cols (default 4) columns of benches,
//   each column has num_rows (default 8) benches front-to-back.
//
//   Mid Exam   → 2 students per bench (Left + Right positions)
//                Left (bench_pos='L') and Right (bench_pos='R') come from DIFFERENT year groups
//                Column rule: all L-seats in a column → same year group (roll_no front→back)
//                             all R-seats in a column → different year group (roll_no front→back)
//
//   Semester   → 1 student per bench (Centre position, bench_pos='C')
//                Each column holds one year-group's students in roll_no order front→back
//
// SERPENTINE SEAT NUMBERING (for printing):
//   Col 0: 1 → num_rows         (front to back)
//   Col 1: 2×num_rows → num_rows+1 (back to front)
//   Col 2: 2×num_rows+1 → 3×num_rows (front to back)
//   ... alternating
// ─────────────────────────────────────────────────────────────────
const express = require('express');
const db      = require('../database');
const router  = express.Router();

// ── Core bench-seating algorithm ─────────────────────────────────
function generateBenchSeating(students, rooms, examType) {
  const isMid = (examType !== 'Semester');

  // 1. Group students by year, sort each group by branch then roll_no
  const byYear = {};
  students.forEach(s => {
    if (!byYear[s.year]) byYear[s.year] = [];
    byYear[s.year].push(s);
  });
  const years = Object.keys(byYear).map(Number).sort();
  years.forEach(y => {
    byYear[y].sort((a,b) => a.branch.localeCompare(b.branch) || a.roll_no.localeCompare(b.roll_no));
  });

  if (!years.length) throw new Error('No students found for selected years.');

  const numYears = years.length;

  // 2. Create queues — one per year (will be consumed across all rooms)
  const queues = {};
  years.forEach(y => { queues[y] = [...byYear[y]]; });

  // 3. Sub-column assignment function:
  //    For Mid  → 2 sub-cols per bench-col: (col×2+0)→yearA, (col×2+1)→yearB (must differ)
  //    For Sem  → 1 sub-col per bench-col:   col→year
  //    Year assignment cycles through years[], ensuring L/R at same bench differ.
  function getYearForSubCol(subColIdx) {
    return years[subColIdx % numYears];
  }

  // Ensure L and R at same bench col have DIFFERENT years when possible
  function buildSubColYears(numCols) {
    if (!isMid) {
      // Semester: 1 sub-col per physical col
      return Array.from({length: numCols}, (_, c) => [getYearForSubCol(c)]);
    }
    // Mid: 2 sub-cols per physical col [L, R]
    return Array.from({length: numCols}, (_, c) => {
      const lYear = years[(c * 2)     % numYears];
      let   rYear = years[(c * 2 + 1) % numYears];
      // If L and R map to same year and we have >1 year, pick the next different one
      if (rYear === lYear && numYears > 1) {
        rYear = years[(c * 2 + 1 + 1) % numYears];
      }
      return [lYear, rYear];
    });
  }

  const allAssignments = [];

  // 4. Fill rooms one by one
  for (const room of rooms) {
    const numRows = room.num_rows || 8;
    const numCols = room.num_cols || 4;
    const subColYearMap = buildSubColYears(numCols);
    // subColYearMap[col] = [yearForPos0, yearForPos1?]

    let seatNum = 1;

    // Iterate: column-major, then position (L before R), then row (front → back)
    // This makes the same-year group flow vertically in each sub-column
    for (let col = 0; col < numCols; col++) {
      const positions = isMid ? ['L','R'] : ['C'];
      for (let posIdx = 0; posIdx < positions.length; posIdx++) {
        const pos  = positions[posIdx];
        const year = subColYearMap[col][posIdx];

        for (let row = 0; row < numRows; row++) {
          if (!queues[year] || queues[year].length === 0) continue;
          const student = queues[year].shift();

          // Serpentine seat number for THIS column (for display/print)
          // Col 0,2,4 (even) → front to back: baseRow + row + 1
          // Col 1,3,5 (odd)  → back to front: baseRow + (numRows - row)
          const baseRow = col * numRows;
          const serpSeat = (col % 2 === 0)
            ? baseRow + row + 1
            : baseRow + (numRows - row);

          allAssignments.push({
            student_id:  student.id,
            room_id:     room.id,
            seat_number: serpSeat,
            col_no:      col + 1,   // 1-indexed
            row_no:      row + 1,   // 1-indexed
            bench_pos:   pos        // L / R / C
          });
          seatNum++;
        }
      }
    }

    // Stop once all year queues are empty
    if (years.every(y => !queues[y] || queues[y].length === 0)) break;
  }

  return allAssignments;
}

// ── Helper: build branch-range summary for the summary sheet ─────
function buildRoomSummary(planId) {
  const rooms = db.prepare(`
    SELECT DISTINCT r.id, r.room_no, r.capacity, b.name AS block_name,
      COUNT(sa.id) AS students_assigned
    FROM rooms r
    JOIN blocks b ON r.block_id = b.id
    JOIN seat_assignments sa ON sa.room_id = r.id AND sa.plan_id = ?
    GROUP BY r.id ORDER BY b.name, r.room_no
  `).all(planId);

  return rooms.map((room, idx) => {
    const rows = db.prepare(`
      SELECT s.branch, s.year, s.roll_no
      FROM seat_assignments sa
      JOIN students s ON sa.student_id = s.id
      WHERE sa.plan_id = ? AND sa.room_id = ?
      ORDER BY s.branch, s.roll_no
    `).all(planId, room.id);

    // Group by branch
    const branchMap = {};
    rows.forEach(r => {
      (branchMap[r.branch] = branchMap[r.branch] || []).push(r.roll_no);
    });

    const branches = Object.entries(branchMap).map(([branch, rolls]) => {
      rolls.sort((a,b) => a.localeCompare(b));
      const range = rolls.length === 1
        ? rolls[0]
        : `${rolls[0]} - ${rolls[rolls.length-1]}`;
      return { branch, count: rolls.length, range };
    });

    return { sno: idx + 1, ...room, branches, total: room.students_assigned };
  });
}

// ══════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════

// GET /api/seating — list all plans
router.get('/', (req, res) => {
  const plans = db.prepare(`
    SELECT sp.*,
      (SELECT COUNT(DISTINCT room_id) FROM seat_assignments WHERE plan_id=sp.id) AS rooms_used,
      (SELECT COUNT(*) FROM seat_assignments WHERE plan_id=sp.id) AS total_students
    FROM seating_plans sp ORDER BY sp.created_at DESC
  `).all();
  res.json(plans);
});

// POST /api/seating/generate
// Body: { exam_type, exam_name, mid_type, exam_date, years[], faculty_per_room }
router.post('/generate', (req, res) => {
  const { exam_type, exam_name, mid_type, exam_date, years, faculty_per_room } = req.body;

  if (!exam_type || !exam_date || !years?.length)
    return res.status(400).json({ error: 'exam_type, exam_date, and years are required' });

  const ph = years.map(() => '?').join(',');
  const students = db.prepare(
    `SELECT * FROM students WHERE year IN (${ph}) ORDER BY year, branch, roll_no`
  ).all(...years.map(Number));

  if (!students.length)
    return res.status(400).json({ error: 'No students found for selected years' });

  // Only use ENABLED rooms in ENABLED blocks
  const rooms = db.prepare(`
    SELECT r.*, b.name AS block_name FROM rooms r
    JOIN blocks b ON r.block_id = b.id
    WHERE r.enabled = 1 AND b.enabled = 1
    ORDER BY b.name, r.room_no
  `).all();

  if (!rooms.length)
    return res.status(400).json({ error: 'No enabled rooms available. Enable some rooms/blocks first.' });

  try {
    const assignments = generateBenchSeating(students, rooms, exam_type);
    if (!assignments.length)
      return res.status(400).json({ error: 'No assignments generated — check student/room data' });

    const facPerRoom = Math.max(1, Math.min(3, Number(faculty_per_room) || 2));
    const planName   = exam_name || `${mid_type || exam_type} Examination`;

    const saveAll = db.transaction(() => {
      // Insert the plan
      const planInfo = db.prepare(`
        INSERT INTO seating_plans
          (exam_type, exam_name, mid_type, exam_date, years, faculty_per_room, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        exam_type, planName,
        mid_type || (exam_type === 'Semester' ? 'Semester' : 'Mid-1'),
        exam_date, JSON.stringify(years), facPerRoom,
        req.session?.admin?.name || 'Admin'
      );
      const planId = planInfo.lastInsertRowid;

      // Insert seat assignments (with bench position data)
      const insSeat = db.prepare(`
        INSERT INTO seat_assignments
          (plan_id, student_id, room_id, seat_number, col_no, row_no, bench_pos)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      assignments.forEach(a =>
        insSeat.run(planId, a.student_id, a.room_id, a.seat_number, a.col_no, a.row_no, a.bench_pos)
      );

      // Auto-assign available faculty (facPerRoom per occupied room)
      const usedRooms = [...new Set(assignments.map(a => a.room_id))];
      const availFac  = db.prepare('SELECT * FROM faculty WHERE available=1 ORDER BY name').all();
      const insFac    = db.prepare(
        `INSERT INTO faculty_assignments (plan_id, faculty_id, room_id) VALUES (?, ?, ?)`
      );
      usedRooms.forEach((roomId, ri) => {
        for (let f = 0; f < facPerRoom; f++) {
          const facIdx = ri * facPerRoom + f;
          if (facIdx < availFac.length) insFac.run(planId, availFac[facIdx].id, roomId);
        }
      });

      return planId;
    });

    const planId = saveAll();
    res.json({
      success: true, plan_id: planId,
      total_students: assignments.length,
      message: `Plan generated: ${assignments.length} students across ${[...new Set(assignments.map(a=>a.room_id))].length} rooms`
    });

  } catch (e) {
    console.error('Seating generation error:', e);
    res.status(400).json({ error: e.message });
  }
});

// GET /api/seating/:planId — full plan with bench grid
router.get('/:planId', (req, res) => {
  const plan = db.prepare('SELECT * FROM seating_plans WHERE id=?').get(req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const rooms = db.prepare(`
    SELECT DISTINCT r.id, r.room_no, r.capacity, r.num_rows, r.num_cols,
      b.name AS block_name, COUNT(sa.id) AS students_assigned
    FROM rooms r
    JOIN blocks b ON r.block_id = b.id
    JOIN seat_assignments sa ON sa.room_id = r.id AND sa.plan_id = ?
    GROUP BY r.id ORDER BY b.name, r.room_no
  `).all(plan.id);

  const roomData = rooms.map(room => {
    const seats = db.prepare(`
      SELECT sa.seat_number, sa.col_no, sa.row_no, sa.bench_pos,
             s.roll_no, s.name AS student_name, s.year, s.branch
      FROM seat_assignments sa
      JOIN students s ON sa.student_id = s.id
      WHERE sa.plan_id=? AND sa.room_id=?
      ORDER BY sa.col_no, sa.row_no, sa.bench_pos
    `).all(plan.id, room.id);

    // Build bench grid map: grid[rowNo][colNo] = { L?, R?, C? }
    const grid = {};
    seats.forEach(s => {
      if (!grid[s.row_no]) grid[s.row_no] = {};
      if (!grid[s.row_no][s.col_no]) grid[s.row_no][s.col_no] = {};
      grid[s.row_no][s.col_no][s.bench_pos] = s;
    });

    const faculty = db.prepare(`
      SELECT fa.id AS assignment_id, fa.signed_in,
             f.name, f.emp_id, f.department, f.phone
      FROM faculty_assignments fa
      JOIN faculty f ON fa.faculty_id = f.id
      WHERE fa.plan_id=? AND fa.room_id=?
      ORDER BY f.name
    `).all(plan.id, room.id);

    return { ...room, seats, grid, faculty };
  });

  const summary = buildRoomSummary(plan.id);
  res.json({ plan, rooms: roomData, summary });
});

// GET /api/seating/:planId/summary — quick stats card
router.get('/:planId/summary', (req, res) => {
  const plan = db.prepare('SELECT * FROM seating_plans WHERE id=?').get(req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const st = db.prepare(`
    SELECT COUNT(DISTINCT room_id) AS rooms_used, COUNT(*) AS total_students
    FROM seat_assignments WHERE plan_id=?
  `).get(plan.id);
  const fc = db.prepare(`
    SELECT COUNT(*) AS faculty_assigned, SUM(signed_in) AS faculty_signed
    FROM faculty_assignments WHERE plan_id=?
  `).get(plan.id);
  res.json({ ...plan, ...st, ...fc, years: JSON.parse(plan.years||'[]') });
});

// PATCH /api/seating/:planId/meta — update exam name, date, faculty count without regenerating
router.patch('/:planId/meta', (req, res) => {
  const { exam_name, exam_date, faculty_per_room, mid_type } = req.body;
  try {
    db.prepare(`
      UPDATE seating_plans SET
        exam_name        = COALESCE(?, exam_name),
        exam_date        = COALESCE(?, exam_date),
        faculty_per_room = COALESCE(?, faculty_per_room),
        mid_type         = COALESCE(?, mid_type)
      WHERE id = ?
    `).run(exam_name||null, exam_date||null,
           faculty_per_room ? Number(faculty_per_room) : null,
           mid_type||null, req.params.planId);
    res.json({ message: 'Plan metadata updated' });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/seating/:planId/faculty — reassign faculty assignments
// Body: { assignments: [{ faculty_id, room_id }], faculty_per_room? }
router.put('/:planId/faculty', (req, res) => {
  const { assignments, faculty_per_room } = req.body;
  const planId = req.params.planId;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM faculty_assignments WHERE plan_id=?').run(planId);
    const ins = db.prepare(
      `INSERT INTO faculty_assignments (plan_id, faculty_id, room_id) VALUES (?,?,?)`
    );
    (assignments||[]).forEach(a => ins.run(planId, a.faculty_id, a.room_id));
    if (faculty_per_room)
      db.prepare('UPDATE seating_plans SET faculty_per_room=? WHERE id=?')
        .run(Number(faculty_per_room), planId);
  });
  tx();
  res.json({ message: 'Faculty assignments updated' });
});

// DELETE /api/seating/:planId
router.delete('/:planId', (req, res) => {
  db.prepare('DELETE FROM seating_plans WHERE id=?').run(req.params.planId);
  res.json({ message: 'Plan deleted' });
});

module.exports = router;
