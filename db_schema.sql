-- ============================================================================
-- ResuMind AI - Relational Database Schema (SQLite / PostgreSQL Compatible)
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    target_role TEXT DEFAULT 'Software Engineer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. RESUMES & ATS AUDIT HISTORY TABLE
CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    raw_text TEXT,
    ats_score INTEGER NOT NULL,
    target_role TEXT,
    detected_skills_json TEXT,
    missing_keywords_json TEXT,
    ats_checks_json TEXT,
    bullet_rewrites_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. JOB DESCRIPTION MATCHES TABLE
CREATE TABLE IF NOT EXISTS jd_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resume_id INTEGER,
    job_title TEXT,
    jd_text TEXT NOT NULL,
    match_percentage INTEGER NOT NULL,
    match_summary TEXT,
    gap_matrix_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
);

-- 4. INTERVIEW SESSIONS TABLE
CREATE TABLE IF NOT EXISTS interview_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role_focus TEXT NOT NULL,
    round_type TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Mid-Level',
    overall_score TEXT,
    total_questions INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. INTERVIEW QUESTIONS & ANSWERS TABLE
CREATE TABLE IF NOT EXISTS interview_qa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    candidate_answer TEXT,
    ai_score TEXT,
    strengths_json TEXT,
    missed_json TEXT,
    model_answer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
);

-- INDEXES FOR FAST SEARCH & AUDIT RETRIEVAL
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_jd_matches_user_id ON jd_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
