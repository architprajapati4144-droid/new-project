/* ==========================================================================
   ResuMind AI - Application Logic, IndexedDB Browser Database & Backend Sync
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initBrowserIndexedDB();
  initNavigation();
  initAnalyzerTabs();
  initDropZone();
  initJdMatcher();
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

  const bRoleInput = document.getElementById('bRoleInput');
  if (bRoleInput && currentUser.role) {
    bRoleInput.value = currentUser.role;
  }

  const bSkillsInput = document.getElementById('bSkillsInput');
  if (bSkillsInput && currentUser.target_skills) {
    bSkillsInput.value = currentUser.target_skills;
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

  // 2. JD Match Rate
  let avgMatch = 0;
  if (currentUser.jd_matches && currentUser.jd_matches.length > 0) {
    const sum = currentUser.jd_matches.reduce((acc, m) => acc + (m.match_percentage || 0), 0);
    avgMatch = sum / currentUser.jd_matches.length;
  }
  const matchValOutof10 = (avgMatch / 10).toFixed(1);
  const matchRateEl = document.getElementById('dashMatchRate');
  if (matchRateEl) matchRateEl.innerText = `${matchValOutof10}/10`;

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

  if (!isBackendOnline) {
    simulateResumeAnalysis(resumeFileToUse, 88);
    saveUserAuditRecord(resumeFileToUse, currentUser ? currentUser.role : 'Software Engineer', 88);
    return;
  }

  const analyzeBtn = document.getElementById('analyzeResumeBtn');
  if (analyzeBtn) {
    analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Auditing Resume...';
    analyzeBtn.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/analyze-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_text: text,
        target_role: currentUser ? currentUser.role : 'Software Engineer',
        experience_level: currentUser ? (currentUser.experience_level || 'Mid-Level (2-5 yrs)') : 'Mid-Level (2-5 yrs)',
        target_skills: currentUser ? (currentUser.target_skills || '') : ''
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Backend AI Analysis failed');
    }

    const data = await res.json();
    const score = data.ats_score || 88;
    document.getElementById('resumeRoleTag').innerText = `Target: ${data.target_role || 'Candidate'}`;
    document.getElementById('scoreValue').innerText = (score / 10).toFixed(1);
    
    const dashoffset = 264 - (264 * score / 100);
    document.getElementById('scoreCircleProgress').style.strokeDashoffset = dashoffset;
    
    document.getElementById('scoreHeadline').innerText = data.headline || 'AI Audit Completed!';
    document.getElementById('scoreSubhead').innerText = data.subhead || '';

    const detectedContainer = document.getElementById('detectedSkills');
    detectedContainer.innerHTML = (data.detected_skills || []).map(s => `<span class="pill pill-green">${s}</span>`).join('');

    const missingContainer = document.getElementById('missingSkills');
    missingContainer.innerHTML = (data.missing_keywords || []).map(s => `<span class="pill pill-red">+ ${s}</span>`).join('');

    const atsList = document.getElementById('atsCheckList');
    atsList.innerHTML = (data.check_items || []).map(item => `
      <div class="check-item status-${item.type}">
        <i class="fa-solid fa-${item.type === 'pass' ? 'circle-check' : item.type === 'warn' ? 'circle-exclamation' : 'circle-xmark'}"></i>
        <div class="check-details">
          <strong>${item.title}</strong>
          <p>${item.desc}</p>
        </div>
      </div>
    `).join('');

    const bulletContainer = document.getElementById('bulletEnhanceContainer');
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

    saveUserAuditRecord(resumeFileToUse, data.target_role || 'Software Engineer', score);

  } catch (err) {
    alert(`Real AI Analysis Error: ${err.message}. Falling back to Sandbox Mode.`);
    simulateResumeAnalysis(resumeFileToUse, 88);
    saveUserAuditRecord(resumeFileToUse, 'Software Engineer', 88);
  } finally {
    if (analyzeBtn) {
      analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Re-Analyze Resume with AI';
      analyzeBtn.disabled = false;
    }
  }
}

function simulateResumeAnalysis(fileName, score) {
  document.getElementById('resumeRoleTag').innerText = `Target: Senior Software Engineer`;
  document.getElementById('scoreValue').innerText = (score / 10).toFixed(1);
  document.getElementById('scoreCircleProgress').style.strokeDashoffset = '32';
  document.getElementById('scoreHeadline').innerText = 'Top Tier Resume!';
  document.getElementById('scoreSubhead').innerText = 'Outstanding ATS formatting, contact links, and tech keyword density.';
}

/* --------------------------------------------------------------------------
   JOB DESCRIPTION MATCHER ENGINE WITH REAL AI
   -------------------------------------------------------------------------- */
function initJdMatcher() {
  const matchBtn = document.getElementById('runJdMatchBtn');
  if (!matchBtn) return;

  matchBtn.addEventListener('click', async () => {
    const jdResumeEl = document.getElementById('jdResumeTextArea');
    const resumeText = (jdResumeEl ? jdResumeEl.value.trim() : '') || currentExtractedResumeText || "Software engineer experienced with JavaScript, Python, React, and databases.";

    if (!jdText) {
      alert('Please paste a job description first.');
      return;
    }

    if (isBackendOnline) {
      matchBtn.innerText = '⚡ Real AI Calculating Gap Analysis...';
      matchBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE_URL}/api/ai/jd-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume_text: resumeText, jd_text: jdText })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Backend AI Job Match failed');
        }

        const data = await res.json();
        const scoreOutof10 = (data.match_percentage / 10).toFixed(1);
        document.getElementById('matchPercentVal').innerText = `${scoreOutof10}/10`;
        document.getElementById('matchTitle').innerText = data.match_title;
        document.getElementById('matchDesc').innerText = data.match_desc;
        document.getElementById('jdMatchProTip').innerHTML = `<strong>Pro-Tip:</strong> ${data.pro_tip}`;

        const matrixBody = document.getElementById('matrixBody');
        matrixBody.innerHTML = (data.matrix || []).map(m => `
          <tr>
            <td><strong>${m.skill}</strong></td>
            <td><span class="tag ${m.status === 'Found' ? 'tag-pass' : 'tag-fail'}">${m.status}</span></td>
            <td>${m.rec}</td>
          </tr>
        `).join('');

        saveUserJdMatchRecord(data.match_title || 'Target Position', data.match_percentage, data.match_desc, data.matrix);
        document.getElementById('jdMatchOutput').scrollIntoView({ behavior: 'smooth' });
        return;
      } catch (err) {
        console.warn('Real AI Matcher fallback:', err);
      } finally {
        matchBtn.innerText = 'Run Real AI Matcher & Skill Gap Analysis';
        matchBtn.disabled = false;
      }
    }

    const fallbackScore = 78;
    const scoreOutof10 = (fallbackScore / 10).toFixed(1);
    document.getElementById('matchPercentVal').innerText = `${scoreOutof10}/10`;
    document.getElementById('matchTitle').innerText = 'Moderate-High Alignment';
    saveUserJdMatchRecord('Software Developer Match', fallbackScore, 'Good overlap with core skills.', []);
    document.getElementById('jdMatchOutput').scrollIntoView({ behavior: 'smooth' });
  });
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
   AI RESUME BUILDER ENGINE WITH REAL AI
   -------------------------------------------------------------------------- */
function initResumeBuilder() {
  const roleInput = document.getElementById('bRoleInput');
  const summaryInput = document.getElementById('bSummaryInput');
  const skillsInput = document.getElementById('bSkillsInput');

  if (!roleInput) return;

  roleInput.addEventListener('input', () => {
    document.getElementById('pvTitle').innerText = roleInput.value.toUpperCase();
  });

  summaryInput.addEventListener('input', () => {
    document.getElementById('pvSummary').innerText = summaryInput.value;
  });

  skillsInput.addEventListener('input', () => {
    document.getElementById('pvSkills').innerHTML = `<strong>Technical Stack:</strong> ${skillsInput.value}`;
  });
}

async function enhanceSummaryWithAI() {
  const summaryInput = document.getElementById('bSummaryInput');
  const role = document.getElementById('bRoleInput').value;
  const btn = document.getElementById('btnAiEnhanceSummary');

  if (isBackendOnline) {
    btn.innerText = '⚡ AI Generating...';
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/enhance-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role, current_summary: summaryInput.value })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Backend summary enhancement failed');
      }

      const data = await res.json();
      summaryInput.value = data.enhanced_summary.trim();
      document.getElementById('pvSummary').innerText = data.enhanced_summary.trim();
      alert('✨ Real AI successfully enhanced your professional summary!');
      return;
    } catch (e) {
      alert(`AI Error: ${e.message}`);
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Real AI Enhance';
    }
  }

  summaryInput.value = `High-impact ${role} with proven expertise engineering resilient distributed systems, driving frontend performance optimizations, and scaling cloud-native microservices.`;
  document.getElementById('pvSummary').innerText = summaryInput.value;
  alert('✨ Enhanced summary with AI keywords!');
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
