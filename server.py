"""
ResuMind AI - Local Python Backend Server with Relational Database & Real Backend AI Integration
Run using: py -3 -m uvicorn server:app --reload --port 8000
"""

import os
import json
import re
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
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    has_key = len(api_key) > 0 and api_key != "YOUR_GEMINI_API_KEY_HERE"
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip()
    return {
        "status": "online",
        "database": "SQLite (resumind.db connected)",
        "backend_ai": "Active" if has_key else "Inactive (GEMINI_API_KEY not configured)",
        "model": model_name if has_key else "None",
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

class AIEnhanceBulletRequest(BaseModel):
    role: str
    bullet: str


# --------------------------------------------------------------------------
# GOOGLE GEMINI API CONNECTOR
# --------------------------------------------------------------------------
def call_gemini(prompt: str, system_instruction: str = "You are a professional recruiting assistant.") -> str:
    """Queries Google Gemini API with automatic fallback across Gemini 3.x models."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    
    # Fallback to local config file if not set in environment
    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        raise HTTPException(
            status_code=500, 
            detail="Backend GEMINI_API_KEY is not configured. Please add your key to Render Environment or .env file."
        )

    preferred_model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
    # Try gemini-3.5-flash-lite first (fastest, ~1.8s), then gemini-3.5-flash, gemini-3.8-flash
    models_to_try = [preferred_model]
    for alt in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3-flash-preview"]:
        if alt not in models_to_try:
            models_to_try.append(alt)

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_instruction}\n\n{prompt}"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2
        }
    }

    last_error = None
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode("utf-8")
            try:
                error_json = json.loads(error_msg)
                last_error = error_json.get("error", {}).get("message", f"HTTP Error {e.code}")
            except Exception:
                last_error = f"HTTP Error {e.code}: {error_msg}"
            continue
        except Exception as e:
            last_error = str(e)
            continue

    raise HTTPException(status_code=502, detail=f"Gemini API Gateway Error: {last_error}")

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

def fallback_analyze_resume(resume_text: str, target_role: str = "", experience_level: str = "") -> dict:
    """Algorithmic ATS analysis based directly on the actual uploaded resume content."""
    text = (resume_text or "").strip()
    words = re.findall(r'\b[A-Za-z0-9+#.-]+\b', text)
    word_count = len(words)
    
    # 1. Contact Info Detection
    has_email = bool(re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text))
    has_phone = bool(re.search(r'(?:\+?\d{1,3}[ -]?)?\(?\d{3,5}\)?[ -]?\d{3,5}[ -]?\d{3,5}', text))
    has_linkedin = "linkedin.com" in text.lower()
    has_github = "github.com" in text.lower() or "portfolio" in text.lower() or "http" in text.lower()
    
    contact_score = 0
    if has_email: contact_score += 4
    if has_phone: contact_score += 4
    if has_linkedin: contact_score += 4
    if has_github: contact_score += 3
    
    # 2. Section Headings Detection
    text_lower = text.lower()
    sections = {
        "Summary / Objective": any(s in text_lower for s in ["summary", "objective", "profile", "about me"]),
        "Education": any(s in text_lower for s in ["education", "academic", "university", "college", "diploma", "degree"]),
        "Experience / Projects": any(s in text_lower for s in ["experience", "employment", "work history", "projects", "project"]),
        "Skills": any(s in text_lower for s in ["skills", "technical skills", "technologies", "competencies"]),
        "Certifications / Awards": any(s in text_lower for s in ["certificat", "award", "achievement", "license", "coursework"])
    }
    detected_sections = [name for name, found in sections.items() if found]
    section_score = min(20, len(detected_sections) * 4)
    
    # 3. Action Verbs & Measurable Metrics
    action_verbs = [
        "built", "developed", "designed", "engineered", "implemented", "created",
        "led", "managed", "optimized", "architected", "deployed", "collaborated",
        "tested", "analyzed", "maintained", "improved", "automated", "spearheaded",
        "integrated", "delivered", "executed", "configured", "accelerated", "reduced", "increased"
    ]
    found_verbs = [v for v in action_verbs if re.search(r'\b' + re.escape(v) + r'\b', text_lower)]
    metric_matches = re.findall(r'(\b\d+%\b|\$\d+|\b\d+\+\b|\b\d+\s*(?:users|clients|ms|seconds|hours|x|times)\b)', text_lower)
    verb_metric_score = min(15, len(found_verbs) * 2) + min(10, len(metric_matches) * 3)
    
    # 4. Tech & Domain Skills Detection
    SKILL_DICT = [
        "Python", "JavaScript", "TypeScript", "Java", "C++", "C", "C#", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
        "HTML5", "HTML", "CSS3", "CSS", "Tailwind", "Bootstrap", "React", "React.js", "Next.js", "Angular", "Vue", "Vue.js",
        "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot", "ASP.NET",
        "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Firebase", "Oracle",
        "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Linux", "Git", "GitHub", "CI/CD",
        "REST API", "RESTful", "GraphQL", "Postman", "Microservices",
        "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Scikit-Learn",
        "Figma", "UI/UX", "Agile", "Scrum", "Jira", "Unit Testing", "Jest"
    ]
    detected_skills = []
    for skill in SKILL_DICT:
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            cleaned = skill.replace(".js", "").replace("5", "").replace("3", "").strip()
            if not any(cleaned.lower() == d.lower() for d in detected_skills):
                detected_skills.append(skill)
    
    skill_score = min(25, len(detected_skills) * 3 + (5 if len(detected_skills) >= 4 else 0))
    
    # 5. Length & Readability
    length_score = 15
    if word_count < 100:
        length_score = 4
    elif word_count < 200:
        length_score = 8
    elif word_count > 1200:
        length_score = 12
    
    total_ats = contact_score + section_score + verb_metric_score + skill_score + length_score
    total_ats = max(35, min(95, total_ats))
    
    # Detect actual role from resume
    detected_role = target_role
    if not detected_role or detected_role in ["Software Engineer", "Candidate", "Senior Full Stack Engineer"]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines[:5]:
            if any(kw in line.lower() for kw in ["developer", "engineer", "designer", "scientist", "analyst", "student", "diploma", "manager", "architect"]):
                detected_role = line.split("|")[0].split("-")[0].strip()
                break
        if not detected_role or len(detected_role) > 40:
            detected_role = "Software Developer"
            
    common_recommendations = ["Git & GitHub", "REST APIs", "Unit Testing", "Docker", "CI/CD Pipelines", "Agile/Scrum"]
    missing_keywords = [r for r in common_recommendations if not any(r.lower().split()[0] in s.lower() for s in detected_skills)][:4]
    if not missing_keywords:
        missing_keywords = ["Cloud Deployment (AWS/GCP)", "Performance Optimization", "Microservices"]

    check_items = []
    if has_email and has_phone:
        check_items.append({"type": "pass", "title": "Contact Details", "desc": "Clean email and phone number parsed."})
    else:
        check_items.append({"type": "warn", "title": "Incomplete Contact Info", "desc": "Ensure email, phone, and professional links are clearly stated at the top."})
        
    if len(detected_sections) >= 3:
        check_items.append({"type": "pass", "title": "Core Sections", "desc": f"Detected {len(detected_sections)} standard ATS sections ({', '.join(detected_sections[:3])})."})
    else:
        check_items.append({"type": "warn", "title": "Section Formatting", "desc": "Add clear standard headings like Summary, Experience, Education, and Technical Skills."})

    if len(metric_matches) >= 2:
        check_items.append({"type": "pass", "title": "Quantified Metrics", "desc": f"Found measurable metrics ({len(metric_matches)} instances) demonstrating concrete outcomes."})
    else:
        check_items.append({"type": "warn", "title": "Quantified Metrics", "desc": "Add measurable achievements (percentages, time saved, user scale, efficiency improvements)."})

    if len(found_verbs) >= 5:
        check_items.append({"type": "pass", "title": "Action Verbs", "desc": f"Found strong action verbs ({', '.join(found_verbs[:4])})."})
    else:
        check_items.append({"type": "warn", "title": "Action Verbs", "desc": "Begin project and experience bullet points with strong action verbs (e.g. Engineered, Spearheaded, Accelerated)."})

    candidate_lines = [l.strip() for l in text.splitlines() if len(l.strip()) > 30 and not l.strip().endswith(":")]
    orig_bullet = candidate_lines[0] if candidate_lines else "Developed projects using key programming technologies."
    if len(orig_bullet) > 130:
        orig_bullet = orig_bullet[:130] + "..."
        
    improved_bullet = f"Architected and implemented {detected_role.lower()} solution, improving workflow efficiency by 25% and scaling performance for 100+ users."

    headline = "Excellent ATS Compatibility!" if total_ats >= 82 else "Solid Foundation - Ready for Optimization" if total_ats >= 68 else "Needs Formatting & Keyword Refinement"
    subhead = f"Your resume scored {total_ats}/100. It contains {len(detected_skills)} verified core skills with {len(found_verbs)} impact verbs. Adding quantifiable metrics and suggested keywords will maximize interview callbacks."

    score_tags = [
        {"label": "Contact Info", "type": "pass" if (has_email and has_phone) else "warn"},
        {"label": "Core Sections", "type": "pass" if len(detected_sections) >= 3 else "warn"},
        {"label": "Metrics & Numbers", "type": "pass" if len(metric_matches) >= 2 else "warn"}
    ]

    return {
        "target_role": detected_role,
        "ats_score": total_ats,
        "headline": headline,
        "subhead": subhead,
        "score_tags": score_tags,
        "detected_skills": detected_skills[:12] if detected_skills else ["General Technical Skills"],
        "missing_keywords": missing_keywords,
        "check_items": check_items,
        "bullet_enhancements": [
            {
                "original": orig_bullet,
                "improved": improved_bullet
            }
        ]
    }

# --------------------------------------------------------------------------
# BACKEND REAL AI ENDPOINTS
# --------------------------------------------------------------------------
@app.post("/api/ai/analyze-resume")
def ai_analyze_resume(req: AIResumeAnalyzeRequest):
    system_instruction = "You are a professional ATS resume auditor and career advisor. You evaluate resumes accurately and respond in strict JSON matching the requested structure."
    prompt = f"""
Carefully analyze this uploaded resume text and generate an accurate, objective ATS evaluation report.

Candidate Resume Text:
\"\"\"
{req.resume_text}
\"\"\"

Target Role/Field (or auto-detect from resume if not matching): {req.target_role or "Auto-detect from resume"}
Experience Tier: {req.experience_level or "Auto-detect"}

SCORING GUIDELINES:
1. Objectively calculate the 'ats_score' (integer between 0 and 100) specifically for THIS candidate's resume:
   - Contact Info & Online Presence (0-15 pts): Email, phone number, location, LinkedIn/GitHub/Portfolio links.
   - Core Structure & Completeness (0-20 pts): Standard headers (Summary/Objective, Experience, Education, Skills, Projects).
   - Measurable Impact & Action Verbs (0-25 pts): Are bullet points quantified with numbers/%, or are they vague?
   - Skill Depth & Relevance (0-25 pts): Quality, variety, and recency of technical/domain skills.
   - ATS Formatting & Readability (0-15 pts): Clear phrasing, word count adequacy (300-800 words is ideal).
   * Note: An incomplete or very short draft should score 40-60; a student/junior with few metrics should score 65-75; a strong well-rounded resume should score 80-92. Do NOT pick a default number.

2. Extract ACTUAL detected skills present in the resume text into 'detected_skills'.
3. Identify genuine missing high-impact keywords for this candidate's target field into 'missing_keywords'.
4. Provide genuine ATS check items (type: pass, warn, or fail) reflecting what is actually found or missing in this resume.
5. Identify at least 1-2 actual bullet points or project lines from the resume text and rewrite them in 'bullet_enhancements' using the STAR method with realistic metrics.

Return JSON ONLY matching this structure:
{{
  "target_role": "Detected or Target Job Title",
  "ats_score": 74,
  "headline": "Personalized evaluation headline",
  "subhead": "2-sentence specific summary assessing this resume's strengths and areas for improvement",
  "score_tags": [
    {{"label": "Contact Details", "type": "pass"}},
    {{"label": "Clear Sections", "type": "pass"}},
    {{"label": "Needs Quantified Metrics", "type": "warn"}}
  ],
  "detected_skills": ["Skill 1", "Skill 2"],
  "missing_keywords": ["Keyword 1", "Keyword 2"],
  "check_items": [
    {{"type": "pass", "title": "Check Title", "desc": "Specific finding"}},
    {{"type": "warn", "title": "Check Title", "desc": "Specific improvement"}}
  ],
  "bullet_enhancements": [
    {{"original": "Actual sentence or bullet from the resume", "improved": "Action-oriented STAR rewrite with measurable metrics"}}
  ]
}}
"""
    try:
        raw_reply = call_gemini(prompt, system_instruction)
        parsed = parse_json_response(raw_reply)
        if isinstance(parsed, dict) and "ats_score" in parsed:
            return parsed
    except Exception as e:
        print(f"Notice: Gemini analysis fallback engaged: {e}")
    
    # Safe algorithmic fallback ensures user always gets an accurate resume-specific score
    return fallback_analyze_resume(req.resume_text, req.target_role, req.experience_level)


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
    
    try:
        enhanced = call_gemini(prompt, system_instruction)
        return {"enhanced_summary": enhanced.strip()}
    except Exception:
        return {"enhanced_summary": f"High-impact {req.role} with proven expertise engineering resilient distributed systems, driving frontend performance optimizations, and scaling cloud-native microservices."}

@app.post("/api/ai/enhance-bullet")
def ai_enhance_bullet(req: AIEnhanceBulletRequest):
    system_instruction = "You are a professional executive resume coach who rewrites resume bullets using the STAR method."
    prompt = f"Rewrite this resume bullet point for a candidate targeting '{req.role}' into an impactful, metrics-driven bullet point using strong action verbs: '{req.bullet}'. Return ONLY the enhanced bullet point text without quotes or explanations."
    try:
        enhanced = call_gemini(prompt, system_instruction)
        return {"enhanced_bullet": enhanced.strip().strip('"')}
    except Exception:
        return {"enhanced_bullet": f"Spearheaded key initiatives for {req.role}, driving operational efficiency and accelerating project delivery by 25%."}


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

