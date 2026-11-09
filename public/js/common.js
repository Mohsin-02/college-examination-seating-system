// public/js/common.js — Shared utilities across all pages

const API = {
  async get(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 401) { window.location.href = '/'; return null; }
    if (!r.ok) throw new Error((await r.json()).error || 'Request failed');
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { window.location.href = '/'; return null; }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
    return r.json();
  },
  async patch(url, body) {
    const r = await fetch(url, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Patch failed');
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    return r.json();
  }
};

// ── Toast notifications ──────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Confirmation dialog ──────────────────────────────────────
function confirmAction(message) {
  return confirm(message);
}

// ── Modal helpers ────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

// ── Loading state helpers ───────────────────────────────────
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn._origText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Loading...';
  } else {
    btn.disabled = false;
    if (btn._origText) btn.innerHTML = btn._origText;
  }
}

// ── Sidebar active state ──────────────────────────────────────
function setActiveSidebarItem() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(el => {
    const href = el.getAttribute('href');
    if (href && path.startsWith(href) && href !== '/') {
      el.classList.add('active');
    }
  });
}

// ── Auth check ────────────────────────────────────────────────
async function checkAuth() {
  try {
    const user = await API.get('/api/auth/me');
    if (!user) return;
    const nameEl = document.getElementById('admin-name');
    const avatarEl = document.getElementById('admin-avatar');
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
    return user;
  } catch(e) {
    window.location.href = '/';
  }
}

// ── Logout ────────────────────────────────────────────────────
async function logout() {
  try {
    await API.post('/api/auth/logout', {});
  } finally {
    window.location.href = '/';
  }
}

// ── Date formatting ───────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Year badge ───────────────────────────────────────────────
function yearBadge(year) {
  const labels = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
  return `<span class="badge year-${year}">${labels[year] || year}</span>`;
}

// ── Availability badge ───────────────────────────────────────
function availBadge(avail) {
  return avail
    ? '<span class="badge badge-green">Available</span>'
    : '<span class="badge badge-red">Unavailable</span>';
}

// ── Init common UI ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setActiveSidebarItem();
  checkAuth();
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
  // Logout button
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', logout);
  });
});
