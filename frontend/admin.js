/**
 * admin.js — Ananta Techtonic Admin Panel
 * Full admin frontend logic: auth, users, courses, skills, analytics, charts
 */

'use strict';

// ============================================================
//  CONFIG
// ============================================================
const LOCAL_BASE = 'http://localhost:3000';
const HOSTED_BASE = 'https://anata-backend.onrender.com';
let API = HOSTED_BASE;

(async function detectLocalBackend() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        const res = await fetch(LOCAL_BASE + '/api/health', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res && res.ok) API = LOCAL_BASE;
    } catch (err) { }
})();

// ============================================================
//  STATE
// ============================================================
let adminToken = null;
let adminUser = null;

let allUsers = [];
let allCourses = [];
let allSkills = [];
let analyticsData = null;
let allTrades = [];

// Pagination
const PAGE_SIZE = 10;
let userPage = 1;
let coursePage = 1;
let skillPage = 1;

// Charts registry (destroy before re-drawing)
const charts = {};

// Edit mode flag for course form
let editingCourseId = null;

// ============================================================
//  BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    adminToken = localStorage.getItem('adminToken');
    const stored = localStorage.getItem('adminUser');
    if (!adminToken || !stored) {
        window.location.href = 'admin-login.html';
        return;
    }
    adminUser = JSON.parse(stored);

    // Populate nav name
    document.getElementById('adminNavName').textContent = adminUser.name || 'Admin';
    document.getElementById('settingsAdminName').textContent = adminUser.name || 'Admin';

    // Clock
    tickClock();
    setInterval(tickClock, 1000);

    // Logout
    document.getElementById('adminLogoutBtn').addEventListener('click', adminLogout);

    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('adminSidebar').classList.toggle('show');
        });
    }

    // Forms
    document.getElementById('editUserForm').addEventListener('submit', submitEditUser);
    document.getElementById('courseForm').addEventListener('submit', submitCourse);
    document.getElementById('skillGradeForm').addEventListener('submit', submitSkillGrade);

    // Load initial section data
    loadDashboardStats();
    loadUsers();
    loadCourses();
    loadSkills();
});

// ============================================================
//  AUTH HELPERS
// ============================================================
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
    };
}

function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = 'admin-login.html';
}

// ============================================================
//  SECTION NAVIGATION
// ============================================================
function showAdminSection(name, link) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    // Remove active from all nav links
    document.querySelectorAll('.admin-nav').forEach(l => l.classList.remove('active'));

    const section = document.getElementById(`admin-section-${name}`);
    if (section) section.classList.add('active');
    if (link) link.classList.add('active');

    // Lazy-load analytics charts when tab opened
    if (name === 'analytics') {
        loadAnalytics();
    }

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        document.getElementById('adminSidebar').classList.remove('show');
    }
    return false;
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fa-circle-check', danger: 'fa-circle-xmark', info: 'fa-circle-info' };
    const colors = { success: '#10b981', danger: '#ef4444', info: '#00cec9' };
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info}" style="color:${colors[type]};font-size:1.2rem;flex-shrink:0;"></i>
        <span class="fw-bold small">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ============================================================
//  CLOCK
// ============================================================
function tickClock() {
    const el = document.getElementById('adminClock');
    if (el) {
        el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}

// ============================================================
//  API WRAPPER
// ============================================================
async function apiGet(url) {
    const res = await fetch(API + url, { headers: getHeaders() });
    if (res.status === 401 || res.status === 403) { adminLogout(); return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function apiPost(url, body) {
    const res = await fetch(API + url, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'POST failed');
    return data;
}

async function apiPut(url, body) {
    const res = await fetch(API + url, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'PUT failed');
    return data;
}

async function apiDelete(url) {
    const res = await fetch(API + url, { method: 'DELETE', headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'DELETE failed');
    return data;
}

// ============================================================
//  CHART HELPERS
// ============================================================
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

const CHART_DEFAULTS = {
    color: '#94a3b8',
    font: { family: "'Space Grotesk', sans-serif", size: 12 },
};

function makeLineChart(canvasId, labels, datasets) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: CHART_DEFAULTS.font } } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8' } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', precision: 0 } }
            }
        }
    });
}

function makeBarChart(canvasId, labels, datasets) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: CHART_DEFAULTS.font } } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8' } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', precision: 0 } }
            }
        }
    });
}

function makeDoughnutChart(canvasId, labels, data, colors) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data, backgroundColor: colors,
                borderColor: 'rgba(15,23,42,0.8)', borderWidth: 3,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: CHART_DEFAULTS.font, padding: 14, boxWidth: 14 } }
            }
        }
    });
}

// ============================================================
//  UTILITIES
// ============================================================
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function gradeBadge(g) {
    if (!g || g === 'N/A') return `<span class="grade-badge grade-NA">N/A</span>`;
    return `<span class="grade-badge grade-${g}">${g}</span>`;
}

function roleBadge(role) {
    const map = {
        admin: 'bg-danger-glow',
        instructor: 'bg-primary-glow',
        user: 'bg-success-glow',
    };
    return `<span class="badge ${map[role] || 'bg-primary-glow'} text-capitalize">${role}</span>`;
}

function statusBadge(status) {
    if (status === 'inactive') return `<span class="status-inactive"><i class="fa-solid fa-circle-xmark me-1"></i>Inactive</span>`;
    return `<span class="status-active"><i class="fa-solid fa-circle-check me-1"></i>Active</span>`;
}

function tradeBadge(status) {
    const map = {
        completed: 'bg-success-glow',
        accepted: 'bg-primary-glow',
        pending: 'bg-warning-glow',
        rejected: 'bg-danger-glow',
    };
    return `<span class="badge ${map[status] || 'bg-primary-glow'} text-capitalize">${status}</span>`;
}

function buildPagination(containerEl, infoEl, total, currentPage, onPageChange) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, total);
    infoEl.textContent = total > 0 ? `Showing ${start}–${end} of ${total}` : 'No results';

    containerEl.innerHTML = '';
    if (totalPages <= 1) return;

    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">‹</a>`;
    prevLi.addEventListener('click', (e) => { e.preventDefault(); if (currentPage > 1) onPageChange(currentPage - 1); });
    containerEl.appendChild(prevLi);

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        li.addEventListener('click', (e) => { e.preventDefault(); onPageChange(i); });
        containerEl.appendChild(li);
    }

    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">›</a>`;
    nextLi.addEventListener('click', (e) => { e.preventDefault(); if (currentPage < totalPages) onPageChange(currentPage + 1); });
    containerEl.appendChild(nextLi);
}

// ============================================================
//  DASHBOARD STATS
// ============================================================
async function loadDashboardStats() {
    try {
        const data = await apiGet('/api/admin/analytics/overview');
        if (!data) return;
        analyticsData = data;
        renderDashboardStats(data);
        renderDashboardCharts(data);
    } catch (err) {
        showToast('Failed to load dashboard: ' + err.message, 'danger');
    }
}

function renderDashboardStats(data) {
    const row = document.getElementById('dashboardStatsRow');
    row.innerHTML = `
        <div class="col-md-6 col-xl-3">
            <div class="stat-card p-4" style="border-color: rgba(0,206,201,0.2);">
                <i class="fa-solid fa-users stat-bg-icon text-info"></i>
                <h6 class="text-info text-uppercase fw-bold small tracking-wide mb-2 opacity-80">Total Users</h6>
                <h2 class="display-5 fw-bold text-white mb-0 font-monospace">${data.totalUsers}</h2>
                <p class="text-muted small mt-1 mb-0">Registered accounts</p>
            </div>
        </div>
        <div class="col-md-6 col-xl-3">
            <div class="stat-card p-4" style="border-color: rgba(168,85,247,0.2);">
                <i class="fa-solid fa-graduation-cap stat-bg-icon" style="color:#a855f7;"></i>
                <h6 class="text-uppercase fw-bold small tracking-wide mb-2 opacity-80" style="color:#a855f7;">Total Courses</h6>
                <h2 class="display-5 fw-bold text-white mb-0 font-monospace">${data.totalCourses}</h2>
                <p class="text-muted small mt-1 mb-0">Knowledge modules</p>
            </div>
        </div>
        <div class="col-md-6 col-xl-3">
            <div class="stat-card p-4" style="border-color: rgba(16,185,129,0.2);">
                <i class="fa-solid fa-right-left stat-bg-icon text-success"></i>
                <h6 class="text-success text-uppercase fw-bold small tracking-wide mb-2 opacity-80">Completed Trades</h6>
                <h2 class="display-5 fw-bold text-white mb-0 font-monospace">${data.completedTrades}</h2>
                <p class="text-muted small mt-1 mb-0">of ${data.totalTrades} total</p>
            </div>
        </div>
        <div class="col-md-6 col-xl-3">
            <div class="stat-card p-4" style="border-color: rgba(245,158,11,0.2);">
                <i class="fa-solid fa-hourglass-half stat-bg-icon text-warning"></i>
                <h6 class="text-warning text-uppercase fw-bold small tracking-wide mb-2 opacity-80">Pending Trades</h6>
                <h2 class="display-5 fw-bold text-white mb-0 font-monospace">${data.pendingTrades}</h2>
                <p class="text-muted small mt-1 mb-0">Awaiting response</p>
            </div>
        </div>
    `;
}

function renderDashboardCharts(data) {
    // User Growth Line
    const ugLabels = data.userGrowth.map(m => m.month);
    const ugCounts = data.userGrowth.map(m => m.count);
    makeLineChart('userGrowthChart', ugLabels, [{
        label: 'New Users',
        data: ugCounts,
        borderColor: '#00cec9',
        backgroundColor: 'rgba(0,206,201,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#00cec9',
        pointRadius: 5,
    }]);

    // Trade Status Doughnut
    const ts = data.tradeStatus;
    const tsLabels = Object.keys(ts);
    const tsData = Object.values(ts);
    const tsColors = ['#10b981', '#a29bfe', '#f59e0b', '#ef4444'];
    makeDoughnutChart('tradeStatusChart', tsLabels, tsData, tsColors);

    // Grade Distribution Bar
    const gd = data.gradeDistribution;
    makeBarChart('gradeChart', ['A', 'B', 'C', 'D', 'E'], [{
        label: 'Skills',
        data: ['A', 'B', 'C', 'D', 'E'].map(g => gd[g] || 0),
        backgroundColor: ['rgba(16,185,129,0.7)', 'rgba(0,206,201,0.7)', 'rgba(245,158,11,0.7)', 'rgba(249,115,22,0.7)', 'rgba(239,68,68,0.7)'],
        borderRadius: 8,
        borderSkipped: false,
    }]);

    // Trade Activity Line
    const taLabels = data.tradeActivity.map(m => m.month);
    const taCounts = data.tradeActivity.map(m => m.count);
    makeLineChart('tradeActivityChart', taLabels, [{
        label: 'Trade Volume',
        data: taCounts,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168,85,247,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#a855f7',
        pointRadius: 5,
    }]);
}

// ============================================================
//  USER MANAGEMENT
// ============================================================
async function loadUsers() {
    try {
        const params = new URLSearchParams();
        const sort = document.getElementById('userSortBy')?.value;
        if (sort) params.set('sort', sort);
        const data = await apiGet(`/api/admin/users?${params}`);
        if (!data) return;
        allUsers = data;
        userPage = 1;
        filterAndRenderUsers();
        document.getElementById('userCountBadge').textContent = `${data.length} total users`;
    } catch (err) {
        showToast('Failed to load users: ' + err.message, 'danger');
    }
}

function filterAndRenderUsers() {
    const search = (document.getElementById('userSearch')?.value || '').toLowerCase();
    const role = document.getElementById('userRoleFilter')?.value || 'all';

    let filtered = allUsers.filter(u => {
        const matchSearch = !search ||
            (u.name && u.name.toLowerCase().includes(search)) ||
            (u.email && u.email.toLowerCase().includes(search));
        const matchRole = role === 'all' || u.role === role;
        return matchSearch && matchRole;
    });

    const tbody = document.getElementById('usersTableBody');
    const paged = filtered.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">
            <i class="fa-solid fa-users-slash fa-2x mb-3 d-block opacity-50"></i>No users found.
        </td></tr>`;
    } else {
        tbody.innerHTML = paged.map(u => `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <div class="bg-primary rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                             style="width:32px;height:32px;">
                            <i class="fa-solid fa-user text-white" style="font-size:0.7rem;"></i>
                        </div>
                        <div>
                            <div class="fw-bold text-white small">${escHtml(u.name)}</div>
                            <div class="text-muted font-monospace" style="font-size:0.68rem;">${u._id.slice(-8).toUpperCase()}</div>
                        </div>
                    </div>
                </td>
                <td class="text-muted small">${escHtml(u.email)}</td>
                <td>${roleBadge(u.role)}</td>
                <td class="text-center">${gradeBadge(u.skillGrade)}</td>
                <td class="text-muted small">${formatDate(u.createdAt)}</td>
                <td><span class="badge bg-primary-glow">${u.skillCount || 0} skills</span></td>
                <td class="text-center">
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn-icon btn-icon-edit" title="Edit User" onclick="openEditUser('${u._id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-icon-delete" title="Delete User" onclick="openDeleteUser('${u._id}', '${escHtml(u.name)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    buildPagination(
        document.getElementById('userPagination'),
        document.getElementById('userPaginationInfo'),
        filtered.length, userPage,
        (p) => { userPage = p; filterAndRenderUsers(); }
    );
}

function openEditUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserEmail').value = user.email;
    document.getElementById('editUserRole').value = user.role;
    new bootstrap.Modal(document.getElementById('editUserModal')).show();
}

async function submitEditUser(e) {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value;
    const email = document.getElementById('editUserEmail').value;
    const role = document.getElementById('editUserRole').value;
    try {
        await apiPut(`/api/admin/users/${id}`, { name, email, role });
        bootstrap.Modal.getInstance(document.getElementById('editUserModal'))?.hide();
        showToast('User updated successfully!', 'success');
        loadUsers();
    } catch (err) {
        showToast('Failed to update user: ' + err.message, 'danger');
    }
}

function openDeleteUser(userId, name) {
    document.getElementById('deleteModalTitle').textContent = 'Delete User';
    document.getElementById('deleteModalBody').innerHTML =
        `Are you sure you want to delete <strong class="text-white">${escHtml(name)}</strong>? All their skills and wallet data will be removed permanently.`;
    const btn = document.getElementById('confirmDeleteBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async () => {
        try {
            await apiDelete(`/api/admin/users/${userId}`);
            bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'))?.hide();
            showToast('User deleted.', 'success');
            loadUsers();
            loadDashboardStats();
        } catch (err) {
            showToast('Failed to delete user: ' + err.message, 'danger');
        }
    });
    new bootstrap.Modal(document.getElementById('confirmDeleteModal')).show();
}

// ============================================================
//  COURSE MANAGEMENT
// ============================================================
async function loadCourses() {
    try {
        const data = await apiGet('/api/admin/courses');
        if (!data) return;
        allCourses = data;
        coursePage = 1;
        filterAndRenderCourses();
    } catch (err) {
        showToast('Failed to load courses: ' + err.message, 'danger');
    }
}

function filterAndRenderCourses() {
    const search = (document.getElementById('courseSearch')?.value || '').toLowerCase();
    const filtered = allCourses.filter(c =>
        !search || (c.course_name && c.course_name.toLowerCase().includes(search))
    );
    const paged = filtered.slice((coursePage - 1) * PAGE_SIZE, coursePage * PAGE_SIZE);
    const tbody = document.getElementById('coursesTableBody');

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">
            <i class="fa-solid fa-graduation-cap fa-2x mb-3 d-block opacity-50"></i>No courses found.
        </td></tr>`;
    } else {
        tbody.innerHTML = paged.map(c => `
            <tr>
                <td>
                    <div class="fw-bold text-white small">${escHtml(c.course_name)}</div>
                </td>
                <td class="text-muted small" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escHtml(c.description || '—')}
                </td>
                <td><span class="badge bg-primary-glow">${escHtml(c.category || 'General')}</span></td>
                <td class="text-muted small">${escHtml(c.instructor || '—')}</td>
                <td class="text-end">
                    <span class="font-monospace text-warning fw-bold">${c.coin_price}</span>
                    <i class="fa-solid fa-coins text-warning ms-1 small"></i>
                </td>
                <td class="text-muted small">${formatDate(c.createdAt)}</td>
                <td class="text-center">
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn-icon btn-icon-edit" title="Edit" onclick="openEditCourse('${c._id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-icon-delete" title="Delete" onclick="openDeleteCourse('${c._id}', '${escHtml(c.course_name)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    buildPagination(
        document.getElementById('coursePagination'),
        document.getElementById('coursePaginationInfo'),
        filtered.length, coursePage,
        (p) => { coursePage = p; filterAndRenderCourses(); }
    );
}

function openAddCourse() {
    editingCourseId = null;
    document.getElementById('courseModalTitle').textContent = 'Add New Course';
    document.getElementById('saveCourseBtn').innerHTML = '<i class="fa-solid fa-bolt me-2"></i>Save Course';
    document.getElementById('courseForm').reset();
    document.getElementById('editCourseId').value = '';
    new bootstrap.Modal(document.getElementById('addCourseModal')).show();
}

function openEditCourse(courseId) {
    const course = allCourses.find(c => c._id === courseId);
    if (!course) return;
    editingCourseId = courseId;
    document.getElementById('courseModalTitle').textContent = 'Edit Course';
    document.getElementById('saveCourseBtn').innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Update Course';
    document.getElementById('editCourseId').value = courseId;
    document.getElementById('courseNameInput').value = course.course_name || '';
    document.getElementById('coursePriceInput').value = course.coin_price || 0;
    document.getElementById('courseCategoryInput').value = course.category || '';
    document.getElementById('courseInstructorInput').value = course.instructor || '';
    document.getElementById('courseDescInput').value = course.description || '';
    new bootstrap.Modal(document.getElementById('addCourseModal')).show();
}

async function submitCourse(e) {
    e.preventDefault();
    const body = {
        course_name: document.getElementById('courseNameInput').value,
        coin_price: parseFloat(document.getElementById('coursePriceInput').value),
        category: document.getElementById('courseCategoryInput').value,
        instructor: document.getElementById('courseInstructorInput').value,
        description: document.getElementById('courseDescInput').value,
    };
    try {
        if (editingCourseId) {
            await apiPut(`/api/admin/courses/${editingCourseId}`, body);
            showToast('Course updated!', 'success');
        } else {
            await apiPost('/api/admin/courses', body);
            showToast('Course created!', 'success');
        }
        bootstrap.Modal.getInstance(document.getElementById('addCourseModal'))?.hide();
        loadCourses();
        loadDashboardStats();
    } catch (err) {
        showToast('Failed to save course: ' + err.message, 'danger');
    }
}

function openDeleteCourse(courseId, name) {
    document.getElementById('deleteModalTitle').textContent = 'Delete Course';
    document.getElementById('deleteModalBody').innerHTML =
        `Are you sure you want to delete <strong class="text-white">${escHtml(name)}</strong>? This action cannot be undone.`;
    const btn = document.getElementById('confirmDeleteBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async () => {
        try {
            await apiDelete(`/api/admin/courses/${courseId}`);
            bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'))?.hide();
            showToast('Course deleted.', 'success');
            loadCourses();
            loadDashboardStats();
        } catch (err) {
            showToast('Failed to delete course: ' + err.message, 'danger');
        }
    });
    new bootstrap.Modal(document.getElementById('confirmDeleteModal')).show();
}

// ============================================================
//  SKILL VALIDATION
// ============================================================
async function loadSkills() {
    try {
        const data = await apiGet('/api/admin/skills');
        if (!data) return;
        allSkills = data;
        skillPage = 1;
        filterAndRenderSkills();
    } catch (err) {
        showToast('Failed to load skills: ' + err.message, 'danger');
    }
}

function filterAndRenderSkills() {
    const search = (document.getElementById('skillSearch')?.value || '').toLowerCase();
    const grade = document.getElementById('skillGradeFilter')?.value || 'all';
    const type = document.getElementById('skillTypeFilter')?.value || 'all';

    const filtered = allSkills.filter(s => {
        const matchSearch = !search || (s.skill_name && s.skill_name.toLowerCase().includes(search));
        const matchGrade = grade === 'all' || s.skill_grade === grade;
        const matchType = type === 'all' || s.skill_type === type;
        return matchSearch && matchGrade && matchType;
    });

    const paged = filtered.slice((skillPage - 1) * PAGE_SIZE, skillPage * PAGE_SIZE);
    const tbody = document.getElementById('skillsTableBodyAdmin');

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted">
            <i class="fa-solid fa-star-half fa-2x mb-3 d-block opacity-50"></i>No skills found.
        </td></tr>`;
    } else {
        tbody.innerHTML = paged.map(s => {
            const userName = s.user ? escHtml(s.user.name) : '—';
            const userEmail = s.user ? escHtml(s.user.email) : '';
            const userId = s.user ? s.user._id || '' : '';
            const typeClass = s.skill_type === 'offered' ? 'bg-success-glow' : 'bg-warning-glow';
            const typeLabel = s.skill_type === 'offered' ? 'TX Offered' : 'RX Required';
            return `
                <tr>
                    <td>
                        <div class="fw-bold text-white small">${escHtml(s.skill_name)}</div>
                    </td>
                    <td>
                        <div class="text-white small">${userName}</div>
                        <div class="text-muted font-monospace" style="font-size:0.68rem;">${userEmail}</div>
                    </td>
                    <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                    <td class="text-center">${gradeBadge(s.skill_grade)}</td>
                    <td class="text-center">
                        <button class="btn btn-icon btn-icon-grade" title="Update Grade"
                                onclick="openSkillGrade('${s._id}', '${escHtml(s.skill_name)}', '${userId}', '${userName}', '${s.skill_grade}')">
                            <i class="fa-solid fa-star-half-stroke"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    buildPagination(
        document.getElementById('skillPagination'),
        document.getElementById('skillPaginationInfo'),
        filtered.length, skillPage,
        (p) => { skillPage = p; filterAndRenderSkills(); }
    );
}

function openSkillGrade(skillId, skillName, userId, userName, currentGrade) {
    document.getElementById('gradeSkillId').value = skillId;
    document.getElementById('gradeUserId').value = userId;
    document.getElementById('gradeSkillName').textContent = skillName;
    document.getElementById('gradeUserName').textContent = userName;
    document.getElementById('gradeSelect').value = currentGrade || 'C';
    new bootstrap.Modal(document.getElementById('skillGradeModal')).show();
}

async function submitSkillGrade(e) {
    e.preventDefault();
    const skillId = document.getElementById('gradeSkillId').value;
    const userId = document.getElementById('gradeUserId').value;
    const newGrade = document.getElementById('gradeSelect').value;
    try {
        await apiPut(`/api/admin/users/${userId}/skill-grade`, { skillId, newGrade });
        bootstrap.Modal.getInstance(document.getElementById('skillGradeModal'))?.hide();
        showToast(`Skill grade updated to ${newGrade}!`, 'success');
        loadSkills();
    } catch (err) {
        showToast('Failed to update grade: ' + err.message, 'danger');
    }
}

// ============================================================
//  ANALYTICS
// ============================================================
async function loadAnalytics() {
    try {
        const data = await apiGet('/api/admin/analytics/overview');
        if (!data) return;
        analyticsData = data;
        renderAnalyticsStats(data);
        renderAnalyticsCharts(data);
        await loadTrades();
    } catch (err) {
        showToast('Failed to load analytics: ' + err.message, 'danger');
    }
}

function renderAnalyticsStats(data) {
    const row = document.getElementById('analyticsStatsRow');
    row.innerHTML = `
        <div class="col-sm-6 col-xl-3">
            <div class="stat-card p-4" style="border-color:rgba(0,206,201,0.2);">
                <i class="fa-solid fa-users stat-bg-icon text-info"></i>
                <h6 class="text-info fw-bold small text-uppercase mb-2">Total Users</h6>
                <h2 class="fw-bold text-white font-monospace">${data.totalUsers}</h2>
            </div>
        </div>
        <div class="col-sm-6 col-xl-3">
            <div class="stat-card p-4" style="border-color:rgba(16,185,129,0.2);">
                <i class="fa-solid fa-circle-check stat-bg-icon text-success"></i>
                <h6 class="text-success fw-bold small text-uppercase mb-2">Completed Trades</h6>
                <h2 class="fw-bold text-white font-monospace">${data.completedTrades}</h2>
            </div>
        </div>
        <div class="col-sm-6 col-xl-3">
            <div class="stat-card p-4" style="border-color:rgba(245,158,11,0.2);">
                <i class="fa-solid fa-hourglass-half stat-bg-icon text-warning"></i>
                <h6 class="text-warning fw-bold small text-uppercase mb-2">Pending Trades</h6>
                <h2 class="fw-bold text-white font-monospace">${data.pendingTrades}</h2>
            </div>
        </div>
        <div class="col-sm-6 col-xl-3">
            <div class="stat-card p-4" style="border-color:rgba(168,85,247,0.2);">
                <i class="fa-solid fa-graduation-cap stat-bg-icon" style="color:#a855f7;"></i>
                <h6 class="fw-bold small text-uppercase mb-2" style="color:#a855f7;">Total Courses</h6>
                <h2 class="fw-bold text-white font-monospace">${data.totalCourses}</h2>
            </div>
        </div>
    `;
}

function renderAnalyticsCharts(data) {
    // Monthly bar chart
    const taLabels = data.tradeActivity.map(m => m.month);
    const taCounts = data.tradeActivity.map(m => m.count);
    makeBarChart('analyticsTradeBarChart', taLabels, [{
        label: 'Trades',
        data: taCounts,
        backgroundColor: 'rgba(168,85,247,0.6)',
        borderColor: '#a855f7',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
    }]);

    // Grade doughnut
    const gd = data.gradeDistribution;
    makeDoughnutChart(
        'analyticsGradeDoughnutChart',
        ['A — Expert', 'B — Advanced', 'C — Intermediate', 'D — Beginner', 'E — Needs Improvement'],
        ['A', 'B', 'C', 'D', 'E'].map(g => gd[g] || 0),
        ['rgba(16,185,129,0.8)', 'rgba(0,206,201,0.8)', 'rgba(245,158,11,0.8)', 'rgba(249,115,22,0.8)', 'rgba(239,68,68,0.8)']
    );
}

async function loadTrades() {
    try {
        const data = await apiGet('/api/admin/trades');
        if (!data) return;
        allTrades = data;
        document.getElementById('tradesTotalBadge').textContent = `${data.length} trades`;
        const tbody = document.getElementById('tradesTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted">No trades found.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map(t => `
            <tr>
                <td class="font-monospace text-muted" style="font-size:0.7rem;">${t._id.slice(-10).toUpperCase()}</td>
                <td class="text-white small">${t.requester ? escHtml(t.requester.name || '—') : '—'}</td>
                <td class="text-white small">${t.receiver ? escHtml(t.receiver.name || '—') : '—'}</td>
                <td class="text-muted small" style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escHtml(t.skills_exchanged || '—')}
                </td>
                <td class="text-center">${tradeBadge(t.status)}</td>
                <td class="text-muted small">${formatDate(t.createdAt)}</td>
            </tr>
        `).join('');
    } catch (err) {
        showToast('Failed to load trades: ' + err.message, 'danger');
    }
}

// ============================================================
//  SETTINGS HELPERS
// ============================================================
function exportUsers() {
    if (!allUsers.length) {
        showToast('No user data to export. Load users first.', 'info');
        return;
    }
    const safeData = allUsers.map(({ _id, name, email, role, skillGrade, skillCount, createdAt }) =>
        ({ _id, name, email, role, skillGrade, skillCount, createdAt })
    );
    const blob = new Blob([JSON.stringify(safeData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ananta_users_${Date.now()}.json`;
    a.click();
    showToast('User data exported successfully!', 'success');
}

// ============================================================
//  SECURITY: HTML escape
// ============================================================
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
