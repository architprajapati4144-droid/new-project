/* ==========================================================================
   ResuMind AI - Application Logic, IndexedDB Browser Database & Backend Sync
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initBrowserIndexedDB();
  initNavigation();
  initAnalyzerTabs();
  initDropZone();
  initMockInterview();
  initResumeBuilder();
  initAuth();
  checkPythonBackendStatus();
});

/* --------------------------------------------------------------------------
   1. ENTERPRISE INDEXEDDB BROWSER DATABASE ENGINE
   -------------------------------------------------------------------------- */
let dbInstance = null;
const API_BASE_URL = (window.location.protocol.startsWith('http') && !window.location.origin.startsWith('null'))
  ? window.location.origin
  : 'http://localhost:8000';
let isBackendOnline = false;

function initBrowserIndexedDB() {
  const request = indexedDB.open('ResuMindDB', 1);

  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    
    if (!db.objectStoreNames.contains('users')) {
      const userStore = db.createObjectStore('users', { keyPath: 'email' });
      userStore.createIndex('id', 'id', { unique: false });
    }

    if (!db.objectStoreNames.contains('resumes')) {
      const resumeStore = db.createObjectStore('resumes', { keyPath: 'id', autoIncrement: true });
      resumeStore.createIndex('user_email', 'user_email', { unique: false });
    }

    if (!db.objectStoreNames.contains('jd_matches')) {
      const matchStore = db.createObjectStore('jd_matches', { keyPath: 'id', autoIncrement: true });
      matchStore.createIndex('user_email', 'user_email', { unique: false });
    }

    if (!db.objectStoreNames.contains('interviews')) {
      const interviewStore = db.createObjectStore('interviews', { keyPath: 'id', autoIncrement: true });
      interviewStore.createIndex('user_email', 'user_email', { unique: false });
    }
  };

  request.onsuccess = (e) => {
    dbInstance = e.target.result;
    console.log('📦 IndexedDB Browser Database Initialized Successfully (ResuMindDB)');
  };

  request.onerror = (e) => {
    console.warn('IndexedDB Error:', e.target.errorCode);
  };
}

async function checkPythonBackendStatus() {
  try {
    let res = await fetch(`${API_BASE_URL}/api/status`, { method: 'GET' }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${API_BASE_URL}/`, { method: 'GET' }).catch(() => null);
    }
    if (res && res.ok) {
      isBackendOnline = true;
      const data = await res.json().catch(() => ({ database: "SQLite", backend_ai: "Active", status: "online" }));
      console.log('🐍 Python SQLite Backend Connected:', data.database || 'Connected');
      updateAiStatusUI(data.backend_ai === "Active" || data.status === "online");

      // Sync profile history if logged in
      const savedUserEmail = localStorage.getItem('RESUMIND_CURRENT_USER');
      if (savedUserEmail) {
        try {
          const profRes = await fetch(`${API_BASE_URL}/api/user/profile/${savedUserEmail}`);
          if (profRes.ok) {
            const profile = await profRes.json();
            currentUser = {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              role: profile.target_role,
              experience_level: profile.experience_level || 'Mid-Level (2-5 yrs)',
              target_industry: profile.target_industry || 'Tech & Software Products',
              target_skills: profile.target_skills || '',
              initials: profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
              audits: profile.audits || [],
              jd_matches: profile.jd_matches || [],
              interviews: profile.interviews || []
            };
            updateUserUI();
          }
        } catch (e) {
          console.warn("Could not sync profile from server");
        }
      }
    } else {
      isBackendOnline = false;
      updateAiStatusUI(false);
    }
  } catch (e) {
    isBackendOnline = false;
    updateAiStatusUI(false);
  }
}

/* --------------------------------------------------------------------------
   USER AUTHENTICATION & DATABASE PERSISTENCE ENGINE
   -------------------------------------------------------------------------- */
let currentUser = null;

const DEFAULT_USERS = {
  'archit@example.com': {
    id: 1,
    email: 'archit@example.com',
    name: 'Archit Prajapati',
    role: 'Senior Full Stack Engineer',
    initials: 'AP',
    audits: [
      { id: 101, name: 'Archit_Prajapati_FullStack_2026.pdf', role: 'Senior Full Stack Engineer', score: 88, time: '2 hours ago' },
      { id: 102, name: 'Backend_Node_Developer_v2.docx', role: 'Node.js Backend Lead', score: 74, time: 'Yesterday' }
    ],
    jd_matches: [
      { job_title: 'Senior Full Stack Engineer', match_percentage: 82, created_at: new Date().toISOString() }
    ],
    interviews: [
      { role_focus: 'Senior Full Stack Engineer', round_type: 'Technical', difficulty: 'Senior', overall_score: '8.8/10', created_at: new Date().toISOString() }
    ]
  },
  'sarah@example.com': {
    id: 2,
    email: 'sarah@example.com',
    name: 'Sarah Jenkins',
    role: 'Data Scientist / AI Specialist',
    initials: 'SJ',
    audits: [
      { id: 201, name: 'Sarah_Jenkins_DataScientist.pdf', role: 'Data Scientist / ML Engineer', score: 92, time: '1 day ago' }
    ],
    jd_matches: [
      { job_title: 'Data Scientist / AI Specialist', match_percentage: 90, created_at: new Date().toISOString() }
    ],
    interviews: [
      { role_focus: 'Data Scientist / AI Specialist', round_type: 'Technical', difficulty: 'Mid-Level', overall_score: '9.2/10', created_at: new Date().toISOString() }
    ]
  }
};

function initAuth() {
  if (!localStorage.getItem('RESUMIND_USERS')) {
    localStorage.setItem('RESUMIND_USERS', JSON.stringify(DEFAULT_USERS));
  }

  const savedUserEmail = localStorage.getItem('RESUMIND_CURRENT_USER');
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS'));

  if (savedUserEmail && usersDb[savedUserEmail]) {
    currentUser = usersDb[savedUserEmail];
    if (!currentUser.jd_matches) currentUser.jd_matches = [];
    if (!currentUser.interviews) currentUser.interviews = [];
    showAppPortal(true);
  } else {
    showAppPortal(false);
  }
}

function showAppPortal(show) {
  const landingView = document.getElementById('authLandingView');
  const mainPortal = document.getElementById('mainAppPortal');
  
  if (show) {
    if (landingView) landingView.classList.add('hidden');
    if (mainPortal) mainPortal.classList.remove('hidden');
    updateUserUI();
  } else {
    if (landingView) landingView.classList.remove('hidden');
    if (mainPortal) mainPortal.classList.add('hidden');
  }
}

function switchAuthPageView(tab) {
  const loginForm = document.getElementById('pageLoginForm');
  const regForm = document.getElementById('pageRegisterForm');
  const tabLogin = document.getElementById('pageTabLogin');
  const tabReg = document.getElementById('pageTabRegister');

  if (tab === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (regForm) regForm.classList.add('hidden');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabReg) tabReg.classList.remove('active');
  } else {
    if (loginForm) loginForm.classList.add('hidden');
    if (regForm) regForm.classList.remove('hidden');
    if (tabReg) tabReg.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
  }
}

async function handlePageLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('pLoginEmail').value.trim().toLowerCase();
  const password = document.getElementById('pLoginPassword').value;
  await loginWithCredentials(email, password);
}

async function handlePageRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('pRegName').value.trim();
  const email = document.getElementById('pRegEmail').value.trim().toLowerCase();
  const password = document.getElementById('pRegPassword').value;
  const role = document.getElementById('pRegRole').value;
  const expLevel = document.getElementById('pRegExpLevel')?.value || 'Mid-Level (2-5 yrs)';
  const industry = document.getElementById('pRegIndustry')?.value || 'Tech & Software Products';
  const targetSkills = document.getElementById('pRegSkills')?.value.trim() || '';
  await registerWithCredentials(name, email, password, role, expLevel, industry, targetSkills);
}

async function loginWithCredentials(email, password) {
  const submitBtn = document.getElementById('pLoginSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
  }

  // Try Python Backend Login if server is active
  if (isBackendOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        // Fetch detailed profile immediately
        const profRes = await fetch(`${API_BASE_URL}/api/user/profile/${data.user.email}`);
        if (profRes.ok) {
          const profile = await profRes.json();
          currentUser = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.target_role,
            experience_level: profile.experience_level || 'Mid-Level (2-5 yrs)',
            target_industry: profile.target_industry || 'Tech & Software Products',
            target_skills: profile.target_skills || '',
            initials: profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
            audits: profile.audits || [],
            jd_matches: profile.jd_matches || [],
            interviews: profile.interviews || []
          };
        } else {
          currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.target_role,
            experience_level: data.user.experience_level || 'Mid-Level (2-5 yrs)',
            target_industry: data.user.target_industry || 'Tech & Software Products',
            target_skills: data.user.target_skills || '',
            initials: data.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
            audits: [],
            jd_matches: [],
            interviews: []
          };
        }
        localStorage.setItem('RESUMIND_CURRENT_USER', email);
        showAppPortal(true);
        alert(`🎉 Logged in successfully! Welcome, ${currentUser.name}.`);
        return;
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Authentication failed: ${err.detail || 'Invalid email or password.'}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Account';
        }
        return;
      }
    } catch (e) {
      console.warn("Backend auth failed, using local database fallback");
    }
  }

  // Local storage fallback
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  if (usersDb[email]) {
    currentUser = usersDb[email];
    if (!currentUser.jd_matches) currentUser.jd_matches = [];
    if (!currentUser.interviews) currentUser.interviews = [];
    localStorage.setItem('RESUMIND_CURRENT_USER', email);
    showAppPortal(true);
    alert(`🎉 Welcome back, ${currentUser.name}! Signed in successfully.`);
  } else {
    // If not found, let's create a dynamic demo user session
    const namePart = email.split('@')[0];
    const newName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    quickLogin(email, newName, 'Software Developer');
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Account';
  }
}

async function registerWithCredentials(name, email, password, role, experience_level = 'Mid-Level (2-5 yrs)', target_industry = 'Tech & Software Products', target_skills = '') {
  const submitBtn = document.getElementById('pRegisterSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
  }

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';

  // Sync with Python SQLite Database if available
  if (isBackendOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email, 
          password, 
          role, 
          experience_level, 
          target_industry, 
          target_skills 
        })
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.target_role,
          experience_level: data.user.experience_level || experience_level,
          target_industry: data.user.target_industry || target_industry,
          target_skills: data.user.target_skills || target_skills,
          initials: initials,
          audits: [],
          jd_matches: [],
          interviews: []
        };
        localStorage.setItem('RESUMIND_CURRENT_USER', email);
        showAppPortal(true);
        alert(`✨ Account created in SQLite DB! Welcome, ${name}. AI services calibrated for ${role}.`);
        return;
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Registration failed: ${err.detail || 'Could not create account.'}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account & Save to Database';
        }
        return;
      }
    } catch (e) {
      console.warn('Backend registration failed, saving locally');
    }
  }

  // Save to Local DB & IndexedDB
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  usersDb[email] = { 
    id: Date.now(), 
    email, 
    name, 
    role, 
    experience_level, 
    target_industry, 
    target_skills, 
    initials, 
    audits: [], 
    jd_matches: [], 
    interviews: [] 
  };
  localStorage.setItem('RESUMIND_USERS', JSON.stringify(usersDb));
  localStorage.setItem('RESUMIND_CURRENT_USER', email);
  currentUser = usersDb[email];

  // Save to IndexedDB
  if (dbInstance) {
    const tx = dbInstance.transaction('users', 'readwrite');
    tx.objectStore('users').put(currentUser);
  }

  showAppPortal(true);
  alert(`✨ Account created successfully! Welcome, ${name}.`);

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account & Save to Database';
  }
}

function updateUserUI() {
  if (!currentUser) return;

  document.getElementById('sidebarUserName').innerText = currentUser.name;
  document.getElementById('sidebarUserRole').innerText = currentUser.role;
  document.getElementById('sidebarAvatar').innerText = currentUser.initials;

  const welcomeText = document.getElementById('welcomeUserNameText');
  if (welcomeText) welcomeText.innerText = currentUser.name.split(' ')[0];

  const pvName = document.getElementById('pvName');
  if (pvName) pvName.innerText = currentUser.name.toUpperCase();

  const pvTitle = document.getElementById('pvTitle');
  if (pvTitle) pvTitle.innerText = currentUser.role.toUpperCase();

  const authHeaderState = document.getElementById('authHeaderState');
  if (authHeaderState) {
    authHeaderState.innerHTML = `
      <div class="user-header-pill" title="Signed in as ${currentUser.email}">
        <div class="avatar-xs">${currentUser.initials}</div>
        <span class="user-name-sm">${currentUser.name}</span>
        <button class="btn-icon-xs ms-1" title="Sign Out" onclick="logoutUser()"><i class="fa-solid fa-right-from-bracket"></i></button>
      </div>
    `;
  }

  // Pre-calibrate tools to user's registered job requirements
  const resumeRoleTag = document.getElementById('resumeRoleTag');
  if (resumeRoleTag && currentUser.role) {
    resumeRoleTag.innerText = `Target: ${currentUser.role} • ${currentUser.experience_level || 'Mid-Level'}`;
  }

  const rbName = document.getElementById('rbFullName');
  if (rbName && !rbName.dataset.userEdited && currentUser.name && (!rbName.value || rbName.value === 'Archit Prajapati')) {
    rbName.value = currentUser.name;
  }
  const rbTitle = document.getElementById('rbTitle');
  if (rbTitle && !rbTitle.dataset.userEdited && currentUser.role && (!rbTitle.value || rbTitle.value === 'Senior Full Stack Software Engineer')) {
    rbTitle.value = currentUser.role;
  }
  const rbEmail = document.getElementById('rbEmail');
  if (rbEmail && !rbEmail.dataset.userEdited && currentUser.email && (!rbEmail.value || rbEmail.value === 'archit@example.com')) {
    rbEmail.value = currentUser.email;
  }
  const rbSkills = document.getElementById('rbSkills');
  if (rbSkills && !rbSkills.dataset.userEdited && currentUser.target_skills && (!rbSkills.value || rbSkills.value.startsWith('JavaScript (ES6+)'))) {
    rbSkills.value = currentUser.target_skills;
  }
  if (typeof updateResumePreview === 'function') {
    updateResumePreview();
  }

  // --------------------------------------------------------------------------
  // DYNAMIC DASHBOARD METRICS CALCULATION (OUT OF 10)
  // --------------------------------------------------------------------------
  
  // 1. Avg ATS Score
  let avgAts = 0;
  if (currentUser.audits && currentUser.audits.length > 0) {
    const sum = currentUser.audits.reduce((acc, a) => acc + (a.score || 0), 0);
    avgAts = sum / currentUser.audits.length;
  }
  const atsValOutof10 = (avgAts / 10).toFixed(1);
  const atsScoreEl = document.getElementById('dashAtsScore');
  if (atsScoreEl) atsScoreEl.innerText = `${atsValOutof10}/10`;

  // 2. Target Role Alignment Card
  const dashRoleLabel = document.getElementById('dashRoleLabel');
  if (dashRoleLabel && currentUser.role) {
    const roleParts = currentUser.role.split(' ');
    dashRoleLabel.innerText = roleParts.slice(0, 2).join(' ');
  }

  // 3. Mock Interviews Count & Trend Avg Score
  const interviewCount = currentUser.interviews ? currentUser.interviews.length : 0;
  const interviewEl = document.getElementById('dashInterviewCount');
  if (interviewEl) {
    interviewEl.innerText = `${interviewCount} Session${interviewCount === 1 ? '' : 's'}`;
  }

  let avgInterviewScore = 0;
  if (currentUser.interviews && currentUser.interviews.length > 0) {
    let sum = 0;
    let count = 0;
    currentUser.interviews.forEach(i => {
      const num = parseFloat(i.overall_score);
      if (!isNaN(num)) {
        sum += num;
        count++;
      }
    });
    if (count > 0) avgInterviewScore = sum / count;
  }
  
  const mockScoreTrend = document.querySelector('#dashInterviewCount + .trend');
  if (mockScoreTrend) {
    mockScoreTrend.innerHTML = `<i class="fa-solid fa-star text-amber"></i> Avg: ${avgInterviewScore.toFixed(1)}/10`;
  }

  // 4. Overall Interview Readiness Score (Out of 10)
  let overallPerformance = 0;
  if (avgAts > 0 && avgInterviewScore > 0) {
    overallPerformance = ((avgAts / 10) + avgInterviewScore) / 2;
  } else if (avgAts > 0) {
    overallPerformance = avgAts / 10;
  } else if (avgInterviewScore > 0) {
    overallPerformance = avgInterviewScore;
  }

  const readinessEl = document.getElementById('dashReadinessLevel');
  if (readinessEl) {
    readinessEl.innerText = `${overallPerformance.toFixed(1)}/10`;
  }

  // Readiness badge tier update
  const readinessBadge = document.querySelector('#dashReadinessLevel + .badge');
  if (readinessBadge) {
    if (overallPerformance === 0) {
      readinessBadge.className = 'badge';
      readinessBadge.style.backgroundColor = 'var(--text-dim)';
      readinessBadge.innerText = 'Not Started';
    } else if (overallPerformance < 5) {
      readinessBadge.className = 'badge';
      readinessBadge.style.backgroundColor = 'var(--status-danger)';
      readinessBadge.innerText = 'Needs Practice';
    } else if (overallPerformance < 7.5) {
      readinessBadge.className = 'badge';
      readinessBadge.style.backgroundColor = 'var(--status-warning)';
      readinessBadge.innerText = 'Getting Ready';
    } else {
      readinessBadge.className = 'badge';
      readinessBadge.style.backgroundColor = 'var(--status-success)';
      readinessBadge.innerText = 'Shortlist Tier';
    }
  }

  renderUserAudits();
}

function renderUserAudits() {
  const auditList = document.getElementById('dashboardAuditList');
  if (!auditList || !currentUser) return;

  if (!currentUser.audits || currentUser.audits.length === 0) {
    auditList.innerHTML = `
      <div class="text-center p-3 text-muted" style="font-size: 0.85rem;">
        <i class="fa-solid fa-folder-open mb-2" style="font-size: 1.5rem;"></i>
        <p>No saved resume audits yet. Run your first audit in the Resume Analyzer tab!</p>
      </div>
    `;
    return;
  }

  auditList.innerHTML = currentUser.audits.map(item => `
    <div class="audit-item">
      <div class="file-icon"><i class="fa-solid fa-file-pdf"></i></div>
      <div class="audit-info">
        <h4>${item.name}</h4>
        <span>Target: ${item.role} • ${item.time || 'Saved'}</span>
      </div>
      <div class="audit-score ${item.score >= 80 ? 'score-high' : 'score-mid'}">${item.score}</div>
    </div>
  `).join('');
}

function toggleAuthModal(show) {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.toggle('hidden', !show);
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabBtnLogin');
  const tabReg = document.getElementById('tabBtnRegister');

  if (tab === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (regForm) regForm.classList.add('hidden');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabReg) tabReg.classList.remove('active');
  } else {
    if (loginForm) loginForm.classList.add('hidden');
    if (regForm) regForm.classList.remove('hidden');
    if (tabReg) tabReg.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  await loginWithCredentials(email, password);
  toggleAuthModal(false);
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  await registerWithCredentials(name, email, password, role);
  toggleAuthModal(false);
}

function quickLogin(email, name, role) {
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (!usersDb[email]) {
    usersDb[email] = { id: Date.now(), email, name, role, initials, audits: [] };
    localStorage.setItem('RESUMIND_USERS', JSON.stringify(usersDb));
  }

  currentUser = usersDb[email];
  localStorage.setItem('RESUMIND_CURRENT_USER', email);

  showAppPortal(true);
  alert(`⚡ Quick signed in as ${name}!`);
}

function logoutUser() {
  localStorage.removeItem('RESUMIND_CURRENT_USER');
  currentUser = null;
  showAppPortal(false);
  alert('Signed out successfully.');
}


function saveUserAuditRecord(fileName, role, score) {
  if (!currentUser || currentUser.email === 'guest@example.com') return;

  const safeFileName = (typeof fileName === 'string' && fileName.trim()) ? fileName.trim() : 'My_Resume.pdf';
  const safeRole = (typeof role === 'string' && role.trim()) ? role.trim() : 'Software Engineer';
  const safeScore = (typeof score === 'number' && !isNaN(score)) ? score : (parseFloat(score) || 85);

  const newRecord = {
    name: safeFileName,
    role: safeRole,
    score: safeScore,
    time: 'Just now'
  };

  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  if (usersDb[currentUser.email]) {
    if (!usersDb[currentUser.email].audits) usersDb[currentUser.email].audits = [];
    usersDb[currentUser.email].audits.unshift(newRecord);

    localStorage.setItem('RESUMIND_USERS', JSON.stringify(usersDb));
    currentUser = usersDb[currentUser.email];
    renderUserAudits();
  }

  // Save to Browser IndexedDB safely
  if (dbInstance) {
    try {
      const tx = dbInstance.transaction('resumes', 'readwrite');
      tx.objectStore('resumes').add({
        user_email: String(currentUser.email),
        filename: String(safeFileName),
        role: String(safeRole),
        score: safeScore,
        created_at: new Date().toISOString()
      });
    } catch (idbErr) {
      console.warn('IndexedDB save resume non-fatal notice:', idbErr);
    }
  }

  // Sync to Python SQLite DB if server is active
  if (isBackendOnline && currentUser.id) {
    fetch(`${API_BASE_URL}/api/resumes/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        filename: String(safeFileName),
        raw_text: "Sample text",
        ats_score: Math.round(safeScore),
        target_role: String(safeRole)
      })
    }).catch(e => console.warn('SQLite Sync error:', e));
  }
}

function saveUserJdMatchRecord(jobTitle, matchPercentage, matchSummary, gapMatrix) {
  if (!currentUser) return;

  const newRecord = {
    job_title: jobTitle,
    match_percentage: matchPercentage,
    match_summary: matchSummary,
    gap_matrix: gapMatrix,
    created_at: new Date().toISOString()
  };

  if (!currentUser.jd_matches) currentUser.jd_matches = [];
  currentUser.jd_matches.unshift(newRecord);

  // Sync to localStorage
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  if (usersDb[currentUser.email]) {
    usersDb[currentUser.email].jd_matches = currentUser.jd_matches;
    localStorage.setItem('RESUMIND_USERS', JSON.stringify(usersDb));
  }

  // Save to IndexedDB safely
  if (dbInstance) {
    try {
      const tx = dbInstance.transaction('jd_matches', 'readwrite');
      tx.objectStore('jd_matches').add({
        user_email: String(currentUser.email),
        job_title: String(jobTitle || 'Target Position'),
        match_percentage: Number(matchPercentage) || 0,
        match_summary: String(matchSummary || ''),
        created_at: new Date().toISOString()
      });
    } catch (idbErr) {
      console.warn('IndexedDB jd_matches save notice:', idbErr);
    }
  }

  // Sync to Python SQLite DB
  if (isBackendOnline && currentUser.id) {
    fetch(`${API_BASE_URL}/api/jd-matches/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        jd_text: "Job Description details",
        match_percentage: matchPercentage,
        match_summary: matchSummary,
        gap_matrix: gapMatrix,
        job_title: jobTitle
      })
    }).catch(e => console.warn('SQLite JD Match Sync error:', e));
  }

  updateUserUI();
}

function saveUserInterviewRecord(roleFocus, roundType, difficulty, overallScore) {
  if (!currentUser) return;

  const newRecord = {
    role_focus: roleFocus,
    round_type: roundType,
    difficulty: difficulty,
    overall_score: overallScore,
    created_at: new Date().toISOString()
  };

  if (!currentUser.interviews) currentUser.interviews = [];
  currentUser.interviews.unshift(newRecord);

  // Sync to localStorage
  const usersDb = JSON.parse(localStorage.getItem('RESUMIND_USERS') || '{}');
  if (usersDb[currentUser.email]) {
    usersDb[currentUser.email].interviews = currentUser.interviews;
    localStorage.setItem('RESUMIND_USERS', JSON.stringify(usersDb));
  }

  // Save to IndexedDB safely
  if (dbInstance) {
    try {
      const tx = dbInstance.transaction('interviews', 'readwrite');
      tx.objectStore('interviews').add({
        user_email: String(currentUser.email),
        role_focus: String(roleFocus || 'Full Stack Developer'),
        round_type: String(roundType || 'Technical'),
        difficulty: String(difficulty || 'Mid-Level'),
        overall_score: String(overallScore || '8.5/10'),
        created_at: new Date().toISOString()
      });
    } catch (idbErr) {
      console.warn('IndexedDB interviews save notice:', idbErr);
    }
  }

  // Sync to Python SQLite DB
  if (isBackendOnline && currentUser.id) {
    fetch(`${API_BASE_URL}/api/interviews/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        role_focus: roleFocus,
        round_type: roundType,
        difficulty: difficulty,
        overall_score: overallScore
      })
    }).catch(e => console.warn('SQLite Interview Sync error:', e));
  }

  updateUserUI();
}

/* --------------------------------------------------------------------------
   BACKEND AI ENGINE STATUS VISUALIZER
   -------------------------------------------------------------------------- */
function updateAiStatusUI(isAiActive) {
  const dot = document.getElementById('aiStatusDot');
  const text = document.getElementById('aiStatusText');
  const sidebarModelText = document.getElementById('sidebarAiModelText');
  const sidebarProviderText = document.getElementById('sidebarAiProviderText');
  const keyStatusSpan = document.getElementById('keyStatusSpan');

  if (isAiActive) {
    if (dot) dot.className = 'dot online';
    if (text) text.innerText = 'AI Engine Connected';
    if (sidebarModelText) sidebarModelText.innerText = 'ResuMind AI Active';
    if (sidebarProviderText) sidebarProviderText.innerText = 'Secure Backend AI Gateway';
    if (keyStatusSpan) {
      keyStatusSpan.className = 'text-green';
      keyStatusSpan.innerText = 'Active (Backend Key)';
    }
  } else {
    if (dot) dot.className = 'dot';
    if (text) text.innerText = 'Demo Sandbox Mode';
    if (sidebarModelText) sidebarModelText.innerText = 'AI Engine: Sandbox';
    if (sidebarProviderText) sidebarProviderText.innerText = 'Configure GEMINI_API_KEY in .env';
    if (keyStatusSpan) {
      keyStatusSpan.className = 'text-amber';
      keyStatusSpan.innerText = 'Backend Key Missing';
    }
  }
}

/* --------------------------------------------------------------------------
   NAVIGATION & TAB SWITCHING
   -------------------------------------------------------------------------- */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabTarget = item.getAttribute('data-tab');
      switchTab(tabTarget);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.classList.toggle('active', nav.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-page').forEach(page => {
    page.classList.toggle('active', page.id === `tab-${tabId}`);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------------------------------------------------------
   RESUME ANALYZER & ATS SCORE ENGINE WITH REAL AI
   -------------------------------------------------------------------------- */
function initAnalyzerTabs() {
  const reportTabBtns = document.querySelectorAll('.report-tab-btn');
  reportTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      reportTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetSubtab = btn.getAttribute('data-report');
      document.querySelectorAll('.subtab-content').forEach(sub => {
        sub.classList.toggle('active', sub.id === `subtab-${targetSubtab}`);
      });
    });
  });

  const analyzeBtn = document.getElementById('analyzeResumeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => runResumeAnalysis());
  }
}

let currentExtractedResumeText = "";
let currentUploadedFileName = "";

function initDropZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('resumeFileInput');

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary-accent)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'rgba(99, 102, 241, 0.4)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(99, 102, 241, 0.4)';
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processUploadedResumeFile(file);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processUploadedResumeFile(e.target.files[0]);
    }
  });
}

/* --------------------------------------------------------------------------
   MULTI-FORMAT RESUME TEXT EXTRACTION (PDF, IMAGE OCR, DOCX, TXT)
   -------------------------------------------------------------------------- */

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items.map(item => item.str);
      fullText += pageStrings.join(' ') + '\n';
    }
    return fullText.trim();
  }
  throw new Error("PDF.js engine is not loaded");
}

async function extractTextFromImage(file, onProgress) {
  if (window.Tesseract) {
    if (onProgress) onProgress("Initializing AI OCR Engine...");
    const result = await Tesseract.recognize(
      file,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress) {
            const pct = Math.round((m.progress || 0) * 100);
            onProgress(`OCR Scanning Image (${pct}%)...`);
          }
        }
      }
    );
    return result.data.text.trim();
  }
  throw new Error("Tesseract OCR engine is not ready");
}

async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (window.mammoth) {
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value.trim();
  }
  throw new Error("Mammoth parser is not ready");
}

async function processUploadedResumeFile(file) {
  const detailsCard = document.getElementById('fileUploadDetailsCard');
  const fileNameEl = document.getElementById('uploadedFileName');
  const fileSizeEl = document.getElementById('uploadedFileSize');
  const fileTypeBadgeEl = document.getElementById('uploadedFileTypeBadge');
  const fileTypeIconBox = document.getElementById('fileTypeIconBox');
  const statusText = document.getElementById('extractionStatusText');
  const spinner = document.getElementById('extractionSpinner');
  const previewBox = document.getElementById('extractionPreviewBox');
  const snippet = document.getElementById('extractionSnippet');
  const wordCountBadge = document.getElementById('wordCountBadge');
  const analyzeBtn = document.getElementById('analyzeResumeBtn');

  if (!file) return;

  currentUploadedFileName = file.name;
  currentExtractedResumeText = "";

  // Show details card & reset status
  if (detailsCard) detailsCard.classList.remove('hidden');
  if (fileNameEl) fileNameEl.innerText = file.name;
  if (fileSizeEl) fileSizeEl.innerText = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
  if (previewBox) previewBox.classList.add('hidden');
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting Text...';
  }

  const fileNameLower = file.name.toLowerCase();
  let fileTypeCategory = "document";

  if (fileNameLower.endsWith('.pdf')) {
    fileTypeCategory = "pdf";
    if (fileTypeBadgeEl) fileTypeBadgeEl.innerText = "PDF Document";
    if (fileTypeIconBox) {
      fileTypeIconBox.className = "file-icon-box";
      fileTypeIconBox.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
    }
  } else if (fileNameLower.match(/\.(png|jpe?g|webp|bmp|tiff)$/) || file.type.startsWith('image/')) {
    fileTypeCategory = "image";
    if (fileTypeBadgeEl) fileTypeBadgeEl.innerText = "Scanned Image / Resume Photo";
    if (fileTypeIconBox) {
      fileTypeIconBox.className = "file-icon-box icon-image";
      fileTypeIconBox.innerHTML = '<i class="fa-solid fa-file-image"></i>';
    }
  } else if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
    fileTypeCategory = "word";
    if (fileTypeBadgeEl) fileTypeBadgeEl.innerText = "Word Document";
    if (fileTypeIconBox) {
      fileTypeIconBox.className = "file-icon-box icon-word";
      fileTypeIconBox.innerHTML = '<i class="fa-solid fa-file-word"></i>';
    }
  } else {
    fileTypeCategory = "text";
    if (fileTypeBadgeEl) fileTypeBadgeEl.innerText = "Text File";
    if (fileTypeIconBox) {
      fileTypeIconBox.className = "file-icon-box";
      fileTypeIconBox.innerHTML = '<i class="fa-solid fa-file-lines"></i>';
    }
  }

  // Update extraction message
  if (statusText) statusText.innerText = `Extracting text automatically from ${file.name}...`;
  if (spinner) spinner.classList.remove('hidden');

  try {
    let extractedText = "";

    if (fileTypeCategory === "pdf") {
      extractedText = await extractTextFromPDF(file);
    } else if (fileTypeCategory === "image") {
      extractedText = await extractTextFromImage(file, (msg) => {
        if (statusText) statusText.innerText = msg;
      });
    } else if (fileTypeCategory === "word") {
      extractedText = await extractTextFromDocx(file);
    } else {
      extractedText = await file.text();
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No readable text found. If this is a scanned PDF image, please export as PNG/JPG or upload an image file.");
    }

    currentExtractedResumeText = extractedText.trim();
    const wordCount = currentExtractedResumeText.split(/\s+/).filter(Boolean).length;

    // Update UI with success
    if (spinner) spinner.classList.add('hidden');
    if (statusText) {
      statusText.innerHTML = `<span class="text-green"><i class="fa-solid fa-circle-check"></i> Text extracted successfully! (${wordCount} words detected)</span>`;
    }
    if (wordCountBadge) wordCountBadge.innerText = `${wordCount} words`;
    if (snippet) snippet.innerText = currentExtractedResumeText.slice(0, 400) + (currentExtractedResumeText.length > 400 ? "..." : "");
    if (previewBox) previewBox.classList.remove('hidden');
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Extracted Resume with AI';
    }

  } catch (err) {
    console.error("Auto extraction error:", err);
    if (spinner) spinner.classList.add('hidden');
    if (statusText) {
      statusText.innerHTML = `<span class="text-amber"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message || "Extraction issue, trying alternative parser..."}</span>`;
    }
    // Fallback: try reading as plain text
    try {
      const fallbackText = await file.text();
      if (fallbackText && fallbackText.trim().length > 20) {
        currentExtractedResumeText = fallbackText.trim();
        if (analyzeBtn) {
          analyzeBtn.disabled = false;
          analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Resume with AI';
        }
        if (previewBox) previewBox.classList.remove('hidden');
        if (snippet) snippet.innerText = currentExtractedResumeText.slice(0, 300) + "...";
      }
    } catch (e) {
      if (analyzeBtn) analyzeBtn.disabled = true;
    }
  }
}

function resetUploadedFile() {
  currentExtractedResumeText = "";
  currentUploadedFileName = "";
  const fileInput = document.getElementById('resumeFileInput');
  if (fileInput) fileInput.value = "";
  const detailsCard = document.getElementById('fileUploadDetailsCard');
  if (detailsCard) detailsCard.classList.add('hidden');
  const analyzeBtn = document.getElementById('analyzeResumeBtn');
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Resume with AI';
  }
}

function loadSampleResume(profileType) {
  const sampleName = profileType === 'software_eng' ? 'Archit_FullStack_2026.pdf' : 'Candidate_DataScientist.pdf';
  
  if (profileType === 'software_eng') {
    currentExtractedResumeText = `ARCHIT PRAJAPATI - SENIOR FULL STACK ENGINEER
Email: archit@example.com | Phone: +91 98765 43210 | GitHub: github.com/archit

SUMMARY:
Results-driven Full Stack Engineer with 4+ years experience building web apps with React.js, Node.js, Express, PostgreSQL, and Redis.

TECHNICAL SKILLS:
Languages: JavaScript, TypeScript, Python, HTML5, CSS3
Frameworks: React.js, Redux, Node.js, Express.js
Databases: PostgreSQL, MongoDB, Redis
Tools: Git, Docker, REST APIs

EXPERIENCE:
Senior Full Stack Developer - TechNova (2024-Present)
- Developed backend REST APIs using Node.js and Express.
- Created reusable UI components in React.js and TypeScript.
- Worked on PostgreSQL database queries and optimized performance.`;
  } else {
    currentExtractedResumeText = `DATA SCIENTIST & AI ENGINEER
Summary: AI Specialist with expertise in Python, PyTorch, Scikit-Learn, LLM fine-tuning, Pinecone vector search, and FastAPI deployments.

Experience:
- Fine-tuned open-source Llama 3 models for domain-specific NLP tasks achieving 94% accuracy.
- Engineered RAG pipelines using LangChain and Pinecone vector database.`;
  }

  currentUploadedFileName = sampleName;
  const detailsCard = document.getElementById('fileUploadDetailsCard');
  const fileNameEl = document.getElementById('uploadedFileName');
  const fileSizeEl = document.getElementById('uploadedFileSize');
  const fileTypeBadgeEl = document.getElementById('uploadedFileTypeBadge');
  const fileTypeIconBox = document.getElementById('fileTypeIconBox');
  const statusText = document.getElementById('extractionStatusText');
  const spinner = document.getElementById('extractionSpinner');
  const previewBox = document.getElementById('extractionPreviewBox');
  const snippet = document.getElementById('extractionSnippet');
  const wordCountBadge = document.getElementById('wordCountBadge');
  const analyzeBtn = document.getElementById('analyzeResumeBtn');

  if (detailsCard) detailsCard.classList.remove('hidden');
  if (fileNameEl) fileNameEl.innerText = sampleName;
  if (fileSizeEl) fileSizeEl.innerText = '0.8 MB';
  if (fileTypeBadgeEl) fileTypeBadgeEl.innerText = 'Sample Profile (PDF)';
  if (fileTypeIconBox) {
    fileTypeIconBox.className = "file-icon-box";
    fileTypeIconBox.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
  }
  if (spinner) spinner.classList.add('hidden');
  if (statusText) statusText.innerHTML = `<span class="text-green"><i class="fa-solid fa-circle-check"></i> Sample profile loaded & ready for AI audit</span>`;
  if (wordCountBadge) wordCountBadge.innerText = `${currentExtractedResumeText.split(/\s+/).length} words`;
  if (snippet) snippet.innerText = currentExtractedResumeText.slice(0, 300) + '...';
  if (previewBox) previewBox.classList.remove('hidden');
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Resume with AI';
  }

  runResumeAnalysis(sampleName);
}

async function runResumeAnalysis(fileName) {
  const resumeFileToUse = (typeof fileName === 'string' && fileName.trim()) 
    ? fileName.trim() 
    : (currentUploadedFileName || 'My_Resume.pdf');
  const text = currentExtractedResumeText.trim();

  if (!text) {
    alert('Please upload a Resume file (PDF or Image) first.');
    return;
  }

  const resultsCard = document.getElementById('analysisResults');
  if (resultsCard) resultsCard.scrollIntoView({ behavior: 'smooth' });

  const analyzeBtn = document.getElementById('analyzeResumeBtn');
  if (analyzeBtn) {
    analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Auditing Resume...';
    analyzeBtn.disabled = true;
  }

  if (!isBackendOnline) {
    const localData = analyzeResumeLocally(text, resumeFileToUse);
    renderResumeAuditReport(localData, resumeFileToUse);
    if (analyzeBtn) {
      analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Re-Analyze Resume with AI';
      analyzeBtn.disabled = false;
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/analyze-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_text: text,
        target_role: currentUser ? currentUser.role : '',
        experience_level: currentUser ? (currentUser.experience_level || 'Mid-Level (2-5 yrs)') : 'Mid-Level (2-5 yrs)',
        target_skills: currentUser ? (currentUser.target_skills || '') : ''
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Backend AI Analysis failed');
    }

    const data = await res.json();
    renderResumeAuditReport(data, resumeFileToUse);

  } catch (err) {
    console.warn("AI endpoint notice, engaging accurate local audit:", err);
    const localData = analyzeResumeLocally(text, resumeFileToUse);
    renderResumeAuditReport(localData, resumeFileToUse);
  } finally {
    if (analyzeBtn) {
      analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Re-Analyze Resume with AI';
      analyzeBtn.disabled = false;
    }
  }
}

function renderResumeAuditReport(data, resumeFileToUse) {
  const score = Math.round(Number(data.ats_score) || 72);
  
  const roleTag = document.getElementById('resumeRoleTag');
  if (roleTag) roleTag.innerText = `Target: ${data.target_role || 'Candidate'}`;
  
  const scoreVal = document.getElementById('scoreValue');
  if (scoreVal) scoreVal.innerText = score;
  
  const dashoffset = 264 - (264 * Math.min(100, Math.max(0, score)) / 100);
  const circleEl = document.getElementById('scoreCircleProgress');
  if (circleEl) circleEl.style.strokeDashoffset = dashoffset;
  
  const headlineEl = document.getElementById('scoreHeadline');
  if (headlineEl) headlineEl.innerText = data.headline || (score >= 80 ? 'Strong ATS Compatibility!' : score >= 65 ? 'Solid Foundation - Ready for Optimization' : 'Needs Optimization');
  
  const subheadEl = document.getElementById('scoreSubhead');
  if (subheadEl) subheadEl.innerText = data.subhead || 'Evaluation based on keyword density, structure, and measurable bullet impact.';

  const tagsBox = document.getElementById('scoreTagsBox');
  if (tagsBox) {
    if (data.score_tags && data.score_tags.length > 0) {
      tagsBox.innerHTML = data.score_tags.map(t => `
        <span class="tag tag-${t.type || 'pass'}">
          <i class="fa-solid fa-${t.type === 'pass' ? 'check' : t.type === 'fail' ? 'xmark' : 'triangle-exclamation'}"></i> ${t.label}
        </span>
      `).join('');
    } else {
      tagsBox.innerHTML = `
        <span class="tag ${score >= 70 ? 'tag-pass' : 'tag-warn'}"><i class="fa-solid fa-${score >= 70 ? 'check' : 'triangle-exclamation'}"></i> ${score >= 70 ? 'Good Keyword Density' : 'Add Core Keywords'}</span>
        <span class="tag tag-pass"><i class="fa-solid fa-check"></i> Standard Formatting</span>
        <span class="tag ${score >= 75 ? 'tag-pass' : 'tag-warn'}"><i class="fa-solid fa-${score >= 75 ? 'check' : 'triangle-exclamation'}"></i> ${score >= 75 ? 'Measurable Impact' : 'Quantify Bullets'}</span>
      `;
    }
  }

  const detectedContainer = document.getElementById('detectedSkills');
  if (detectedContainer) {
    detectedContainer.innerHTML = (data.detected_skills && data.detected_skills.length > 0)
      ? data.detected_skills.map(s => `<span class="pill pill-green">${s}</span>`).join('')
      : '<span class="text-muted" style="font-size: 0.85rem;">No technical skills detected yet.</span>';
  }

  const missingContainer = document.getElementById('missingSkills');
  if (missingContainer) {
    missingContainer.innerHTML = (data.missing_keywords && data.missing_keywords.length > 0)
      ? data.missing_keywords.map(s => `<span class="pill pill-red">+ ${s}</span>`).join('')
      : '<span class="pill pill-green"><i class="fa-solid fa-check"></i> Good keyword alignment!</span>';
  }

  const atsList = document.getElementById('atsCheckList');
  if (atsList) {
    atsList.innerHTML = (data.check_items || []).map(item => `
      <div class="check-item status-${item.type || 'pass'}">
        <i class="fa-solid fa-${item.type === 'pass' ? 'circle-check' : item.type === 'warn' ? 'circle-exclamation' : 'circle-xmark'}"></i>
        <div class="check-details">
          <strong>${item.title}</strong>
          <p>${item.desc}</p>
        </div>
      </div>
    `).join('');
  }

  const bulletContainer = document.getElementById('bulletEnhanceContainer');
  if (bulletContainer) {
    bulletContainer.innerHTML = (data.bullet_enhancements || []).map(b => `
      <div class="bullet-rewrite-card mb-3">
        <div class="original-bullet">
          <span class="label">Original Bullet Point:</span>
          <p>"${b.original}"</p>
        </div>
        <div class="ai-suggestion-box">
          <span class="label-ai"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Re-engineered (STAR Method):</span>
          <p class="highlight-text">"${b.improved}"</p>
          <button class="btn btn-secondary btn-xs" onclick="copyText(this)">Copy Rewritten Bullet</button>
        </div>
      </div>
    `).join('');
  }

  saveUserAuditRecord(resumeFileToUse, data.target_role || (currentUser ? currentUser.role : 'Candidate'), score);
}

function analyzeResumeLocally(resumeText, fileName) {
  const text = (resumeText || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const textLower = text.toLowerCase();

  // 1. Contact Info
  const hasEmail = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/.test(text);
  const hasPhone = /(?:\+?\d{1,3}[ -]?)?\(?\d{3,5}\)?[ -]?\d{3,5}[ -]?\d{3,5}/.test(text);
  const hasLinkedIn = textLower.includes('linkedin.com');
  const hasGithub = textLower.includes('github.com') || textLower.includes('portfolio') || textLower.includes('http');

  let contactScore = 0;
  if (hasEmail) contactScore += 4;
  if (hasPhone) contactScore += 4;
  if (hasLinkedIn) contactScore += 4;
  if (hasGithub) contactScore += 3;

  // 2. Section Headings
  const sectionChecks = [
    { name: "Summary / Objective", match: /summary|objective|profile|about me/i.test(text) },
    { name: "Education", match: /education|academic|university|college|diploma|degree/i.test(text) },
    { name: "Experience / Projects", match: /experience|employment|work history|projects|project/i.test(text) },
    { name: "Technical Skills", match: /skills|technical skills|technologies|competencies/i.test(text) },
    { name: "Certifications / Awards", match: /certificat|award|achievement|license|coursework/i.test(text) }
  ];
  const foundSections = sectionChecks.filter(s => s.match);
  const sectionScore = Math.min(20, foundSections.length * 4);

  // 3. Verbs & Measurable Metrics
  const actionVerbsList = [
    "built", "developed", "designed", "engineered", "implemented", "created",
    "led", "managed", "optimized", "architected", "deployed", "collaborated",
    "tested", "analyzed", "maintained", "improved", "automated", "spearheaded",
    "integrated", "delivered", "executed", "configured", "accelerated", "reduced", "increased"
  ];
  const foundVerbs = actionVerbsList.filter(v => new RegExp('\\b' + v + '\\b', 'i').test(text));
  const metricsFound = text.match(/(\b\d+%\b|\$\d+|\b\d+\+\b|\b\d+\s*(?:users|clients|ms|seconds|hours|x|times)\b)/gi) || [];
  const verbMetricScore = Math.min(15, foundVerbs.length * 2) + Math.min(10, metricsFound.length * 3);

  // 4. Skills Dictionary
  const SKILL_DICT = [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C", "C#", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
    "HTML5", "HTML", "CSS3", "CSS", "Tailwind", "Bootstrap", "React", "React.js", "Next.js", "Angular", "Vue",
    "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot",
    "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Firebase",
    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Linux", "Git", "GitHub", "CI/CD",
    "REST API", "GraphQL", "Postman", "Microservices",
    "Machine Learning", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Scikit-Learn",
    "Figma", "UI/UX", "Agile", "Scrum", "Unit Testing", "Jest"
  ];
  const detectedSkills = [];
  SKILL_DICT.forEach(skill => {
    const reg = new RegExp('\\b' + skill.replace('.', '\\.').replace('+', '\\+') + '\\b', 'i');
    if (reg.test(text)) {
      const base = skill.replace('.js', '').replace('5', '').replace('3', '');
      if (!detectedSkills.some(d => d.toLowerCase() === base.toLowerCase())) {
        detectedSkills.push(skill);
      }
    }
  });
  const skillScore = Math.min(25, detectedSkills.length * 3 + (detectedSkills.length >= 4 ? 5 : 0));

  // 5. Length & Readability
  let lengthScore = 15;
  if (wordCount < 100) lengthScore = 4;
  else if (wordCount < 200) lengthScore = 8;
  else if (wordCount > 1200) lengthScore = 12;

  let totalScore = contactScore + sectionScore + verbMetricScore + skillScore + lengthScore;
  totalScore = Math.max(35, Math.min(95, totalScore));

  // Determine role
  let detectedRole = currentUser ? currentUser.role : "Software Developer";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i];
    if (/developer|engineer|designer|scientist|analyst|student|diploma|intern|manager/i.test(l)) {
      detectedRole = l.split(/[-|]/)[0].trim();
      break;
    }
  }

  const commonRecs = ["REST APIs", "Unit Testing", "Docker", "CI/CD Pipelines", "Agile / Scrum", "Git & GitHub"];
  const missingKeywords = commonRecs.filter(r => !detectedSkills.some(s => s.toLowerCase().includes(r.toLowerCase().split(' ')[0]))).slice(0, 4);

  const checkItems = [];
  if (hasEmail && hasPhone) {
    checkItems.push({ type: "pass", title: "Contact Information", desc: "Detected active email and phone number for recruiter outreach." });
  } else {
    checkItems.push({ type: "warn", title: "Incomplete Contact Info", desc: "Ensure your email, phone, and professional LinkedIn/portfolio links are at the top." });
  }

  if (foundSections.length >= 3) {
    checkItems.push({ type: "pass", title: "Standard ATS Sections", desc: `Detected ${foundSections.length} core sections (${foundSections.map(s => s.name).slice(0, 3).join(', ')}).` });
  } else {
    checkItems.push({ type: "warn", title: "Missing Core Headings", desc: "Organize into distinct standard sections: Summary, Experience, Education, and Technical Skills." });
  }

  if (metricsFound.length >= 2) {
    checkItems.push({ type: "pass", title: "Quantifiable Metrics", desc: `Found ${metricsFound.length} measurable achievements with numbers and percentages.` });
  } else {
    checkItems.push({ type: "warn", title: "Quantified Impact", desc: "Add measurable numbers (percentages, latency saved, user volume) to your project bullet points." });
  }

  if (foundVerbs.length >= 4) {
    checkItems.push({ type: "pass", title: "Action Verbs", desc: `Found strong action verbs (${foundVerbs.slice(0, 4).join(', ')}).` });
  } else {
    checkItems.push({ type: "warn", title: "Weak Action Verbs", desc: "Begin project lines with strong accomplishment verbs like Engineered, Spearheaded, Optimized." });
  }

  const candidateBullets = lines.filter(l => l.length > 30 && !l.endsWith(':'));
  const origBullet = candidateBullets.length > 0 ? candidateBullets[0].slice(0, 130) : "Developed software features using modern programming frameworks.";
  const improvedBullet = `Architected and implemented ${detectedRole.toLowerCase()} solution, improving execution efficiency by 28% and scaling performance for over 150+ users.`;

  const headline = totalScore >= 80 ? "Strong ATS Profile!" : totalScore >= 68 ? "Good Foundation - Ready for Optimization" : "Needs Structural & Keyword Optimization";
  const subhead = `Your resume scored ${totalScore}/100 based on ${detectedSkills.length} verified technical skills and ${foundVerbs.length} impact verbs. Quantifying your accomplishments will maximize recruiter responses.`;

  return {
    target_role: detectedRole,
    ats_score: totalScore,
    headline,
    subhead,
    score_tags: [
      { label: "Contact Details", type: (hasEmail && hasPhone) ? "pass" : "warn" },
      { label: "Section Headers", type: foundSections.length >= 3 ? "pass" : "warn" },
      { label: "Metrics & Scale", type: metricsFound.length >= 2 ? "pass" : "warn" }
    ],
    detected_skills: detectedSkills.length > 0 ? detectedSkills.slice(0, 12) : ["General Technical Skills"],
    missing_keywords: missingKeywords.length > 0 ? missingKeywords : ["RESTful APIs", "Docker", "Unit Testing"],
    check_items: checkItems,
    bullet_enhancements: [
      { original: origBullet, improved: improvedBullet }
    ]
  };
}


/* --------------------------------------------------------------------------
   AI MOCK INTERVIEW SIMULATOR WITH REAL AI
   -------------------------------------------------------------------------- */
let currentQuestionIndex = 0;
let activeRole = 'Full Stack Developer';
let currentRoundScores = [];

function initMockInterview() {
  const startBtn = document.getElementById('startInterviewBtn');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const nextQBtn = document.getElementById('nextQuestionBtn');
  const genNewQBtn = document.getElementById('genNewAiQuestionBtn');

  if (!startBtn) return;

  startBtn.addEventListener('click', async () => {
    activeRole = document.getElementById('interviewRoleSelect').value;
    const round = document.getElementById('interviewRoundSelect').value;

    document.getElementById('interviewSetupCard').classList.add('hidden');
    document.getElementById('interviewStage').classList.remove('hidden');
    document.getElementById('activeRoleBadge').innerText = `${activeRole} • ${round}`;

    currentQuestionIndex = 0;
    currentRoundScores = [];
    await generateAiQuestion();
  });

  if (genNewQBtn) {
    genNewQBtn.addEventListener('click', generateAiQuestion);
  }

  submitAnswerBtn.addEventListener('click', async () => {
    const answerText = document.getElementById('candidateAnswerText').value.trim();
    if (!answerText) {
      alert('Please type or speak your answer before submitting.');
      return;
    }
    await evaluateCandidateAnswerWithAI(answerText);
  });

  nextQBtn.addEventListener('click', async () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < 3) {
      document.getElementById('evaluationPanel').classList.add('hidden');
      document.getElementById('candidateAnswerText').value = '';
      await generateAiQuestion();
    } else {
      let avg = 8.0;
      if (currentRoundScores.length > 0) {
        const sum = currentRoundScores.reduce((a, b) => a + b, 0);
        avg = sum / currentRoundScores.length;
      }
      const overallStr = `${avg.toFixed(1)}/10`;
      const round = document.getElementById('interviewRoundSelect').value;
      const diff = document.getElementById('interviewDifficultySelect')?.value || 'Mid-Level';
      
      saveUserInterviewRecord(activeRole, round, diff, overallStr);
      alert(`🎉 Mock Interview Round Completed! Overall Score: ${overallStr}`);
      switchTab('dashboard');
    }
  });
}

async function generateAiQuestion() {
  const qText = document.getElementById('currentQuestionText');
  const qNum = document.getElementById('qNumberLabel');
  qNum.innerText = `Question ${currentQuestionIndex + 1} of 3`;

  if (isBackendOnline) {
    qText.innerText = '"Generating tailored question with Real AI..."';
    try {
      const round = document.getElementById('interviewRoundSelect').value;
      const diff = document.getElementById('interviewDifficultySelect')?.value || 'Mid-Level';

      const res = await fetch(`${API_BASE_URL}/api/ai/interview-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: activeRole,
          round_type: round,
          difficulty: diff,
          question_index: currentQuestionIndex
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Backend question generation failed');
      }

      const data = await res.json();
      qText.innerText = data.question ? `"${data.question.trim()}"` : '"AI question failed to generate"';
      return;
    } catch (e) {
      console.warn("AI Question fallback:", e);
    }
  }

  const demoQs = [
    "Can you walk me through a complex architectural challenge you faced when building a microservice backend, and how you handled concurrency?",
    "How do you manage state and prevent unnecessary re-renders in a large-scale React application?",
    "Tell me about a time you had a technical disagreement with a peer and how you resolved it."
  ];
  qText.innerText = `"${demoQs[currentQuestionIndex % demoQs.length]}"`;
}

function loadSampleAnswer() {
  document.getElementById('candidateAnswerText').value = `In my previous role as Senior Full Stack Engineer (Situation), we faced high database latency during peak traffic (Task). I implemented a Redis caching layer for read queries and configured connection pooling (Action). This reduced API response time by 60% for 100k daily users (Result).`;
}

async function evaluateCandidateAnswerWithAI(answer) {
  const evalPanel = document.getElementById('evaluationPanel');
  const question = document.getElementById('currentQuestionText').innerText;

  evalPanel.classList.remove('hidden');
  evalPanel.scrollIntoView({ behavior: 'smooth' });

  if (isBackendOnline) {
    document.getElementById('evalScoreBadge').innerText = 'AI Scoring...';
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/evaluate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, candidate_answer: answer })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Backend answer evaluation failed');
      }

      const data = await res.json();
      document.getElementById('evalScoreBadge').innerText = `Score: ${data.score}`;
      document.getElementById('evalStrengths').innerHTML = (data.strengths || []).map(s => `<li>${s}</li>`).join('');
      document.getElementById('evalMissed').innerHTML = (data.missed || []).map(m => `<li>${m}</li>`).join('');
      document.getElementById('improvedAnswerText').innerText = `"${data.model_answer}"`;

      const numScore = parseFloat(data.score);
      if (!isNaN(numScore)) {
        currentRoundScores.push(numScore);
      } else {
        currentRoundScores.push(8.5);
      }
      return;
    } catch (e) {
      console.warn("Real AI eval error:", e);
    }
  }

  document.getElementById('evalScoreBadge').innerText = 'Score: 8.5/10';
  document.getElementById('evalStrengths').innerHTML = '<li>Used STAR method clearly with situation, action, and result.</li>';
  document.getElementById('evalMissed').innerHTML = '<li>Could mention specific monitoring/alerting tools used.</li>';
  currentRoundScores.push(8.5);
}

/* --------------------------------------------------------------------------
   INTERACTIVE ATS RESUME BUILDER ENGINE & VECTOR PDF GENERATOR
   -------------------------------------------------------------------------- */
let builderExperiences = [
  {
    id: 1,
    title: "Senior Full Stack Developer",
    company: "TechNova Solutions",
    dates: "2024 – Present",
    bullets: "Architected scalable RESTful microservices using Node.js & Express, reducing API response times by 38% for over 100k daily users.\nEngineered 25+ reusable modular UI components using React.js and TypeScript, accelerating frontend dev velocity by 30%.\nStreamlined deployment pipelines using Docker and GitHub Actions, cutting staging setup time by 45%."
  }
];

let builderProjects = [
  {
    id: 1,
    title: "Smart Resume & Career Portal (ResuMind AI)",
    tech: "Python, FastAPI, SQLite, JavaScript, Gemini AI",
    desc: "Engineered full-stack career platform analyzing ATS compatibility and providing real-time AI interview feedback with 99% uptime."
  }
];

let builderEducations = [
  {
    id: 1,
    degree: "B.Tech in Computer Science & Engineering",
    school: "Gujarat Technological University",
    dates: "2020 – 2024",
    score: "CGPA: 8.8 / 10"
  }
];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSkillsText(raw) {
  if (!raw) return '';
  return String(raw)
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.includes(',')) {
        return trimmed.split(',').map(s => s.trim()).filter(Boolean).join(', ');
      }
      return trimmed;
    })
    .filter(Boolean)
    .join('\n');
}

function initResumeBuilder() {
  const nameInput = document.getElementById('rbFullName');
  if (!nameInput) return;

  // Bind live listeners on all basic inputs
  const inputs = ['rbFullName', 'rbTitle', 'rbEmail', 'rbPhone', 'rbLocation', 'rbLinkedin', 'rbWebsite', 'rbSummary', 'rbSkills', 'rbCertifications'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        el.dataset.userEdited = 'true';
        updateResumePreview();
      });
    }
  });

  renderExperienceFields();
  renderProjectFields();
  renderEducationFields();
  updateResumePreview();
}

function getFilledResumeData() {
  const fullName = document.getElementById('rbFullName')?.value?.trim() || '';
  const title = document.getElementById('rbTitle')?.value?.trim() || '';
  const email = document.getElementById('rbEmail')?.value?.trim() || '';
  const phone = document.getElementById('rbPhone')?.value?.trim() || '';
  const location = document.getElementById('rbLocation')?.value?.trim() || '';
  const linkedin = document.getElementById('rbLinkedin')?.value?.trim() || '';
  const website = document.getElementById('rbWebsite')?.value?.trim() || '';
  const summary = document.getElementById('rbSummary')?.value?.trim() || '';
  const skills = formatSkillsText(document.getElementById('rbSkills')?.value?.trim() || '');
  const certifications = document.getElementById('rbCertifications')?.value?.trim() || '';

  const experiences = builderExperiences.filter(exp =>
    (exp.title || '').trim() || (exp.company || '').trim() || (exp.dates || '').trim() || (exp.bullets || '').trim()
  );
  const projects = builderProjects.filter(proj =>
    (proj.title || '').trim() || (proj.tech || '').trim() || (proj.desc || '').trim()
  );
  const educations = builderEducations.filter(edu =>
    (edu.degree || '').trim() || (edu.school || '').trim() || (edu.dates || '').trim() || (edu.score || '').trim()
  );

  return {
    fullName,
    title,
    email,
    phone,
    location,
    linkedin,
    website,
    summary,
    skills,
    experiences,
    projects,
    educations,
    certifications
  };
}

function updateResumePreview() {
  const data = getFilledResumeData();

  // 1. Header
  const pvName = document.getElementById('pvName');
  if (pvName) pvName.innerText = (data.fullName || 'YOUR NAME').toUpperCase();

  const pvTitle = document.getElementById('pvTitle');
  if (pvTitle) {
    pvTitle.innerText = (data.title || 'TARGET JOB ROLE').toUpperCase();
    pvTitle.style.display = data.title ? 'block' : 'none';
  }

  // Contact items with icons and separators
  const pvContact = document.getElementById('pvContact');
  if (pvContact) {
    const parts = [];
    if (data.email) parts.push(`<span><i class="fa-solid fa-envelope"></i> ${escapeHtml(data.email)}</span>`);
    if (data.phone) parts.push(`<span><i class="fa-solid fa-phone"></i> ${escapeHtml(data.phone)}</span>`);
    if (data.location) parts.push(`<span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(data.location)}</span>`);
    if (data.linkedin) parts.push(`<span><i class="fa-brands fa-linkedin"></i> ${escapeHtml(data.linkedin)}</span>`);
    if (data.website) parts.push(`<span><i class="fa-brands fa-github"></i> ${escapeHtml(data.website)}</span>`);
    pvContact.innerHTML = parts.join(' <span class="sep">|</span> ');
    pvContact.style.display = parts.length > 0 ? 'flex' : 'none';
  }

  // 2. Professional Summary
  const pvSummarySection = document.getElementById('pvSummarySection');
  const pvSummary = document.getElementById('pvSummary');
  if (pvSummarySection && pvSummary) {
    if (data.summary) {
      pvSummarySection.style.display = 'block';
      const paragraphs = data.summary.split('\n').map(p => p.trim()).filter(Boolean);
      pvSummary.innerHTML = paragraphs.map(p => escapeHtml(p)).join('<br><br>');
    } else {
      pvSummarySection.style.display = 'none';
    }
  }

  // 3. Technical Skills
  const pvSkillsSection = document.getElementById('pvSkillsSection');
  const pvSkills = document.getElementById('pvSkills');
  if (pvSkillsSection && pvSkills) {
    if (data.skills) {
      pvSkillsSection.style.display = 'block';
      pvSkills.innerText = data.skills;
    } else {
      pvSkillsSection.style.display = 'none';
    }
  }

  // 4. Work Experience
  const pvExpSection = document.getElementById('pvExperienceSection');
  const pvExpList = document.getElementById('pvExperienceList');
  if (pvExpSection && pvExpList) {
    if (data.experiences.length > 0) {
      pvExpSection.style.display = 'block';
      pvExpList.innerHTML = data.experiences.map(exp => {
        const bulletLines = (exp.bullets || '').split('\n').map(b => b.trim()).filter(Boolean);
        const headingText = exp.title && exp.company
          ? `${escapeHtml(exp.title)} — ${escapeHtml(exp.company)}`
          : escapeHtml(exp.title || exp.company || 'Position');
        return `
          <div class="exp-item">
            <div class="exp-header">
              <strong>${headingText}</strong>
              <span>${escapeHtml(exp.dates || '')}</span>
            </div>
            ${bulletLines.length > 0 ? `<ul>${bulletLines.map(b => `<li>${escapeHtml(b.replace(/^[•\-\*]\s*/, ''))}</li>`).join('')}</ul>` : ''}
          </div>
        `;
      }).join('');
    } else {
      pvExpSection.style.display = 'none';
    }
  }

  // 5. Key Projects
  const pvProjSection = document.getElementById('pvProjectsSection');
  const pvProjList = document.getElementById('pvProjectsList');
  if (pvProjSection && pvProjList) {
    if (data.projects.length > 0) {
      pvProjSection.style.display = 'block';
      pvProjList.innerHTML = data.projects.map(proj => {
        const descLines = (proj.desc || '').split('\n').map(l => l.trim()).filter(Boolean);
        let descHtml = '';
        if (descLines.length > 1) {
          descHtml = `<ul class="res-bullet-list">${descLines.map(l => `<li>${escapeHtml(l.replace(/^[•\-\*]\s*/, ''))}</li>`).join('')}</ul>`;
        } else if (descLines.length === 1) {
          descHtml = `<p class="project-desc">${escapeHtml(descLines[0])}</p>`;
        }
        return `
          <div class="project-item">
            <div class="project-header">
              <strong>${escapeHtml(proj.title || 'Project Name')}</strong>
              <span class="project-tech">${escapeHtml(proj.tech || '')}</span>
            </div>
            ${descHtml}
          </div>
        `;
      }).join('');
    } else {
      pvProjSection.style.display = 'none';
    }
  }

  // 6. Education
  const pvEduSection = document.getElementById('pvEducationSection');
  const pvEduList = document.getElementById('pvEducationList');
  if (pvEduSection && pvEduList) {
    if (data.educations.length > 0) {
      pvEduSection.style.display = 'block';
      pvEduList.innerHTML = data.educations.map(edu => `
        <div class="edu-item">
          <div class="edu-header">
            <strong>${escapeHtml(edu.degree || 'Degree')}${edu.score ? ` (${escapeHtml(edu.score)})` : ''}</strong>
            <span>${escapeHtml(edu.dates || '')}</span>
          </div>
          ${edu.school ? `<div class="edu-school">${escapeHtml(edu.school)}</div>` : ''}
        </div>
      `).join('');
    } else {
      pvEduSection.style.display = 'none';
    }
  }

  // 7. Certifications & Honors
  const pvCertSection = document.getElementById('pvCertSection');
  const pvCerts = document.getElementById('pvCertifications');
  if (pvCertSection && pvCerts) {
    if (data.certifications) {
      pvCertSection.style.display = 'block';
      const certLines = data.certifications.split('\n').map(l => l.trim()).filter(Boolean);
      if (certLines.length > 1) {
        pvCerts.innerHTML = `<ul class="res-bullet-list">${certLines.map(l => `<li>${escapeHtml(l.replace(/^[•\-\*]\s*/, ''))}</li>`).join('')}</ul>`;
      } else {
        pvCerts.innerText = certLines[0] || '';
      }
    } else {
      pvCertSection.style.display = 'none';
    }
  }
}

// Experience Field Management
function renderExperienceFields() {
  const container = document.getElementById('experienceFieldsContainer');
  if (!container) return;

  container.innerHTML = builderExperiences.map((exp) => `
    <div class="builder-item-card" data-exp-id="${exp.id}">
      <button type="button" class="btn-remove-item" onclick="removeExperienceField(${exp.id})" title="Delete Experience">
        <i class="fa-solid fa-trash-can"></i>
      </button>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Job Title</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(exp.title)}" placeholder="e.g. Software Engineer" oninput="updateExperienceItem(${exp.id}, 'title', this.value)">
        </div>
        <div class="form-group flex-1">
          <label>Company / Organization</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(exp.company)}" placeholder="e.g. Google / TechCorp" oninput="updateExperienceItem(${exp.id}, 'company', this.value)">
        </div>
      </div>
      <div class="form-group mt-2">
        <label>Dates / Period</label>
        <input type="text" class="form-control form-control-sm" value="${escapeHtml(exp.dates)}" placeholder="e.g. 2023 – Present" oninput="updateExperienceItem(${exp.id}, 'dates', this.value)">
      </div>
      <div class="form-group mt-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <label>Key Responsibilities & Achievements (1 per line)</label>
          <button type="button" class="btn btn-outline btn-xs" onclick="enhanceExpBulletWithAI(${exp.id}, this)">
            <i class="fa-solid fa-wand-magic-sparkles"></i> AI Enhance
          </button>
        </div>
        <textarea class="form-textarea form-textarea-sm" rows="3" placeholder="Enter bullet points (start each achievement with an action verb)..." oninput="updateExperienceItem(${exp.id}, 'bullets', this.value)">${escapeHtml(exp.bullets)}</textarea>
      </div>
    </div>
  `).join('');
}

function addExperienceField() {
  builderExperiences.push({
    id: Date.now(),
    title: "",
    company: "",
    dates: "",
    bullets: ""
  });
  renderExperienceFields();
  updateResumePreview();
}

function removeExperienceField(id) {
  builderExperiences = builderExperiences.filter(e => e.id !== id);
  renderExperienceFields();
  updateResumePreview();
}

function updateExperienceItem(id, field, value) {
  const item = builderExperiences.find(e => e.id === id);
  if (item) {
    item[field] = value;
    updateResumePreview();
  }
}

// Project Field Management
function renderProjectFields() {
  const container = document.getElementById('projectFieldsContainer');
  if (!container) return;

  container.innerHTML = builderProjects.map((proj) => `
    <div class="builder-item-card" data-proj-id="${proj.id}">
      <button type="button" class="btn-remove-item" onclick="removeProjectField(${proj.id})" title="Delete Project">
        <i class="fa-solid fa-trash-can"></i>
      </button>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Project Title</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(proj.title)}" placeholder="e.g. E-Commerce Platform" oninput="updateProjectItem(${proj.id}, 'title', this.value)">
        </div>
        <div class="form-group flex-1">
          <label>Tech Stack / Technologies</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(proj.tech)}" placeholder="e.g. React, Node.js, MongoDB" oninput="updateProjectItem(${proj.id}, 'tech', this.value)">
        </div>
      </div>
      <div class="form-group mt-2">
        <label>Project Description / Measurable Results</label>
        <textarea class="form-textarea form-textarea-sm" rows="2" placeholder="Briefly describe what you built and the impact it achieved..." oninput="updateProjectItem(${proj.id}, 'desc', this.value)">${escapeHtml(proj.desc)}</textarea>
      </div>
    </div>
  `).join('');
}

function addProjectField() {
  builderProjects.push({
    id: Date.now(),
    title: "",
    tech: "",
    desc: ""
  });
  renderProjectFields();
  updateResumePreview();
}

function removeProjectField(id) {
  builderProjects = builderProjects.filter(p => p.id !== id);
  renderProjectFields();
  updateResumePreview();
}

function updateProjectItem(id, field, value) {
  const item = builderProjects.find(p => p.id === id);
  if (item) {
    item[field] = value;
    updateResumePreview();
  }
}

// Education Field Management
function renderEducationFields() {
  const container = document.getElementById('educationFieldsContainer');
  if (!container) return;

  container.innerHTML = builderEducations.map((edu) => `
    <div class="builder-item-card" data-edu-id="${edu.id}">
      <button type="button" class="btn-remove-item" onclick="removeEducationField(${edu.id})" title="Delete Education">
        <i class="fa-solid fa-trash-can"></i>
      </button>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Degree / Course</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(edu.degree)}" placeholder="e.g. B.Tech / Diploma in CE" oninput="updateEducationItem(${edu.id}, 'degree', this.value)">
        </div>
        <div class="form-group flex-1">
          <label>School / University</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(edu.school)}" placeholder="e.g. Gujarat Technological University" oninput="updateEducationItem(${edu.id}, 'school', this.value)">
        </div>
      </div>
      <div class="form-row mt-2">
        <div class="form-group flex-1">
          <label>Dates / Year</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(edu.dates)}" placeholder="e.g. 2020 – 2024" oninput="updateEducationItem(${edu.id}, 'dates', this.value)">
        </div>
        <div class="form-group flex-1">
          <label>Score / CGPA (Optional)</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(edu.score)}" placeholder="e.g. CGPA: 8.5 / 10" oninput="updateEducationItem(${edu.id}, 'score', this.value)">
        </div>
      </div>
    </div>
  `).join('');
}

function addEducationField() {
  builderEducations.push({
    id: Date.now(),
    degree: "",
    school: "",
    dates: "",
    score: ""
  });
  renderEducationFields();
  updateResumePreview();
}

function removeEducationField(id) {
  builderEducations = builderEducations.filter(e => e.id !== id);
  renderEducationFields();
  updateResumePreview();
}

function updateEducationItem(id, field, value) {
  const item = builderEducations.find(e => e.id === id);
  if (item) {
    item[field] = value;
    updateResumePreview();
  }
}

// Prefill & Clear utilities
function loadSampleResumeData() {
  document.getElementById('rbFullName').value = (currentUser && currentUser.name) ? currentUser.name : "Archit Prajapati";
  document.getElementById('rbTitle').value = (currentUser && currentUser.role) ? currentUser.role : "Senior Full Stack Software Engineer";
  document.getElementById('rbEmail').value = (currentUser && currentUser.email) ? currentUser.email : "archit@example.com";
  document.getElementById('rbPhone').value = "+91 98765 43210";
  document.getElementById('rbLocation').value = "Ahmedabad, India";
  document.getElementById('rbLinkedin').value = "linkedin.com/in/archit";
  document.getElementById('rbWebsite').value = "github.com/archit";
  document.getElementById('rbSummary').value = "Results-driven Full Stack Engineer with 4+ years of experience engineering high-throughput web applications, Node.js microservices, and React frontends. Specialized in API optimization, clean architecture, and CI/CD pipelines.";
  document.getElementById('rbSkills').value = "JavaScript (ES6+), TypeScript, React.js, Node.js, Express, Next.js, HTML5/CSS3, PostgreSQL, MongoDB, Redis, Docker, AWS, Git";
  document.getElementById('rbCertifications').value = "AWS Certified Cloud Practitioner (2024) | Winner of Inter-College Codeathon 2023";

  builderExperiences = [
    {
      id: 1,
      title: "Senior Full Stack Developer",
      company: "TechNova Solutions",
      dates: "2024 – Present",
      bullets: "Architected scalable RESTful microservices using Node.js & Express, reducing API response times by 38% for over 100k daily users.\nEngineered 25+ reusable modular UI components using React.js and TypeScript, accelerating frontend dev velocity by 30%.\nStreamlined deployment pipelines using Docker and GitHub Actions, cutting staging setup time by 45%."
    }
  ];

  builderProjects = [
    {
      id: 1,
      title: "Smart Resume & Career Portal (ResuMind AI)",
      tech: "Python, FastAPI, SQLite, JavaScript, Gemini AI",
      desc: "Engineered full-stack career platform analyzing ATS compatibility and providing real-time AI interview feedback with 99% uptime."
    }
  ];

  builderEducations = [
    {
      id: 1,
      degree: "B.Tech in Computer Science & Engineering",
      school: "Gujarat Technological University",
      dates: "2020 – 2024",
      score: "CGPA: 8.8 / 10"
    }
  ];

  renderExperienceFields();
  renderProjectFields();
  renderEducationFields();
  updateResumePreview();
}

function clearResumeForm() {
  if (!confirm("Are you sure you want to clear all resume fields?")) return;
  
  const fields = ['rbFullName', 'rbTitle', 'rbEmail', 'rbPhone', 'rbLocation', 'rbLinkedin', 'rbWebsite', 'rbSummary', 'rbSkills', 'rbCertifications'];
  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) {
      el.value = '';
      el.dataset.userEdited = 'true';
    }
  });

  builderExperiences = [];
  builderProjects = [];
  builderEducations = [];

  renderExperienceFields();
  renderProjectFields();
  renderEducationFields();
  updateResumePreview();
}

// AI Enhancements
async function enhanceSummaryWithAI() {
  const summaryInput = document.getElementById('rbSummary');
  const role = document.getElementById('rbTitle')?.value || "Software Engineer";
  const btn = document.getElementById('btnAiEnhanceSummary');

  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enhancing...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/enhance-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role, current_summary: summaryInput.value })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.enhanced_summary) {
        summaryInput.value = data.enhanced_summary.trim();
        summaryInput.dataset.userEdited = 'true';
        updateResumePreview();
        return;
      }
    }
  } catch (err) {
    console.warn("AI summary fallback:", err);
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Real AI Enhance';
      btn.disabled = false;
    }
  }

  summaryInput.value = `Results-driven ${role} with demonstrated proficiency in architecting scalable solutions, optimizing performance bottlenecks, and delivering business value through clean, maintainable engineering practices.`;
  summaryInput.dataset.userEdited = 'true';
  updateResumePreview();
}

async function enhanceExpBulletWithAI(expId, btn) {
  const item = builderExperiences.find(e => e.id === expId);
  if (!item || !item.bullets) return;

  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Polishing...';
  btn.disabled = true;

  try {
    const role = document.getElementById('rbTitle')?.value || item.title || "Software Engineer";
    const res = await fetch(`${API_BASE_URL}/api/ai/enhance-bullet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role, bullet: item.bullets.split('\n')[0] })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.enhanced_bullet) {
        const remaining = item.bullets.split('\n').slice(1).join('\n');
        item.bullets = data.enhanced_bullet + (remaining ? '\n' + remaining : '');
        renderExperienceFields();
        updateResumePreview();
        return;
      }
    }
  } catch (err) {
    console.warn("Bullet enhancement fallback:", err);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }

  // Local STAR fallback
  const improved = `Spearheaded architecture of ${item.title || 'software'} workflows, cutting processing latency by 32% and scaling reliability for 100k+ operations.`;
  const remaining = item.bullets.split('\n').slice(1).join('\n');
  item.bullets = improved + (remaining ? '\n' + remaining : '');
  renderExperienceFields();
  updateResumePreview();
}

// ==========================================================================
// VECTOR ATS PDF ENGINE (jsPDF) — JUSTIFIED, SEQUENTIAL, ZERO CLIPPING
// ==========================================================================
function sanitizePdfLine(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function drawJustifiedPdfBlock(doc, rawText, x, y, maxWidth, opts = {}) {
  const fontSize = opts.fontSize || 9.5;
  const lineHeight = opts.lineHeight || 4.6;
  const color = opts.color || [30, 41, 59];
  const fontStyle = opts.fontStyle || 'normal';
  const justify = opts.justify !== false;
  const maxY = opts.maxY || 282;
  const newPageY = opts.newPageY || 18;
  const bullet = opts.bullet || false;
  const bulletX = opts.bulletX || (x - 3.3);

  const clean = sanitizePdfLine(rawText);
  if (!clean) return y;

  doc.setFont('helvetica', fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(color[0], color[1], color[2]);

  const wrappedLines = doc.splitTextToSize(clean, maxWidth);
  const normalSpaceW = doc.getTextWidth(' ');

  for (let i = 0; i < wrappedLines.length; i++) {
    const line = wrappedLines[i].trim();
    if (!line) continue;

    // Automatic page break check BEFORE drawing each line (never cuts lines across pages)
    if (y + lineHeight > maxY) {
      doc.addPage();
      y = newPageY;
      doc.setFont('helvetica', fontStyle);
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
    }

    // Crisp vector bullet dot vertically aligned with first line of bullet text
    if (bullet && i === 0) {
      doc.setFillColor(15, 23, 42);
      doc.circle(bulletX, y - 1.05, 0.58, 'F');
    }

    const isLastLine = (i === wrappedLines.length - 1);
    const words = line.split(/\s+/);

    if (justify && !isLastLine && words.length > 1) {
      const wordsWidth = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0);
      const remaining = maxWidth - wordsWidth;
      const gap = remaining / (words.length - 1);

      // Justify smoothly when word spacing stays within clean typographic bounds
      if (gap >= normalSpaceW * 0.5 && gap <= normalSpaceW * 3.8) {
        let cursorX = x;
        for (let w = 0; w < words.length; w++) {
          doc.text(words[w], cursorX, y);
          cursorX += doc.getTextWidth(words[w]) + gap;
        }
      } else {
        doc.text(line, x, y);
      }
    } else {
      doc.text(line, x, y);
    }

    y += lineHeight;
  }

  return y;
}

function drawPdfSectionHeading(doc, title, y, marginX, contentW, maxY, newPageY) {
  // Orphan heading protection: keep heading + divider + first 2 lines together
  if (y + 18 > maxY) {
    doc.addPage();
    y = newPageY;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfLine(title).toUpperCase(), marginX, y);

  y += 1.7;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.32);
  doc.line(marginX, y, marginX + contentW, y);

  y += 5.2;
  return y;
}

function downloadResumePDF() {
  const data = getFilledResumeData();
  const btn = document.getElementById('btnDownloadPdf');
  const originalText = btn ? btn.innerHTML : '';

  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
  if (!jsPDFCtor) {
    // Fallback cleanly to our fixed @media print stylesheet if CDN failed
    printResumeDocument();
    return;
  }

  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';
    btn.disabled = true;
  }

  try {
    const doc = new jsPDFCtor({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN_X = 15;
    const NEW_PAGE_Y = 18;
    const MAX_Y = PAGE_H - 14;
    const CONTENT_W = PAGE_W - MARGIN_X * 2; // 180mm

    let y = 18;

    // ------------------------------------------------------------------------
    // 1. HEADER: NAME, TARGET TITLE & CENTERED WRAPPED CONTACT BAR
    // ------------------------------------------------------------------------
    const nameStr = sanitizePdfLine(data.fullName || 'YOUR NAME').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17.5);
    doc.setTextColor(15, 23, 42);
    const nameLines = doc.splitTextToSize(nameStr, CONTENT_W);
    for (const nl of nameLines) {
      doc.text(nl, PAGE_W / 2, y, { align: 'center' });
      y += 6.8;
    }

    if (data.title) {
      const titleStr = sanitizePdfLine(data.title).toUpperCase();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(51, 65, 85);
      const roleLines = doc.splitTextToSize(titleStr, CONTENT_W);
      for (const rl of roleLines) {
        doc.text(rl, PAGE_W / 2, y, { align: 'center' });
        y += 4.6;
      }
    }

    // Contact details wrapped cleanly at item boundaries (zero overflow/cutting)
    const contactItems = [data.email, data.phone, data.location, data.linkedin, data.website]
      .map(sanitizePdfLine)
      .filter(Boolean);

    if (contactItems.length > 0) {
      y += 0.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(71, 85, 105);

      const sep = '  |  ';
      const contactRows = [];
      let currentRow = '';
      for (const item of contactItems) {
        const candidate = currentRow ? `${currentRow}${sep}${item}` : item;
        if (doc.getTextWidth(candidate) <= CONTENT_W) {
          currentRow = candidate;
        } else {
          if (currentRow) contactRows.push(currentRow);
          if (doc.getTextWidth(item) > CONTENT_W) {
            const splitParts = doc.splitTextToSize(item, CONTENT_W);
            contactRows.push(...splitParts.slice(0, -1));
            currentRow = splitParts[splitParts.length - 1];
          } else {
            currentRow = item;
          }
        }
      }
      if (currentRow) contactRows.push(currentRow);

      for (const row of contactRows) {
        doc.text(row, PAGE_W / 2, y, { align: 'center' });
        y += 4.2;
      }
    }

    // Bold Header Divider Line
    y += 0.8;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 7;

    // ------------------------------------------------------------------------
    // 2. PROFESSIONAL SUMMARY (JUSTIFIED)
    // ------------------------------------------------------------------------
    if (data.summary) {
      y = drawPdfSectionHeading(doc, 'PROFESSIONAL SUMMARY', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);
      const paragraphs = data.summary.split('\n').map(p => p.trim()).filter(Boolean);
      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        y = drawJustifiedPdfBlock(doc, paragraphs[pIdx], MARGIN_X, y, CONTENT_W, {
          fontSize: 9.4,
          lineHeight: 4.6,
          color: [30, 41, 59],
          justify: true,
          maxY: MAX_Y,
          newPageY: NEW_PAGE_Y
        });
        if (pIdx < paragraphs.length - 1) y += 1.6;
      }
      y += 3.5;
    }

    // ------------------------------------------------------------------------
    // 3. TECHNICAL SKILLS (COMMA-NORMALIZED & JUSTIFIED)
    // ------------------------------------------------------------------------
    if (data.skills) {
      y = drawPdfSectionHeading(doc, 'TECHNICAL SKILLS', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);
      const skillLines = data.skills.split('\n').map(l => l.trim()).filter(Boolean);
      for (let sIdx = 0; sIdx < skillLines.length; sIdx++) {
        y = drawJustifiedPdfBlock(doc, skillLines[sIdx], MARGIN_X, y, CONTENT_W, {
          fontSize: 9.4,
          lineHeight: 4.6,
          color: [30, 41, 59],
          justify: true,
          maxY: MAX_Y,
          newPageY: NEW_PAGE_Y
        });
        if (sIdx < skillLines.length - 1) y += 1.2;
      }
      y += 3.5;
    }

    // ------------------------------------------------------------------------
    // 4. WORK EXPERIENCE (SEQUENTIAL, COLLISION-FREE, JUSTIFIED BULLETS)
    // ------------------------------------------------------------------------
    if (data.experiences.length > 0) {
      y = drawPdfSectionHeading(doc, 'WORK EXPERIENCE', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);

      for (const exp of data.experiences) {
        if (y + 15 > MAX_Y) {
          doc.addPage();
          y = NEW_PAGE_Y;
        }

        const headingStr = sanitizePdfLine(
          exp.title && exp.company ? `${exp.title} - ${exp.company}` : (exp.title || exp.company || 'Experience')
        );
        const datesStr = sanitizePdfLine(exp.dates || '');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        const datesW = datesStr ? doc.getTextWidth(datesStr) : 0;
        const titleMaxW = datesStr ? Math.max(95, CONTENT_W - datesW - 6) : CONTENT_W;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        doc.setTextColor(15, 23, 42);
        const headingLines = doc.splitTextToSize(headingStr, titleMaxW);

        doc.text(headingLines[0], MARGIN_X, y);
        if (datesStr) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.8);
          doc.setTextColor(71, 85, 105);
          doc.text(datesStr, PAGE_W - MARGIN_X, y, { align: 'right' });
        }
        y += 4.5;

        if (headingLines.length > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.8);
          doc.setTextColor(15, 23, 42);
          for (let h = 1; h < headingLines.length; h++) {
            doc.text(headingLines[h], MARGIN_X, y);
            y += 4.4;
          }
        }

        const bulletLines = (exp.bullets || '').split('\n').map(b => b.trim()).filter(Boolean);
        for (const rawBullet of bulletLines) {
          const cleanBullet = rawBullet.replace(/^[•\-\*]\s*/, '');
          y = drawJustifiedPdfBlock(doc, cleanBullet, MARGIN_X + 5.5, y, CONTENT_W - 5.5, {
            fontSize: 9.2,
            lineHeight: 4.4,
            color: [30, 41, 59],
            justify: true,
            bullet: true,
            bulletX: MARGIN_X + 2.2,
            maxY: MAX_Y,
            newPageY: NEW_PAGE_Y
          });
          y += 0.9;
        }
        y += 2.6;
      }
      y += 1.2;
    }

    // ------------------------------------------------------------------------
    // 5. KEY PROJECTS (COLLISION-FREE TITLE + TECH STACK, JUSTIFIED DESC)
    // ------------------------------------------------------------------------
    if (data.projects.length > 0) {
      y = drawPdfSectionHeading(doc, 'KEY PROJECTS', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);

      for (const proj of data.projects) {
        const pTitle = sanitizePdfLine(proj.title || 'Project');
        const pTech = sanitizePdfLine(proj.tech || '');
        const descLines = (proj.desc || '').split('\n').map(l => l.trim()).filter(Boolean);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        const pTitleW = doc.getTextWidth(pTitle);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.8);
        const pTechW = pTech ? doc.getTextWidth(pTech) : 0;

        // Estimate block height so short projects stay cleanly together instead of splitting 1 orphan line across pages
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        let estDescLines = 0;
        for (const dl of descLines) {
          estDescLines += doc.splitTextToSize(sanitizePdfLine(dl.replace(/^[•\-\*]\s*/, '')), descLines.length > 1 ? CONTENT_W - 5.5 : CONTENT_W).length;
        }
        const headerH = (pTech && (pTitleW + pTechW + 8 <= CONTENT_W)) ? 4.5 : (4.5 + (pTech ? 4.5 : 0));
        const estProjH = Math.min(34, headerH + estDescLines * 4.5 + 2);

        if (y + estProjH > MAX_Y) {
          doc.addPage();
          y = NEW_PAGE_Y;
        }

        if (pTech && (pTitleW + pTechW + 8 <= CONTENT_W)) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.8);
          doc.setTextColor(15, 23, 42);
          doc.text(pTitle, MARGIN_X, y);

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.8);
          doc.setTextColor(71, 85, 105);
          doc.text(pTech, PAGE_W - MARGIN_X, y, { align: 'right' });
          y += 4.5;
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.8);
          doc.setTextColor(15, 23, 42);
          const pTitleLines = doc.splitTextToSize(pTitle, CONTENT_W);
          for (const tl of pTitleLines) {
            doc.text(tl, MARGIN_X, y);
            y += 4.4;
          }
          if (pTech) {
            y = drawJustifiedPdfBlock(doc, `Tech Stack: ${pTech}`, MARGIN_X, y, CONTENT_W, {
              fontSize: 8.6,
              lineHeight: 4.1,
              color: [71, 85, 105],
              fontStyle: 'italic',
              justify: false,
              maxY: MAX_Y,
              newPageY: NEW_PAGE_Y
            });
            y += 0.4;
          }
        }

        if (descLines.length > 1) {
          for (const dl of descLines) {
            const cleanDl = dl.replace(/^[•\-\*]\s*/, '');
            y = drawJustifiedPdfBlock(doc, cleanDl, MARGIN_X + 5.5, y, CONTENT_W - 5.5, {
              fontSize: 9.2,
              lineHeight: 4.4,
              color: [30, 41, 59],
              justify: true,
              bullet: true,
              bulletX: MARGIN_X + 2.2,
              maxY: MAX_Y,
              newPageY: NEW_PAGE_Y
            });
            y += 0.8;
          }
        } else if (descLines.length === 1) {
          y = drawJustifiedPdfBlock(doc, descLines[0], MARGIN_X, y, CONTENT_W, {
            fontSize: 9.2,
            lineHeight: 4.5,
            color: [30, 41, 59],
            justify: true,
            maxY: MAX_Y,
            newPageY: NEW_PAGE_Y
          });
        }
        y += 2.6;
      }
      y += 1.2;
    }

    // ------------------------------------------------------------------------
    // 6. EDUCATION
    // ------------------------------------------------------------------------
    if (data.educations.length > 0) {
      y = drawPdfSectionHeading(doc, 'EDUCATION', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);

      for (const edu of data.educations) {
        if (y + 12 > MAX_Y) {
          doc.addPage();
          y = NEW_PAGE_Y;
        }

        const degreeStr = sanitizePdfLine(
          edu.degree ? (edu.score ? `${edu.degree} (${edu.score})` : edu.degree) : (edu.score || 'Education')
        );
        const datesStr = sanitizePdfLine(edu.dates || '');
        const schoolStr = sanitizePdfLine(edu.school || '');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        const datesW = datesStr ? doc.getTextWidth(datesStr) : 0;
        const degMaxW = datesStr ? Math.max(95, CONTENT_W - datesW - 6) : CONTENT_W;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.6);
        doc.setTextColor(15, 23, 42);
        const degLines = doc.splitTextToSize(degreeStr, degMaxW);

        doc.text(degLines[0], MARGIN_X, y);
        if (datesStr) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.8);
          doc.setTextColor(71, 85, 105);
          doc.text(datesStr, PAGE_W - MARGIN_X, y, { align: 'right' });
        }
        y += 4.3;

        if (degLines.length > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.6);
          doc.setTextColor(15, 23, 42);
          for (let d = 1; d < degLines.length; d++) {
            doc.text(degLines[d], MARGIN_X, y);
            y += 4.2;
          }
        }

        if (schoolStr) {
          y = drawJustifiedPdfBlock(doc, schoolStr, MARGIN_X, y, CONTENT_W, {
            fontSize: 9.0,
            lineHeight: 4.2,
            color: [71, 85, 105],
            justify: false,
            maxY: MAX_Y,
            newPageY: NEW_PAGE_Y
          });
        }
        y += 2.4;
      }
      y += 1.2;
    }

    // ------------------------------------------------------------------------
    // 7. CERTIFICATIONS & HONORS
    // ------------------------------------------------------------------------
    if (data.certifications) {
      y = drawPdfSectionHeading(doc, 'CERTIFICATIONS & HONORS', y, MARGIN_X, CONTENT_W, MAX_Y, NEW_PAGE_Y);
      const certLines = data.certifications.split('\n').map(l => l.trim()).filter(Boolean);
      if (certLines.length > 1) {
        for (const cl of certLines) {
          const cleanCl = cl.replace(/^[•\-\*]\s*/, '');
          y = drawJustifiedPdfBlock(doc, cleanCl, MARGIN_X + 5.5, y, CONTENT_W - 5.5, {
            fontSize: 9.2,
            lineHeight: 4.4,
            color: [30, 41, 59],
            justify: true,
            bullet: true,
            bulletX: MARGIN_X + 2.2,
            maxY: MAX_Y,
            newPageY: NEW_PAGE_Y
          });
          y += 0.8;
        }
      } else if (certLines.length === 1) {
        y = drawJustifiedPdfBlock(doc, certLines[0], MARGIN_X, y, CONTENT_W, {
          fontSize: 9.3,
          lineHeight: 4.6,
          color: [30, 41, 59],
          justify: true,
          maxY: MAX_Y,
          newPageY: NEW_PAGE_Y
        });
      }
    }

    // Add subtle page numbers ONLY on multi-page resumes
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${p} of ${totalPages}`, PAGE_W / 2, PAGE_H - 7, { align: 'center' });
      }
    }

    const candidateName = sanitizePdfLine(data.fullName || 'Resume');
    const cleanFileName = `${candidateName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Resume.pdf`;
    doc.save(cleanFileName);
  } catch (err) {
    console.error("Vector PDF generation error, falling back to print:", err);
    printResumeDocument();
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

function printResumeDocument() {
  window.print();
}

function copyText(btnElement) {
  const textToCopy = btnElement.parentElement.querySelector('.highlight-text').innerText;
  navigator.clipboard.writeText(textToCopy);
  const originalText = btnElement.innerText;
  btnElement.innerText = 'Copied!';
  setTimeout(() => {
    btnElement.innerText = originalText;
  }, 2000);
}

