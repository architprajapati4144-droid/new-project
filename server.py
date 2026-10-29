"""
ResuMind AI - Local Python Backend Server with Relational Database & Real Backend AI Integration
Run using: py -3 -m uvicorn server:app --reload --port 8000
"""

import os
import json
import urllib.request
import urllib.error
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import db  # SQLite Database Manager

# Helper to load .env manually (no python-dotenv dependency needed)
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip('"').strip("'")

# Load environment variables on startup
load_env()

app = FastAPI(title="ResuMind AI Backend API & SQLite Database", version="3.0.0")

# Enable CORS for browser frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# STATIC APPLICATION SERVING & HEALTH ENDPOINTS
# --------------------------------------------------------------------------
@app.get("/")
def serve_index():
    index_path = os.path.join(os.path.dirname(__file__), "index.html")
    return FileResponse(index_path)

@app.get("/styles.css")
def serve_css():
    css_path = os.path.join(os.path.dirname(__file__), "styles.css")
    return FileResponse(css_path)

@app.get("/app.js")
def serve_js():
    js_path = os.path.join(os.path.dirname(__file__), "app.js")
    return FileResponse(js_path)

@app.get("/api/status")
def read_status():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    has_key = len(api_key) > 0 and api_key != "YOUR_GEMINI_API_KEY_HERE"
    return {
        "status": "online",
        "database": "SQLite (resumind.db connected)",
        "backend_ai": "Active" if has_key else "Inactive (GEMINI_API_KEY not configured)",
        "message": "ResuMind AI Python Backend & SQLite Database Operational!"
    }

# --------------------------------------------------------------------------
# REQUEST DATA MODELS
# --------------------------------------------------------------------------
class UserRegisterModel(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Senior Full Stack Software Engineer"
    experience_level: str = "Mid-Level (2-4 yrs)"
    target_industry: str = "Tech & Software Products"
    target_skills: str = ""

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

# AI Specific Models
class AIResumeAnalyzeRequest(BaseModel):
    resume_text: str
    target_role: str
    experience_level: Optional[str] = "Mid-Level (2-4 yrs)"
    target_skills: Optional[str] = ""

class AIJdMatchRequest(BaseModel):
    resume_text: str
    jd_text: str

class AIQuestionGenRequest(BaseModel):
    role: str
    round_type: str
    difficulty: str
    question_index: int

class AIAnswerEvaluateRequest(BaseModel):
    question: str
    candidate_answer: str

class AIEnhanceSummaryRequest(BaseModel):
    role: str
    current_summary: str

# --------------------------------------------------------------------------
# GOOGLE GEMINI API CONNECTOR
# --------------------------------------------------------------------------
def call_gemini(prompt: str, system_instruction: str = "You are a professional recruiting assistant.") -> str:
    """Queries Google Gemini API using native urllib library (no extra pip modules required)."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    
    # Fallback to local config file if not set in environment
    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        raise HTTPException(
            status_code=500, 
            detail="Backend GEMINI_API_KEY is not configured. Please add your key to the '.env' file."
        )

    # Use standard gemini-2.0-flash model
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_instruction}\n\n{prompt}"}]
            }
        ]
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        try:
            error_json = json.loads(error_msg)
            msg = error_json.get("error", {}).get("message", "Unknown Gemini error")
        except:
            msg = f"HTTP Error {e.code}"
        raise HTTPException(status_code=502, detail=f"Gemini API Gateway Error: {msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with AI model: {str(e)}")

def parse_json_response(raw_reply: str) -> dict:
    """Strips markdown block wrappers and parses JSON safely."""
    clean_str = raw_reply.strip()
    if clean_str.startswith("```json"):
        clean_str = clean_str[7:]
    if clean_str.startswith("```"):
        clean_str = clean_str[3:]
    if clean_str.endswith("```"):
        clean_str = clean_str[:-3]
    return json.loads(clean_str.strip())

# --------------------------------------------------------------------------
# BACKEND REAL AI ENDPOINTS
# --------------------------------------------------------------------------
@app.post("/api/ai/analyze-resume")
def ai_analyze_resume(req: AIResumeAnalyzeRequest):
    system_instruction = "You are a professional ATS resume auditor. You respond in strict JSON matching the requested structure."
    prompt = f"""
Analyze this resume text and provide output in strict JSON format:
Resume Text:
\"\"\"
{req.resume_text}
\"\"\"

Target Job Role: {req.target_role}
Experience Level: {req.experience_level or "Not specified"}
Target Skills / Requirements: {req.target_skills or "Standard industry requirements"}

Evaluate the resume specifically tailored to the requirements of this target job role, experience tier, and target skills.

Return JSON ONLY matching this structure:
{{
  "target_role": "String summary of target role",
  "ats_score": 85,
  "headline": "Short evaluation headline (e.g. Excellent Compatibility)",
  "subhead": "Detailed evaluation summary (2 sentences)",
  "detected_skills": ["Skill 1", "Skill 2", "Skill 3"],
  "missing_keywords": ["Missing 1", "Missing 2"],
  "check_items": [
    {{"type": "pass", "title": "Contact Info & Links", "desc": "Parsed successfully"}},
    {{"type": "warn", "title": "Quantified Metrics", "desc": "Only 30% of bullets contain numbers"}}
  ],
  "bullet_enhancements": [
    {{"original": "Worked on backend using Node.js", "improved": "Architected backend microservices in Node.js, improving load times by 30%"}}
  ]
}}
"""
    raw_reply = call_gemini(prompt, system_instruction)
    try:
        return parse_json_response(raw_reply)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse AI response: {str(e)}. Raw: {raw_reply}")

@app.post("/api/ai/jd-match")
def ai_jd_match(req: AIJdMatchRequest):
    system_instruction = "You are an expert recruiter matching resumes to JDs. Respond in strict JSON only."
    prompt = f"""
Compare this Resume against the Job Description and return a JSON match report:

Resume:
\"\"\"{req.resume_text}\"\"\"

Job Description:
\"\"\"{req.jd_text}\"\"\"

Return JSON format ONLY:
{{
  "match_percentage": 82,
  "match_title": "Strong Candidate Fit",
  "match_desc": "Summary explanation of overlap",
  "pro_tip": "Specific recommendation to improve match score",
  "matrix": [
    {{"skill": "React.js", "status": "Found", "rec": "Keep in top section"}},
    {{"skill": "Kubernetes", "status": "Missing", "rec": "Add experience with containers"}}
  ]
}}
"""
    raw_reply = call_gemini(prompt, system_instruction)
    try:
        return parse_json_response(raw_reply)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse AI response: {str(e)}")

@app.post("/api/ai/interview-question")
def ai_interview_question(req: AIQuestionGenRequest):
    system_instruction = f"You are a Senior Tech Lead conducting a job interview for a {req.role}."
    prompt = f"Generate 1 realistic, challenging interview question for a {req.role} candidates during a {req.round_type} round at a {req.difficulty} level. Return ONLY the question text inside quotes. No extra explanations."
    
    raw_reply = call_gemini(prompt, system_instruction)
    return {"question": raw_reply.strip().replace('"', '')}

@app.post("/api/ai/evaluate-answer")
def ai_evaluate_answer(req: AIAnswerEvaluateRequest):
    system_instruction = "You are an Executive Tech Recruiter giving STAR feedback. Respond in strict JSON only."
    prompt = f"""
Question: \"{req.question}\"
Candidate Answer: \"{req.candidate_answer}\"

Evaluate this response and return JSON format ONLY:
{{
  "score": "8.5/10",
  "strengths": ["Strength 1", "Strength 2"],
  "missed": ["Point missed 1", "Point missed 2"],
  "model_answer": "Model STAR response for reference..."
}}
"""
    raw_reply = call_gemini(prompt, system_instruction)
    try:
        return parse_json_response(raw_reply)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse AI feedback: {str(e)}")

@app.post("/api/ai/enhance-summary")
def ai_enhance_summary(req: AIEnhanceSummaryRequest):
    system_instruction = "You are a professional executive resume writer."
    prompt = f"Write a punchy, executive 3-sentence professional resume summary for a candidate targeting a \"{req.role}\" position. Current draft: \"{req.current_summary}\". Return only the enhanced text."
    
    enhanced = call_gemini(prompt, system_instruction)
    return {"enhanced_summary": enhanced.strip()}

# --------------------------------------------------------------------------
# USER AUTHENTICATION ENDPOINTS (SQLITE DATABASE)
# --------------------------------------------------------------------------
@app.post("/api/auth/register")
def register_user(user: UserRegisterModel):
    user_id = db.create_user(
        user.name, user.email, user.password, user.role,
        user.experience_level, user.target_industry, user.target_skills
    )
    if not user_id:
        raise HTTPException(status_code=400, detail="Account with this email already exists.")
    user_data = db.get_user_by_email(user.email)
    return {"status": "success", "message": "User registered successfully", "user": user_data}

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
        raise HTTPException(status_code=404, detail="User not found.")
    user['audits'] = db.get_user_resumes(user['id'])
    user['jd_matches'] = db.get_user_jd_matches(user['id'])
    user['interviews'] = db.get_user_interview_sessions(user['id'])
    return user

# --------------------------------------------------------------------------
# RESUME & DATA PERSISTENCE ENDPOINTS
# --------------------------------------------------------------------------
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
    return {"status": "success", "resume_id": resume_id}

@app.get("/api/resumes/user/{user_id}")
def get_resumes(user_id: int):
    resumes = db.get_user_resumes(user_id)
    return {"user_id": user_id, "resumes": resumes}

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
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting ResuMind AI Database & Backend AI Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

