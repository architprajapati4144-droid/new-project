"""
ResuMind AI - SQLite Database Manager & CRUD Interface
Handles table initialization, password hashing, user registration,
resume audit persistence, JD matching history, and mock interview logs.
"""

import sqlite3
import hashlib
import json
import os
from typing import Dict, Any, List, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "resumind.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    """Hashes password with SHA-256 and salt."""
    salt = "ResuMind_AI_Secure_Salt_2026"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def init_db():
    """Creates database tables and inserts default seed data if database is new."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Load and execute SQL schema
    schema_path = os.path.join(os.path.dirname(__file__), "db_schema.sql")
    if os.path.exists(schema_path):
        with open(schema_path, "r", encoding="utf-8") as f:
            cursor.executescript(f.read())
    else:
        cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            target_role TEXT DEFAULT 'Software Engineer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

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
        """)

    conn.commit()

    # Check if seed user exists
    cursor.execute("SELECT id FROM users WHERE email = ?", ("archit@example.com",))
    if not cursor.fetchone():
        seed_user_id = create_user("Archit Prajapati", "archit@example.com", "password123", "Senior Full Stack Engineer")
        if seed_user_id:
            save_resume_audit(
                user_id=seed_user_id,
                filename="Archit_Prajapati_FullStack_2026.pdf",
                raw_text="Fullstack Developer Resume sample",
                ats_score=88,
                target_role="Senior Full Stack Engineer",
                detected_skills=["JavaScript", "React.js", "Node.js", "TypeScript", "PostgreSQL"],
                missing_keywords=["Docker", "Kubernetes", "CI/CD"],
                ats_checks=[{"type": "pass", "title": "Contact Info", "desc": "Clean format"}],
                bullet_rewrites=[{"original": "Built APIs", "improved": "Architected RESTful microservices"}]
            )
            print("[DB] Default seed user and sample resume saved to SQLite database successfully!")

    conn.close()

# USER OPERATIONS
def create_user(name: str, email: str, password: str, role: str = "Software Engineer") -> Optional[int]:
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, target_role) VALUES (?, ?, ?, ?)",
            (name, email.lower().strip(), pwd_hash, role)
        )
        conn.commit()
        user_id = cursor.lastrowid
        return user_id
    except sqlite3.IntegrityError:
        return None  # Email already exists
    finally:
        conn.close()

def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    cursor.execute(
        "SELECT id, name, email, target_role, created_at FROM users WHERE email = ? AND password_hash = ?",
        (email.lower().strip(), pwd_hash)
    )
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, email, target_role, created_at FROM users WHERE email = ?",
        (email.lower().strip(),)
    )
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

# RESUME AUDIT OPERATIONS
def save_resume_audit(user_id: int, filename: str, raw_text: str, ats_score: int, target_role: str,
                      detected_skills: List[str] = None, missing_keywords: List[str] = None,
                      ats_checks: List[Dict] = None, bullet_rewrites: List[Dict] = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO resumes (
            user_id, filename, raw_text, ats_score, target_role,
            detected_skills_json, missing_keywords_json, ats_checks_json, bullet_rewrites_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, filename, raw_text, ats_score, target_role,
        json.dumps(detected_skills or []),
        json.dumps(missing_keywords or []),
        json.dumps(ats_checks or []),
        json.dumps(bullet_rewrites or [])
    ))
    
    conn.commit()
    resume_id = cursor.lastrowid
    conn.close()
    return resume_id

def get_user_resumes(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, filename, ats_score, target_role, detected_skills_json, missing_keywords_json, created_at
        FROM resumes WHERE user_id = ? ORDER BY created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        item = dict(r)
        item['detected_skills'] = json.loads(item.pop('detected_skills_json') or '[]')
        item['missing_keywords'] = json.loads(item.pop('missing_keywords_json') or '[]')
        results.append(item)
    return results

# JOB DESCRIPTION MATCH OPERATIONS
def save_jd_match(user_id: int, jd_text: str, match_percentage: int, match_summary: str,
                  gap_matrix: List[Dict], job_title: str = "Target Position", resume_id: int = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO jd_matches (user_id, resume_id, job_title, jd_text, match_percentage, match_summary, gap_matrix_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, resume_id, job_title, jd_text, match_percentage, match_summary, json.dumps(gap_matrix or [])
    ))
    conn.commit()
    match_id = cursor.lastrowid
    conn.close()
    return match_id

# INTERVIEW SESSION OPERATIONS
def save_interview_session(user_id: int, role_focus: str, round_type: str, difficulty: str, overall_score: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO interview_sessions (user_id, role_focus, round_type, difficulty, overall_score)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, role_focus, round_type, difficulty, overall_score))
    conn.commit()
    session_id = cursor.lastrowid
    conn.close()
    return session_id

init_db()
