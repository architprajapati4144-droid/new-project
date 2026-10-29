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

    # Ensure all columns exist (SQLite migration check)
    cursor.execute("PRAGMA table_info(users)")
    existing_cols = [row["name"] for row in cursor.fetchall()]
    
    if "experience_level" not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN experience_level TEXT DEFAULT 'Mid-Level (2-4 yrs)'")
    if "target_industry" not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN target_industry TEXT DEFAULT 'Tech & Software Products'")
    if "target_skills" not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN target_skills TEXT DEFAULT ''")

    conn.commit()

    # Check if seed user exists
    cursor.execute("SELECT id FROM users WHERE email = ?", ("archit@example.com",))
    if not cursor.fetchone():
        seed_user_id = create_user("Archit Prajapati", "archit@example.com", "password123", "Senior Full Stack Engineer", "Senior Level (5-8 yrs)", "Tech & Software Products", "JavaScript, React, Node.js, PostgreSQL")
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
def create_user(name: str, email: str, password: str, role: str = "Software Engineer",
                experience_level: str = "Mid-Level (2-4 yrs)",
                target_industry: str = "Tech & Software Products",
                target_skills: str = "") -> Optional[int]:
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    try:
        cursor.execute(
            """INSERT INTO users (name, email, password_hash, target_role, experience_level, target_industry, target_skills) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, email.lower().strip(), pwd_hash, role, experience_level, target_industry, target_skills)
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
        "SELECT id, name, email, target_role, experience_level, target_industry, target_skills, created_at FROM users WHERE email = ? AND password_hash = ?",
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
        "SELECT id, name, email, target_role, experience_level, target_industry, target_skills, created_at FROM users WHERE email = ?",
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

def get_user_jd_matches(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, job_title, match_percentage, created_at
        FROM jd_matches WHERE user_id = ? ORDER BY created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_user_interview_sessions(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, role_focus, round_type, difficulty, overall_score, created_at
        FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

init_db()
