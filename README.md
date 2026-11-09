# 🎓 College Examination Seating Arrangement System

A web-based examination management application designed to automate
student seating allocation, classroom management and faculty duty
assignment for college examinations.

The system supports Mid and Semester examination seating arrangements,
student and faculty management, CSV-based bulk uploads and automated
seating plan generation.

## Technologies Used

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express.js
- Database: SQLite
- Authentication: Express Session, bcryptjs
- CSV Processing: csv-parse

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or later
- npm
- Git (optional)

### Installation

1. Clone the repository:

   ```bash
   git clone YOUR_GITHUB_REPOSITORY_URL

# 2. Install dependencies
npm install

# 3. Start the server
npm start
# OR for development with auto-restart:
npm run dev
```

### Access the App
Open your browser: **http://localhost:3000**

**Default Login:**
| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

---
## 📁 Project Structure

```text
college-examination-seating-system/
│
├── server.js
├── database.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
│
├── data/
│   └── seating.db              # Automatically generated SQLite database
│
├── routes/
│   ├── auth.js
│   ├── students.js
│   ├── faculty.js
│   ├── blocks.js
│   ├── rooms.js
│   └── seating.js
│
├── seed-data/
│   └── real_students.js        # AI-generated sample student records
│
├── public/
│   ├── index.html
│   ├── dashboard.html
│   ├── students.html
│   ├── faculty.html
│   ├── blocks-rooms.html
│   ├── seating-generator.html
│   ├── seating-viewer.html
│   ├── faculty-duty.html
│   ├── faculty-signin.html
│   ├── sample_students.csv
│   ├── css/
│   └── js/
│
└── screenshots/
    ├── 01-dashboard.png
    ├── 02-student-management.png
    ├── 03-seating-arrangement.png
    ├── 04-faculty-management.png
    └── 05-block-room-management.png
```

---

## 📌 Modules Overview

### 1. Admin Login
- Session-based authentication
- Secure password hashing with bcryptjs

### 2. Student Management (`/students`)
- Add / Edit / Delete students
- Fields: Roll No, Name, Year (1–4), Branch
- Upload students via CSV
- Filter by year and branch
- Live search

### 3. Faculty Management (`/faculty`)
- Add / Edit / Delete faculty
- Toggle availability for duty
- Fields: Emp ID, Name, Department, Phone, Available

### 4. Block & Room Management (`/blocks-rooms`)
- 7 default blocks: A, B, C, D, E, S, N
- Set/edit room capacity
- Visual block-based layout

### 5. Seating Plan Generator (`/seating-generator`)
- Select: Exam Type (Mid / Semester), Years, Date
- **Interleaving algorithm**: Students from different branches seated together to prevent copying
- Auto-assigns available faculty to rooms
- Stores plan in database

### 6. Seating Plan Viewer (`/seating-viewer`)
- Room-wise seating display
- Faculty assigned to each room
- **Print** button (browser print dialog)
- **Download PDF** (Print → Save as PDF)

### 7. Faculty Duty (`/faculty-duty`)
- Reassign faculty to rooms per plan
- **Printable duty slips** with:
  - Faculty name, ID, Department
  - Room assigned, Exam type, Date
  - Three signature boxes (Faculty / Arrival / Superintendent)

### 8. Faculty Sign-In (`/faculty-signin`)
- Accessible without sidebar (exam-day tablet use)
- One-click sign-in toggle per faculty member
- Real-time count: signed / pending
- Auto-refresh every 60 seconds

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/students` | List students (`?year=&branch=`) |
| POST | `/api/students` | Add student |
| PUT  | `/api/students/:id` | Update student |
| DELETE | `/api/students/:id` | Delete student |
| POST | `/api/students/upload-csv` | Bulk import from CSV |
| GET  | `/api/faculty` | List faculty (`?available=1`) |
| POST | `/api/faculty` | Add faculty |
| PATCH | `/api/faculty/:id/availability` | Toggle availability |
| GET  | `/api/faculty/signin/:planId` | Get sign-in status |
| PATCH | `/api/faculty/signin/:id` | Update sign-in |
| GET  | `/api/blocks` | List blocks with room counts |
| GET  | `/api/rooms` | List all rooms |
| GET  | `/api/seating` | List all seating plans |
| POST | `/api/seating/generate` | Generate new plan |
| GET  | `/api/seating/:planId` | Full plan details |
| PUT  | `/api/seating/:planId/faculty` | Update faculty assignments |
| DELETE | `/api/seating/:planId` | Delete plan |

---

## 🗄️ Database Schema

```sql
admins           — id, username, password, name
students         — id, roll_no, name, year, branch
faculty          — id, emp_id, name, department, phone, available
blocks           — id, name
rooms            — id, block_id, room_no, capacity
seating_plans    — id, exam_type, exam_date, years, generated_by, created_at
seat_assignments — id, plan_id, student_id, room_id, seat_number
faculty_assignments — id, plan_id, faculty_id, room_id, signed_in
```

---

## 🧮 Seating Algorithm

The seating generator uses an **interleaving strategy**:
1. Groups students by branch (CSE, ECE, EEE, etc.)
2. Picks one student from each branch in round-robin fashion
3. Fills rooms sequentially without gaps
4. Auto-assigns available faculty to each occupied room

This ensures students from the same branch are **not seated together**, reducing the risk of copying.

---

## 📤 CSV Import Format

```csv
roll_no,name,year,branch
22CSE001,Aarav Kumar,2,CSE
22ECE001,Deepika Nair,2,ECE
```

A sample file is at: `public/sample_students.csv`

---

## 🖨️ Printing

All pages with print buttons use the **browser's built-in print dialog**.  
To save as PDF: `Print → Destination → Save as PDF`

---


## 🔒 Security Notes

- Session secret is configured through environment variables.
- Environment files containing secrets are excluded from Git.
- Admin passwords are stored using bcryptjs hashing.
- Sessions expire after 8 hours.
- Administrative API routes are protected by session authentication.
- Default admin credentials are provided for local demonstration only.
- Additional security controls are required before production deployment.


## 🧪 Sample Data

The project includes AI-generated sample student records
for demonstration and testing purposes.

---
## 📸 Application Screenshots

### 1. Admin Dashboard

![Admin Dashboard](screenshots/01-dashboard.png)

### 2. Student Management

![Student Management](screenshots/02-student-management.png)

### 3. Examination Seating Arrangement

![Seating Arrangement](screenshots/03-seating-arrangement.png)

### 4. Faculty Management

![Faculty Management](screenshots/04-faculty-management.png)

### 5. Block and Room Management

![Block and Room Management](screenshots/05-block-room-management.png)

---


## 📝 License

Free for academic and institutional use.
