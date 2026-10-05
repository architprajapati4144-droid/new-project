"""
ResuMind AI - Local Python Backend Server (FastAPI + SQLite Relational Database + LLM)
Run using: py -3 -m uvicorn server:app --reload --port 8000
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import db  # SQLite Database Manager

app = FastAPI(title="ResuMind AI Backend API & Relational Database", version="2.0.0")

# Enable CORS for browser frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Data Models
class UserRegisterModel(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Software Engineer"

class UserLoginModel(BaseModel):
    email: str
    password: str

class ResumeSaveModel(BaseModel):
    user_id: int
    filename: str
    raw_text: str
    ats_score: int
    target_role: str
    detected_skills: List[str] = []
    missing_keywords: List[str] = []
    ats_checks: List[dict] = []
    bullet_rewrites: List[dict] = []

class JdMatchSaveModel(BaseModel):
    user_id: int
    jd_text: str
    match_percentage: int
    match_summary: str
    gap_matrix: List[dict] = []
    job_title: str = "Target Position"

class InterviewSaveModel(BaseModel):
    user_id: int
    role_focus: str
    round_type: str
    difficulty: str = "Mid-Level"
    overall_score: str = "8.5/10"

@app.get("/")
def read_root():
    return {
        "status": "online",
        "database": "SQLite (resumind.db connected)",
        "message": "ResuMind AI Python Backend & Database API is Operational!"
    }

# 1. USER AUTHENTICATION ENDPOINTS (SQLITE DATABASE)
@app.post("/api/auth/register")
def register_user(user: UserRegisterModel):
    user_id = db.create_user(user.name, user.email, user.password, user.role)
    if not user_id:
        raise HTTPException(status_code=400, detail="Account with this email already exists.")
    
    user_data = db.get_user_by_email(user.email)
    return {"status": "success", "message": "User registered and saved to SQLite Database", "user": user_data}

@app.post("/api/auth/login")
def login_user(credentials: UserLoginModel):
    user = db.authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"status": "success", "message": "Login successful", "user": user}

@app.get("/api/user/profile/{email}")
def get_user_profile(email: str):
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in database.")
    
    # Include resume audits
    user['audits'] = db.get_user_resumes(user['id'])
    return user

# 2. RESUME AUDIT PERSISTENCE ENDPOINTS
@app.post("/api/resumes/save")
def save_resume(data: ResumeSaveModel):
    resume_id = db.save_resume_audit(
        user_id=data.user_id,
        filename=data.filename,
        raw_text=data.raw_text,
        ats_score=data.ats_score,
        target_role=data.target_role,
        detected_skills=data.detected_skills,
        missing_keywords=data.missing_keywords,
        ats_checks=data.ats_checks,
        bullet_rewrites=data.bullet_rewrites
    )
    return {"status": "success", "resume_id": resume_id, "message": "Resume audit stored in database"}

@app.get("/api/resumes/user/{user_id}")
def get_resumes(user_id: int):
    resumes = db.get_user_resumes(user_id)
    return {"user_id": user_id, "resumes": resumes}

# 3. JOB MATCH & INTERVIEW PERSISTENCE ENDPOINTS
@app.post("/api/jd-matches/save")
def save_jd_match(data: JdMatchSaveModel):
    match_id = db.save_jd_match(
        user_id=data.user_id,
        jd_text=data.jd_text,
        match_percentage=data.match_percentage,
        match_summary=data.match_summary,
        gap_matrix=data.gap_matrix,
        job_title=data.job_title
    )
    return {"status": "success", "match_id": match_id}

@app.post("/api/interviews/save")
def save_interview(data: InterviewSaveModel):
    session_id = db.save_interview_session(
        user_id=data.user_id,
        role_focus=data.role_focus,
        round_type=data.round_type,
        difficulty=data.difficulty,
        overall_score=data.overall_score
    )
    return {"status": "success", "session_id": session_id}

if __name__ == "__main__":
    print("Starting ResuMind AI Server with SQLite Database on http://127.0.0.1:8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
