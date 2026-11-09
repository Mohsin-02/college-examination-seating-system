// public/js/sidebar.js — Injects the sidebar HTML
function renderSidebar() {
  const sidebar = `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="logo-icon">🎓</div>
        <div class="logo-text">
          <strong>Exam Seating</strong>
          <span>Examination Branch</span>
        </div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-section-label">Main</div>
        <a href="/dashboard" class="nav-item">
          <span class="nav-icon">🏠</span> Dashboard
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Management</div>
        <a href="/students" class="nav-item">
          <span class="nav-icon">👨‍🎓</span> Students
        </a>
        <a href="/faculty" class="nav-item">
          <span class="nav-icon">👨‍🏫</span> Faculty
        </a>
        <a href="/blocks-rooms" class="nav-item">
          <span class="nav-icon">🏛️</span> Blocks & Rooms
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Examination</div>
        <a href="/seating-generator" class="nav-item">
          <span class="nav-icon">⚙️</span> Generate Plan
        </a>
        <a href="/seating-viewer" class="nav-item">
          <span class="nav-icon">📋</span> View Plans
        </a>
        <a href="/faculty-duty" class="nav-item">
          <span class="nav-icon">📝</span> Faculty Duty
        </a>
        <a href="/faculty-signin" class="nav-item">
          <span class="nav-icon">✅</span> Faculty Sign-In
        </a>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar" id="admin-avatar">A</div>
        <div class="user-info">
          <span>Administrator</span>
          <strong id="admin-name">Admin</strong>
        </div>
        <button class="btn-logout" data-logout title="Logout">⎋</button>
      </div>
    </div>
  </aside>`;

  document.body.insertAdjacentHTML('afterbegin', sidebar);
}

document.addEventListener('DOMContentLoaded', renderSidebar);
