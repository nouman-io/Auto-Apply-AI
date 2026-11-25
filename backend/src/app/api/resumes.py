from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
import logging

from src.app.db.database import get_db
from src.app.core.security import get_current_user
from src.app.db.models import User, Profile, UserSettings
from src.app.services.storage import get_storage_provider
from src.app.core.config import settings
from src.app.services.pdf_parser import extract_text_from_pdf
from src.app.services.resume_parser import parse_resume_text
from src.app.services.ats_checker import evaluate_resume_ats
from src.app.services.llm_client import build_llm_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resumes", tags=["resumes"])

MAX_UPLOAD_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
ALLOWED_RESUME_EXTENSIONS = (".pdf", ".doc", ".docx", ".txt")


def validate_resume_upload(file: UploadFile, content: bytes):
    filename = (file.filename or "").lower()
    if not filename.endswith(ALLOWED_RESUME_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, DOC, DOCX, or TXT files are supported.",
        )
    if not content or not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )


class ATSCheckRequest(BaseModel):
    target_role: Optional[str] = Field(None, description="Target job title/role")
    job_description: Optional[str] = Field(None, description="Optional job description")


@router.post("/upload")
def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload resume file, extract full structured details (summary, skills, experience,
    education, projects, contact links), and run ATS scoring.
    """
    uid = current_user.id
    content = file.file.read()
    validate_resume_upload(file, content)

    storage = get_storage_provider()
    file_url = storage.upload(content, file.filename)

    raw_text = extract_text_from_pdf(content)
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    llm_cfg = build_llm_config(user_settings)

    parsed_info = parse_resume_text(raw_text, llm_config=llm_cfg)
    target_role = (
        user_settings.target_roles[0]
        if user_settings and user_settings.target_roles
        else None
    )
    ats_results = evaluate_resume_ats(parsed_info, target_role=target_role, llm_config=llm_cfg)

    profile = db.query(Profile).filter(Profile.user_id == uid).first()
    if not profile:
        profile = Profile(user_id=uid)
        db.add(profile)

    profile.resume_url = file_url
    profile.raw_resume_text = raw_text
    if parsed_info.get("full_name"):
        profile.full_name = parsed_info["full_name"]
    if parsed_info.get("phone"):
        profile.phone = parsed_info["phone"]
    if parsed_info.get("github_url") and not profile.github_url:
        profile.github_url = parsed_info["github_url"]
    if parsed_info.get("linkedin_url") and not profile.other_url:
        profile.other_url = parsed_info["linkedin_url"]
    if parsed_info.get("portfolio_url") and not profile.portfolio_url:
        profile.portfolio_url = parsed_info["portfolio_url"]

    profile.summary = parsed_info.get("summary") or ""
    profile.skills = parsed_info.get("skills") or []
    profile.experience = parsed_info.get("experience") or []
    profile.education = parsed_info.get("education") or []
    profile.projects = parsed_info.get("projects") or []
    profile.languages = parsed_info.get("languages") or []
    profile.ats_score = ats_results.get("ats_score", 0)
    profile.ats_breakdown = {
        "formatting_score": ats_results.get("formatting_score", 0),
        "keyword_density_score": ats_results.get("keyword_density_score", 0),
        "action_verbs_score": ats_results.get("action_verbs_score", 0),
        "section_completeness_score": ats_results.get("section_completeness_score", 0),
    }
    profile.ats_suggestions = ats_results.get("ats_suggestions", {})

    db.commit()
    db.refresh(profile)

    return {
        "filename": file.filename,
        "resume_url": file_url,
        "full_name": profile.full_name,
        "summary": profile.summary,
        "skills": profile.skills,
        "experience": profile.experience,
        "education": profile.education,
        "projects": profile.projects,
        "languages": profile.languages,
        "github_url": profile.github_url,
        "linkedin_url": profile.other_url,
        "portfolio_url": profile.portfolio_url,
        "ats_score": profile.ats_score,
        "formatting_score": profile.ats_breakdown.get("formatting_score", 0),
        "keyword_density_score": profile.ats_breakdown.get("keyword_density_score", 0),
        "action_verbs_score": profile.ats_breakdown.get("action_verbs_score", 0),
        "section_completeness_score": profile.ats_breakdown.get("section_completeness_score", 0),
        "ats_suggestions": profile.ats_suggestions,
    }


@router.get("/profile")
def get_resume_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the authenticated user's extracted resume profile, projects, and ATS score."""
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume profile found for this user. Please upload a resume first.",
        )

    breakdown = profile.ats_breakdown or {}
    return {
        "resume_url": profile.resume_url,
        "full_name": profile.full_name,
        "phone": profile.phone,
        "summary": profile.summary,
        "skills": profile.skills or [],
        "experience": profile.experience or [],
        "education": profile.education or [],
        "projects": profile.projects or [],
        "languages": profile.languages or [],
        "ats_score": profile.ats_score,
        "formatting_score": breakdown.get("formatting_score", 0),
        "keyword_density_score": breakdown.get("keyword_density_score", 0),
        "action_verbs_score": breakdown.get("action_verbs_score", 0),
        "section_completeness_score": breakdown.get("section_completeness_score", 0),
        "ats_suggestions": profile.ats_suggestions or {},
    }


@router.post("/ats-check")
def run_ats_check(
    payload: ATSCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run an ATS evaluation on the user's parsed resume profile and projects."""
    uid = current_user.id
    profile = db.query(Profile).filter(Profile.user_id == uid).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume profile found. Please upload a resume first.",
        )

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    llm_cfg = build_llm_config(user_settings)
    profile_data = {
        "skills": profile.skills or [],
        "experience": profile.experience or [],
        "education": profile.education or [],
        "projects": profile.projects or [],
        "languages": profile.languages or [],
    }
    target = payload.target_role or (payload.job_description[:100] if payload.job_description else None)
    ats_results = evaluate_resume_ats(profile_data, target_role=target, llm_config=llm_cfg)

    profile.ats_score = ats_results.get("ats_score")
    profile.ats_breakdown = {
        "formatting_score": ats_results.get("formatting_score", 0),
        "keyword_density_score": ats_results.get("keyword_density_score", 0),
        "action_verbs_score": ats_results.get("action_verbs_score", 0),
        "section_completeness_score": ats_results.get("section_completeness_score", 0),
    }
    profile.ats_suggestions = ats_results.get("ats_suggestions", {})
    db.commit()
    db.refresh(profile)

    return {
        "ats_score": profile.ats_score,
        "formatting_score": profile.ats_breakdown["formatting_score"],
        "keyword_density_score": profile.ats_breakdown["keyword_density_score"],
        "action_verbs_score": profile.ats_breakdown["action_verbs_score"],
        "section_completeness_score": profile.ats_breakdown["section_completeness_score"],
        "ats_suggestions": profile.ats_suggestions,
    }
