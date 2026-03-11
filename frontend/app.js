// Backend selection: default to hosted, but prefer local if reachable.
const LOCAL_BASE = 'http://localhost:3000/api';
const HOSTED_BASE = 'https://anata-backend.onrender.com/api';
let API_URL = HOSTED_BASE; // start with hosted backend to avoid waiting
//done

// Quick health check to detect a running local backend and switch to it if available.
(async function detectLocalBackend() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        const healthUrl = LOCAL_BASE.replace('/api', '') + '/api/health';
        const res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res && res.ok) {
            API_URL = LOCAL_BASE;
            console.info('API: using local backend at', API_URL);
        } else {
            console.info('API: falling back to hosted backend', HOSTED_BASE);
        }
    } catch (err) {
        console.info('API: local backend not reachable, using hosted backend', HOSTED_BASE);
    }
})();

// Utility: Show Alert
function showAlert(message, type = 'danger', elementId = 'alertBox') {
    const alertBox = document.getElementById(elementId);
    if (alertBox) {
        alertBox.className = `alert alert-${type} alert-dismissible fade show`;
        alertBox.innerHTML = `${message} <button type="button" class="btn-close" onclick="this.parentElement.classList.add('d-none')"></button>`;
        alertBox.classList.remove('d-none');
        setTimeout(() => alertBox.classList.add('d-none'), 5000);
    } else {
        alert(message);
    }
}

// Global Headers with Auth
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

// Authentication Forms Logics
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = 'dashboard.html';
            } else {
                showAlert(data.message || data.error);
            }
        } catch (err) {
            showAlert('Failed to connect to server.');
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, password })
            });
            const data = await res.json();

            if (res.ok) {
                showAlert('Registration successful! Please login.', 'success');
                setTimeout(() => window.location.href = 'login.html', 2000);
            } else {
                showAlert(data.error);
            }
        } catch (err) {
            showAlert('Failed to register.');
        }
    });
}

// -----------------------------------------------------
// Dashboard Logics
// -----------------------------------------------------

function showSection(sectionId, clickedEl) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.add('d-none'));
    // Show target section
    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) targetSection.classList.remove('d-none');

    // Update nav active state
    document.querySelectorAll('.dashboard-nav').forEach(nav => nav.classList.remove('active'));
    if (clickedEl) {
        clickedEl.classList.add('active');
    } else {
        // Try to find the nav item for this section via onclick attribute
        const navEl = document.querySelector(`.dashboard-nav[onclick*="'${sectionId}'"]`);
        if (navEl) navEl.classList.add('active');
    }

    // Load necessary data based on section
    if (sectionId === 'profile') loadProfile();
    if (sectionId === 'matching') loadMatches();
    if (sectionId === 'discovery') loadDiscovery();
    if (sectionId === 'trades') loadTrades();
    if (sectionId === 'wallet') loadWallet();
    if (sectionId === 'courses') loadCourses();
    if (sectionId === 'chat-history') loadChatHistory();
    if (sectionId === 'admin') loadAdminUsers();
}

async function initDashboard() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);

    document.getElementById('navUserName').innerText = user.name;

    if (user.role === 'admin') {
        document.getElementById('adminNav').classList.remove('d-none');
    }

    // Load initial data
    await Promise.all([loadWallet(), loadTradesOverview()]);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}

// Profile & Skills
async function loadProfile() {
    try {
        const [profileRes, walletRes, tradesRes] = await Promise.all([
            fetch(`${API_URL}/profile`, { headers: getAuthHeaders() }),
            fetch(`${API_URL}/wallet`, { headers: getAuthHeaders() }),
            fetch(`${API_URL}/trades`, { headers: getAuthHeaders() })
        ]);

        const profileData = await profileRes.json();
        const walletData = walletRes.ok ? await walletRes.json() : { total_coins: 0 };
        const tradesData = tradesRes.ok ? await tradesRes.json() : [];

        if (profileRes.ok) {
            document.getElementById('profileName').innerHTML = `${profileData.user.name} <i class="fa-solid fa-circle-check text-success fs-5" title="Verified Node"></i>`;
            document.getElementById('profileEmail').innerText = profileData.user.email;
            document.getElementById('profileRole').innerText = profileData.user.role.toUpperCase();

            // Stats
            const completedTrades = tradesData.filter(t => t.status === 'completed').length;
            document.getElementById('profileStatTrades').innerText = completedTrades;
            document.getElementById('profileStatCoins').innerText = walletData.total_coins;
            document.getElementById('profileStatSkills').innerText = profileData.skills.length;

            // Achievements Logic (Fetch from API)
            try {
                const achRes = await fetch(`${API_URL}/achievements`, { headers: getAuthHeaders() });
                if (achRes.ok) {
                    const achs = await achRes.json();
                    let achHTML = '';
                    achs.forEach(a => {
                        const icon = a.type.includes('Exchange') ? 'fa-handshake' : 'fa-trophy';
                        achHTML += `
                            <div class="badge bg-success-glow border border-success border-opacity-25 p-2 px-3 rounded-pill mb-1 me-1 hover-glow cursor-help" title="${a.description}">
                                <i class="fa-solid ${icon} me-1 text-success"></i> ${a.type}
                                ${a.rating ? `<span class="ms-1 opacity-50 small">★${a.rating}</span>` : ''}
                            </div>`;
                    });
                    if (achHTML) document.getElementById('profileAchievements').innerHTML = achHTML;
                }
            } catch (achErr) { console.error('Achievements fetch failed'); }

            renderSkillsBadges(profileData.skills);
        }
    } catch (err) {
        console.error(err);
    }
}

function renderSkillsBadges(skills) {
    const offeredCont = document.getElementById('skillsOfferedContainer');
    const requiredCont = document.getElementById('skillsRequiredContainer');

    let offeredHTML = '';
    let requiredHTML = '';

    skills.forEach(skill => {
        // Different styling based on grade
        let gradeClass = 'bg-secondary';
        let gradeLabel = 'Base';
        if (skill.skill_grade === 'A') { gradeClass = 'bg-accent text-dark'; gradeLabel = 'Expert'; }
        else if (skill.skill_grade === 'B') { gradeClass = 'bg-primary text-white'; gradeLabel = 'Adv'; }
        else if (skill.skill_grade === 'C') { gradeClass = 'bg-info text-dark'; gradeLabel = 'Inter'; }
        else if (skill.skill_grade === 'D') { gradeClass = 'bg-warning text-dark'; gradeLabel = 'Beg'; }

        const badgeHTML = `
            <div class="d-inline-block border border-secondary border-opacity-50 rounded-pill p-1 pe-3 bg-dark bg-opacity-50 hover-glow transition-all mb-1" style="cursor: default;">
                <span class="badge rounded-pill ${gradeClass} ms-1 me-2" title="${gradeLabel}">Class ${skill.skill_grade}</span>
                <span class="fw-bold text-white small">${skill.skill_name}</span>
            </div>
        `;

        if (skill.skill_type === 'offered') offeredHTML += badgeHTML;
        else requiredHTML += badgeHTML;
    });

    if (offeredCont) offeredCont.innerHTML = offeredHTML || '<span class="text-muted small font-monospace">No capabilities installed...</span>';
    if (requiredCont) requiredCont.innerHTML = requiredHTML || '<span class="text-muted small font-monospace">No requirements logged...</span>';
}

const addSkillForm = document.getElementById('addSkillForm');
if (addSkillForm) {
    addSkillForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const skill_name = document.getElementById('skillName').value;
        const skill_type = document.getElementById('skillType').value;
        const skill_grade = document.getElementById('skillGrade').value;

        try {
            const res = await fetch(`${API_URL}/skills`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ skill_name, skill_type, skill_grade })
            });
            if (res.ok) {
                showAlert('Skill added!', 'success', 'alertBoxDash');
                addSkillForm.reset();
                loadProfile();
            } else {
                const text = await res.json();
                showAlert(text.error, 'danger', 'alertBoxDash');
            }
        } catch (err) {
            showAlert('Failed to add skill', 'danger', 'alertBoxDash');
        }
    });
}

// Matching
async function loadMatches() {
    const container = document.getElementById('matchesContainer');
    container.innerHTML = `<div class="col-12 text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;

    try {
        const res = await fetch(`${API_URL}/matches`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok) {
            container.innerHTML = '';
            if (data.matches && data.matches.length > 0) {
                data.matches.forEach(match => {
                    const scoreColor = match.score >= 80 ? 'text-accent' : (match.score >= 50 ? 'text-info' : 'text-warning');
                    const badgeClass = match.score >= 85 ? 'bg-accent' : (match.score >= 60 ? 'bg-primary' : 'bg-secondary');

                    container.innerHTML += `
                        <div class="col-md-6 col-lg-4">
                            <div class="glass-card shadow-sm border-0 rounded-4 h-100 p-4 position-relative border-opacity-25 hover-glow transition-all">
                                <span class="position-absolute top-0 end-0 mt-3 me-3 badge ${badgeClass}">${match.match_type}</span>
                                <div class="mb-3">
                                    <h5 class="fw-bold mb-1 text-white">${match.name}</h5>
                                    <div class="d-flex align-items-center mb-2">
                                        <div class="progress flex-grow-1 bg-dark border border-secondary" style="height: 6px;">
                                            <div class="progress-bar bg-gradient-accent" role="progressbar" style="width: ${match.score}%"></div>
                                        </div>
                                        <span class="ms-2 small font-monospace ${scoreColor}">${match.score}% Sync</span>
                                    </div>
                                    <p class="text-muted small mb-1">Target Capability: <strong class="text-white">${match.skill_name}</strong> (Grade ${match.skill_grade})</p>
                                    <p class="text-accent small opacity-75">Matched on: "${match.matched_on}"</p>
                                </div>
                                <button class="btn btn-outline-glow btn-sm rounded-pill w-100 mt-2 fw-bold" onclick="openTradeModal('${match.user_id}', '${match.name}', '${match.skill_name}')">Initiate Handshake</button>
                            </div>
                        </div>
                    `;
                });
            } else {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-satellite-slash fa-3x mb-3 opacity-25"></i><p>${data.message || 'No neural matches found in this sector.'}</p></div>`;
            }
        }
    } catch (err) {
        container.innerHTML = `<div class="col-12 text-center text-danger">Failed to load matches.</div>`;
    }
}

async function loadDiscovery() {
    const container = document.getElementById('discoveryContainer');
    container.innerHTML = `<div class="col-12 text-center py-5"><div class="spinner-border text-accent" role="status"></div></div>`;

    try {
        const res = await fetch(`${API_URL}/users/discover`, { headers: getAuthHeaders() });
        const users = await res.json();

        if (res.ok) {
            container.innerHTML = '';
            users.forEach(u => {
                const skillsList = u.skills ? u.skills.split(',').map(s => `<span class="badge bg-dark border border-secondary me-1 mb-1">${s}</span>`).join('') : '<span class="text-muted small">No hardware listed</span>';
                container.innerHTML += `
                    <div class="col-md-6 col-lg-4">
                        <div class="glass-card shadow-sm border-0 rounded-4 h-100 p-4 hover-glow transition-all">
                            <div class="d-flex align-items-center mb-3">
                                <div class="bg-primary bg-opacity-25 rounded-circle p-2 me-3">
                                    <i class="fa-solid fa-user-gear text-primary"></i>
                                </div>
                                <div>
                                    <h6 class="fw-bold mb-0 text-white">${u.name}</h6>
                                    <span class="badge bg-secondary x-small">${u.role.toUpperCase()}</span>
                                </div>
                            </div>
                            <div class="mb-3">
                                <p class="text-muted small mb-2 text-uppercase tracking-wide">Capabilities</p>
                                <div class="d-flex flex-wrap">${skillsList}</div>
                            </div>
                            <button class="btn btn-outline-primary btn-sm rounded-pill w-100 mt-auto" onclick="openTradeModal('${u.user_id}', '${u.name}', 'General Exchange')">Connect Node</button>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        container.innerHTML = `<div class="col-12 text-center text-danger">Discovery protocol failed.</div>`;
    }
}

function openTradeModal(partnerId, partnerName, skillName) {
    document.getElementById('tradePartnerId').value = partnerId;
    document.getElementById('tradePartnerName').innerText = partnerName;
    document.getElementById('tradeSkillName').innerText = skillName;
    const modal = new bootstrap.Modal(document.getElementById('requestTradeModal'));
    modal.show();
}

const tradeReqForm = document.getElementById('tradeReqForm');
if (tradeReqForm) {
    tradeReqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const receiver_id = document.getElementById('tradePartnerId').value;
        const skills_exchanged = document.getElementById('tradeDetails').value;

        try {
            const res = await fetch(`${API_URL}/trades`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ receiver_id, skills_exchanged })
            });
            if (res.ok) {
                showAlert('Trade Request Sent!', 'success', 'alertBoxDash');
                bootstrap.Modal.getInstance(document.getElementById('requestTradeModal')).hide();
                tradeReqForm.reset();
                loadTradesOverview(); // update dashboard
            }
        } catch (err) {
            showAlert('Failed to send request.', 'danger', 'alertBoxDash');
        }
    });
}

// Trades
async function loadTrades() {
    const pendingContainer = document.getElementById('pendingTradesContainer');
    const allTbody = document.getElementById('allTradesTableBody');

    pendingContainer.innerHTML = '';
    allTbody.innerHTML = '';

    try {
        const res = await fetch(`${API_URL}/trades`, { headers: getAuthHeaders() });
        const trades = await res.json();
        const user = JSON.parse(localStorage.getItem('user'));

        trades.forEach(t => {
            const isRequester = t.requester_id === user.id;
            const partnerName = isRequester ? t.receiver_name : t.requester_name;

            // All Trades Table Row
            let statusBadge = '';
            if (t.status === 'pending') statusBadge = '<span class="badge bg-warning text-dark">Pending</span>';
            else if (t.status === 'accepted') statusBadge = '<span class="badge bg-primary">In Progress</span>';
            else if (t.status === 'completed') statusBadge = '<span class="badge bg-success">Completed</span>';
            else statusBadge = '<span class="badge bg-danger">Rejected</span>';

            allTbody.innerHTML += `
                <tr>
                    <td class="small text-muted font-monospace">#${t.trade_id}</td>
                    <td class="fw-bold">${partnerName}</td>
                    <td class="small">${t.skills_exchanged}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;

            // Pending/Action Trades UI
            if (t.status === 'pending' && !isRequester) {
                // I received request, I need to accept
                pendingContainer.innerHTML += `
                    <div class="col-md-6">
                        <div class="glass-card shadow-sm border-0 rounded-4 p-4 border-warning border-opacity-25">
                            <h6 class="fw-bold text-warning mb-2"><i class="fa-solid fa-bell me-1"></i> New Request</h6>
                            <p class="mb-1">From: <strong>${partnerName}</strong></p>
                            <p class="text-muted small mb-3">"${t.skills_exchanged}"</p>
                            <div class="d-flex gap-2">
                                <button class="btn btn-primary btn-sm rounded-pill fw-bold" onclick="acceptTrade('${t.trade_id}')">Accept</button>
                                <button class="btn btn-outline-danger btn-sm rounded-pill fw-bold" onclick="rejectTrade('${t.trade_id}')">Reject</button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (t.status === 'accepted') {
                // Trade is active, anyone can complete it (simplification for platform demo)
                pendingContainer.innerHTML += `
                    <div class="col-md-6">
                        <div class="glass-card shadow-sm border-0 rounded-4 p-4 border-success border-opacity-25">
                            <h6 class="fw-bold text-success mb-2"><i class="fa-solid fa-spinner fa-spin me-1"></i> Trade In Progress</h6>
                            <p class="mb-1">Partner: <strong>${partnerName}</strong></p>
                            <div class="d-flex gap-2 mt-2">
                                <button class="btn btn-accent btn-sm rounded-pill fw-bold" onclick="openChatModal('${t.trade_id}', '${partnerName}')"><i class="fa-solid fa-comments me-1"></i> Secure Chat</button>
                                <button class="btn btn-success btn-sm rounded-pill fw-bold" onclick="openCompleteModal('${t.trade_id}')"><i class="fa-solid fa-check me-1"></i> Finalize</button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (t.status === 'completed') {
                pendingContainer.innerHTML += `
                    <div class="col-md-6">
                        <div class="glass-card shadow-sm border-0 rounded-4 p-4 border-info border-opacity-25">
                            <h6 class="fw-bold text-info mb-2"><i class="fa-solid fa-star me-1"></i> Trade Completed</h6>
                            <p class="mb-1">Partner: <strong>${partnerName}</strong></p>
                            <button class="btn btn-outline-info btn-sm rounded-pill mt-2" onclick="openReviewModal('${t.trade_id}')">Leave a Review</button>
                        </div>
                    </div>
                `;
            }
        });

        if (pendingContainer.innerHTML === '') {
            pendingContainer.innerHTML = `<div class="col-12 text-muted fw-bold">No pending actions required.</div>`;
        }

    } catch (err) {
        console.error(err);
    }
}

async function acceptTrade(tradeId) {
    try {
        const res = await fetch(`${API_URL}/trades/${tradeId}/accept`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showAlert('Trade Accepted!', 'success', 'alertBoxDash');
            loadTrades();
            loadTradesOverview();
        }
    } catch (err) {
        showAlert('Error accepting trade', 'danger', 'alertBoxDash');
    }
}

async function rejectTrade(tradeId) {
    if (confirm('Are you sure you want to reject this request?')) {
        try {
            const res = await fetch(`${API_URL}/trades/${tradeId}/reject`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                showAlert('Trade Rejected.', 'warning', 'alertBoxDash');
                loadTrades();
                loadTradesOverview();
            }
        } catch (err) {
            showAlert('Error rejecting trade', 'danger', 'alertBoxDash');
        }
    }
}

function openCompleteModal(tradeId) {
    document.getElementById('completeTradeId').value = tradeId;
    new bootstrap.Modal(document.getElementById('completeTradeModal')).show();
}

const completeTradeForm = document.getElementById('completeTradeForm');
if (completeTradeForm) {
    completeTradeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tradeId = document.getElementById('completeTradeId').value;
        const duration_days = document.getElementById('tradeDuration').value;
        const skill_grade = document.getElementById('tradeFinalGrade').value;
        const satisfaction = document.getElementById('tradeSatisfaction').value;

        try {
            const res = await fetch(`${API_URL}/trades/${tradeId}/complete`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ duration_days, skill_grade, satisfaction })
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(`Trade Completed! Earned ${data.coinsAwared} Coins!`, 'success', 'alertBoxDash');
                bootstrap.Modal.getInstance(document.getElementById('completeTradeModal')).hide();
                loadTrades();
                loadWallet();
                loadTradesOverview();
            } else {
                showAlert(data.error || 'Error', 'danger', 'alertBoxDash');
            }
        } catch (err) {
            console.error(err);
        }
    });
}

// Reviews
function openReviewModal(tradeId) {
    document.getElementById('reviewTradeId').value = tradeId;
    new bootstrap.Modal(document.getElementById('reviewModal')).show();
}

const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const trade_id = document.getElementById('reviewTradeId').value;
        const rating = document.getElementById('reviewRating').value;
        const comment = document.getElementById('reviewComment').value;

        try {
            const res = await fetch(`${API_URL}/reviews`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ trade_id, rating, comment })
            });
            if (res.ok) {
                showAlert('Review Submitted Successfully!', 'success', 'alertBoxDash');
                bootstrap.Modal.getInstance(document.getElementById('reviewModal')).hide();
                reviewForm.reset();
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to submit review.', 'danger', 'alertBoxDash');
            }
        } catch (err) {
            console.error(err);
        }
    });
}

// Wallet
async function loadWallet() {
    try {
        const res = await fetch(`${API_URL}/wallet`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('navWalletBalance').innerText = data.total_coins;

            const walletMain = document.getElementById('walletMainBalance');
            if (walletMain) walletMain.innerText = data.total_coins;

            const storeBal = document.getElementById('storeWalletBal');
            if (storeBal) storeBal.innerText = data.total_coins;

            const wEarned = document.getElementById('walletEarned');
            if (wEarned) wEarned.innerText = data.earned_coins;

            const wUsed = document.getElementById('walletUsed');
            if (wUsed) wUsed.innerText = data.used_coins;

            // Also update Dashboard Total Coins
            const dashCoins = document.getElementById('dashTotalCoins');
            if (dashCoins) dashCoins.innerText = data.total_coins;
        }
    } catch (err) {
        console.error(err);
    }
}

// Dashboard Overview Data (Simple aggregation from trades)
async function loadTradesOverview() {
    try {
        const res = await fetch(`${API_URL}/trades`, { headers: getAuthHeaders() });
        const trades = await res.json();
        if (res.ok) {
            const completed = trades.filter(t => t.status === 'completed').length;
            const pending = trades.filter(t => t.status === 'pending').length;

            document.getElementById('dashCompletedTrades').innerText = completed;
            document.getElementById('dashPendingTrades').innerText = pending;
        }
    } catch (err) {
        console.error(err);
    }
}

// Courses
async function loadCourses() {
    const container = document.getElementById('coursesContainer');
    try {
        const [coursesRes, myCoursesRes] = await Promise.all([
            fetch(`${API_URL}/courses`),
            fetch(`${API_URL}/my-courses`, { headers: getAuthHeaders() })
        ]);
        
        const courses = await coursesRes.json();
        const myCourses = await myCoursesRes.json();
        const myCourseIds = myCourses.map(mc => mc.course_id);

        container.innerHTML = '';
        courses.forEach(c => {
            const isOwned = myCourseIds.includes(c._id);
            const statusLabel = isOwned ? 
                '<span class="badge bg-success-glow rounded-pill px-3 py-1" style="font-size:0.6rem;"><i class="fa-solid fa-unlock me-1"></i>Accessible Now</span>' : 
                '<span class="badge bg-warning-glow rounded-pill px-3 py-1" style="font-size:0.6rem;"><i class="fa-solid fa-lock me-1"></i>Locked</span>';
            
            const actionBtn = isOwned ? 
                `<button class="btn btn-primary rounded-pill py-2 px-4 fw-bold" onclick="showAlert('Module already synchronized.', 'info', 'alertBoxDash')">Open Module</button>` :
                `<button class="btn btn-outline-glow rounded-pill py-2 px-4 fw-bold" onclick="buyCourse('${c._id}', ${c.coin_price})">Download Module</button>`;

            container.innerHTML += `
                <div class="col-md-6 col-lg-4">
                    <div class="glass-card shadow-sm border-0 rounded-4 h-100 overflow-hidden d-flex flex-column border-purple border-opacity-25">
                        <div class="bg-gradient text-white p-4 text-center border-bottom border-secondary border-opacity-25" style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%);">
                            <i class="fa-solid fa-graduation-cap fa-3x mb-2 text-white opacity-75"></i>
                            <h5 class="fw-bold mb-0">${c.course_name}</h5>
                            <div class="mt-2">${statusLabel}</div>
                        </div>
                        <div class="card-body p-4 d-flex flex-column flex-grow-1 bg-dark bg-opacity-50">
                            <p class="text-muted small mb-4 flex-grow-1">${c.description}</p>
                            <div class="d-flex justify-content-between align-items-center mt-auto">
                                <span class="fw-bold text-warning font-monospace fs-5"><i class="fa-solid fa-coins me-1 text-warning"></i>${c.coin_price}</span>
                                ${actionBtn}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        if (courses.length === 0) {
            container.innerHTML = `<div class="col-12 text-muted fw-bold text-center">No modules available logic nodes.</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="col-12 text-danger text-center">Failed to load modules.</div>`;
    }
}

async function buyCourse(courseId, price) {
    if (confirm(`Download this learning module for ${price} Coins?`)) {
        try {
            const res = await fetch(`${API_URL}/courses/${courseId}/buy`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(data.message, 'success', 'alertBoxDash');
                loadWallet();
            } else {
                showAlert(data.error, 'danger', 'alertBoxDash');
            }
        } catch (err) {
            showAlert('Failed operation.', 'danger', 'alertBoxDash');
        }
    }
}

// Admin Panel
async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    try {
        const res = await fetch(`${API_URL}/admin/users`, { headers: getAuthHeaders() });
        const users = await res.json();

        if (res.ok) {
            tbody.innerHTML = '';
            users.forEach(u => {
                const roleBadge = u.role === 'admin' ? '<span class="badge bg-danger">ROOT</span>' : '<span class="badge bg-secondary">NODE</span>';
                tbody.innerHTML += `
                    <tr>
                        <td class="text-secondary opacity-50">#${u._id}</td>
                        <td class="fw-bold text-white">${u.name}</td>
                        <td class="text-muted">${u.email}</td>
                        <td class="text-center">${roleBadge}</td>
                    </tr>
                `;
            });
        } else {
            showAlert('Unauthorized admin area.', 'danger', 'alertBoxDash');
        }
    } catch (err) {
        console.error(err);
    }
}

const addCourseForm = document.getElementById('addCourseForm');
if (addCourseForm) {
    addCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const course_name = document.getElementById('adminCourseName').value;
        const coin_price = document.getElementById('adminCoursePrice').value;
        const description = document.getElementById('adminCourseDesc').value;

        try {
            const res = await fetch(`${API_URL}/admin/courses`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ course_name, coin_price, description })
            });
            if (res.ok) {
                showAlert('Database Module Injected!', 'success', 'alertBoxDash');
                addCourseForm.reset();
            } else {
                showAlert('Upload Failed.', 'danger', 'alertBoxDash');
            }
        } catch (err) {
            showAlert('Error uploading course.', 'danger', 'alertBoxDash');
        }
    });
}

// -----------------------------------------------------
// CHAT MESSENGER LOGIC
// -----------------------------------------------------
let chatPollInterval;

async function openChatModal(tradeId, partnerName) {
    document.getElementById('chatTradeId').value = tradeId;
    document.getElementById('chatChannelInfo').innerText = `CHANNEL: 0x${tradeId.toString(16).toUpperCase()} // NODE: ${partnerName}`;

    const messageLog = document.getElementById('messageLog');
    messageLog.innerHTML = '<div class="text-center py-5 opacity-50"><i class="fa-solid fa-sync fa-spin fa-2x"></i></div>';

    const chatModal = new bootstrap.Modal(document.getElementById('chatModal'));
    chatModal.show();

    // Start polling for new messages
    loadMessages(tradeId);
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => loadMessages(tradeId), 3000);

    // Stop polling when modal is hidden
    document.getElementById('chatModal').addEventListener('hidden.bs.modal', () => {
        clearInterval(chatPollInterval);
    }, { once: true });
}

async function loadMessages(tradeId) {
    try {
        const res = await fetch(`${API_URL}/messages/${tradeId}`, { headers: getAuthHeaders() });
        const messages = await res.json();
        const user = JSON.parse(localStorage.getItem('user'));

        if (res.ok) {
            const messageLog = document.getElementById('messageLog');
            const isAtBottom = messageLog.scrollHeight - messageLog.scrollTop <= messageLog.clientHeight + 50;

            messageLog.innerHTML = '';
            messages.forEach(msg => {
                const isMe = msg.sender_id === user.id;
                const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                messageLog.innerHTML += `
                    <div class="d-flex ${isMe ? 'justify-content-end' : 'justify-content-start'}">
                        <div class="glass-panel p-3 rounded-4 shadow-sm border-0" 
                             style="max-width: 80%; background: ${isMe ? 'rgba(0, 206, 201, 0.15)' : 'rgba(148, 163, 184, 0.1)'}; 
                                    border: 1px solid ${isMe ? 'rgba(0, 206, 201, 0.2)' : 'rgba(255, 255, 255, 0.05)'} !important;">
                            <div class="d-flex justify-content-between align-items-center mb-1 gap-3">
                                <span class="fw-bold small ${isMe ? 'text-accent' : 'text-primary'}">${isMe ? 'YOU' : msg.sender_name}</span>
                                <span class="x-small text-muted font-monospace opacity-50">${time}</span>
                            </div>
                            <div class="text-white">${msg.message_text}</div>
                        </div>
                    </div>
                `;
            });

            if (isAtBottom) {
                messageLog.scrollTop = messageLog.scrollHeight;
            }
        }
    } catch (err) {
        console.error('Chat error:', err);
    }
}

const sendMessageForm = document.getElementById('sendMessageForm');
if (sendMessageForm) {
    sendMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const trade_id = document.getElementById('chatTradeId').value;
        const message_text = document.getElementById('messageInput').value;
        const input = document.getElementById('messageInput');

        if (!message_text.trim()) return;

        try {
            const res = await fetch(`${API_URL}/messages`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ trade_id, message_text })
            });

            if (res.ok) {
                input.value = '';
                loadMessages(trade_id);
            }
        } catch (err) {
            console.error('Send error:', err);
        }
    });
}

// -----------------------------------------------------
// SECURE CHAT LOGS
// -----------------------------------------------------
let allChatLogs = [];

async function loadChatHistory() {
    const container = document.getElementById('chatHistoryContainer');
    try {
        const res = await fetch(`${API_URL}/chat/history`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok) {
            allChatLogs = data;
            renderChatHistory(data);
        }
    } catch (err) {
        container.innerHTML = `<div class="text-center py-5 text-danger">Failed to sync encrypted history logs.</div>`;
    }
}

function renderChatHistory(logs) {
    const container = document.getElementById('chatHistoryContainer');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (logs.length === 0) {
        container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa-solid fa-comment-slash fa-3x mb-3 opacity-25"></i><p>No secure transmission history found.</p></div>`;
        return;
    }

    container.innerHTML = logs.map(msg => {
        const isMe = msg.sender_id === user.id;
        const senderName = isMe ? 'YOU' : (msg.sender_name || 'Unknown Node');
        const receiverName = isMe ? (msg.receiver_name || 'Unknown Node') : 'YOU';
        const date = new Date(msg.created_at).toLocaleString();
        
        return `
            <div class="glass-panel p-3 border-secondary border-opacity-10 hover-glow">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="fw-bold small ${isMe ? 'text-accent' : 'text-primary'}">
                        ${isMe ? `<i class="fa-solid fa-arrow-up-right-dots me-1 small"></i>` : `<i class="fa-solid fa-arrow-down-left-dots me-1 small"></i>`}
                        ${senderName} <i class="fa-solid fa-caret-right mx-1 opacity-50"></i> ${receiverName}
                    </span>
                    <span class="x-small text-muted font-monospace opacity-50">${date}</span>
                </div>
                <div class="text-white small lh-base">${msg.message}</div>
            </div>
        `;
    }).join('');
}

function filterChatHistory() {
    const query = document.getElementById('chatSearch').value.toLowerCase();
    const filtered = allChatLogs.filter(log => 
        log.message.toLowerCase().includes(query) || 
        (log.sender_id.name && log.sender_id.name.toLowerCase().includes(query)) ||
        (log.receiver_id.name && log.receiver_id.name.toLowerCase().includes(query))
    );
    renderChatHistory(filtered);
}
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.getElementById('resetSubmitBtn');

        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match. Please re-enter.', 'danger', 'forgotAlertBox');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Transmitting...';

        try {
            const res = await fetch(`${API_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, newPassword })
            });
            const data = await res.json();

            if (res.ok) {
                showAlert('Security key reset successfully! You can now login with your new password.', 'success', 'forgotAlertBox');
                forgotPasswordForm.reset();
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal'));
                    if (modal) modal.hide();
                }, 3000);
            } else {
                showAlert(data.error || 'Reset failed. Email not found in the network.', 'danger', 'forgotAlertBox');
            }
        } catch (err) {
            showAlert('Connection error. Could not reach the server.', 'danger', 'forgotAlertBox');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-satellite-dish fa-fade me-2"></i> Reset Security Key';
        }
    });
}
