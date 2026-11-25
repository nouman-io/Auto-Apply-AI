import os
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.app.core.config import settings
from src.app.core.security import get_current_user
from src.app.db.database import get_db
from src.app.db.models import User, Profile, UserSettings, JobFound
from src.app.services.application.pipeline import (
    execute_job_application,
    get_effective_daily_limit,
    get_today_application_count,
    prepare_cover_letter_for_job,
    resolve_resume_local_path,
)
from src.app.services.auto_apply.runner import auto_apply_runner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auto-apply", tags=["Auto Apply"])


class ApplyRequest(BaseModel):
    job_id: int
    custom_cover_letter: Optional[str] = None


class AutoApplyBatchRequest(BaseModel):
    apply_count: Optional[int] = Field(None, ge=0, le=settings.DAILY_APPLY_MAX)
    job_count: Optional[int] = Field(None, ge=0, le=settings.DAILY_APPLY_MAX)


@router.get("/quota")
def get_daily_quota(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return how many applications the user has submitted today out of the 15 daily max."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    daily_max = get_effective_daily_limit(user_settings)
    today_applied = get_today_application_count(db, current_user.id)
    return {
        "today_applied": today_applied,
        "daily_max": daily_max,
        "remaining": max(0, daily_max - today_applied),
    }


@router.post("/preview")
def preview_application(
    payload: ApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an application preview for a job:
    - If authentic HR email found: email preview with recipient & cover letter.
    - If web-based: Playwright form-fill preview with target URL & cover letter.
    """
    job = db.query(JobFound).filter(JobFound.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile or not profile.resume_url:
        raise HTTPException(
            status_code=400,
            detail="No resume uploaded. Please upload your resume in Profile first.",
        )

    cv_path = resolve_resume_local_path(profile.resume_url)
    cover_letter = prepare_cover_letter_for_job(
        user=current_user,
        profile=profile,
        user_settings=user_settings,
        job=job,
        custom_cover_letter=payload.custom_cover_letter,
    )

    gmail_ready = bool(
        user_settings
        and user_settings.is_gmail_connected
        and (user_settings.smtp_app_password or user_settings.gmail_access_token)
    )
    use_email = bool(job.company_email and gmail_ready)
    sender_email = (user_settings.gmail_email_address if user_settings else None) or current_user.email

    return {
        "success": True,
        "preview": {
            "job_id": job.id,
            "job_title": job.title,
            "company": job.company,
            "apply_method": "email" if use_email else "playwright",
            "apply_url": job.apply_url or job.url,
            "recipient_email": job.company_email or "",
            "sender_email": sender_email,
            "subject": f"Application for {job.title} - {sender_email}",
            "cover_letter": cover_letter,
            "has_resume_attachment": bool(cv_path),
            "resume_filename": os.path.basename(cv_path) if cv_path else None,
            "gmail_connected": gmail_ready,
        },
    }


@router.post("/apply-one")
async def apply_single_job(
    payload: ApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply to one job immediately: Email if HR email found, else Playwright web form."""
    job = db.query(JobFound).filter(JobFound.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    res = await execute_job_application(
        db=db,
        user_id=current_user.id,
        job=job,
        custom_cover_letter=payload.custom_cover_letter,
    )
    if not res.get("success") and not res.get("application_id"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Application failed.")

    method_label = "Gmail" if res.get("apply_method") == "email" else "Playwright"
    return {
        "success": res.get("success", False),
        "apply_method": res.get("apply_method"),
        "application_id": res.get("application_id"),
        "recipient_email": res.get("recipient_email"),
        "gmail_message_id": res.get("gmail_message_id"),
        "screenshot_path": res.get("screenshot_path"),
        "error": res.get("error"),
        "message": (
            f"Applied to {job.company} ({job.title}) via {method_label}!"
            if res.get("success")
            else f"Apply attempt via {method_label} failed: {res.get('error', 'Unknown error')}"
        ),
    }


@router.post("/send-email")
async def send_email_application(
    payload: ApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backward-compatible single apply endpoint routing cleanly to unified pipeline."""
    return await apply_single_job(payload=payload, db=db, current_user=current_user)


@router.post("/start")
def start_auto_apply_batch(
    payload: AutoApplyBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start automated batch apply for 0 -> 15 jobs (daily max 15).
    Uses Playwright for web-based jobs and Gmail when an HR email is found.
    """
    uid = current_user.id
    profile = db.query(Profile).filter(Profile.user_id == uid).first()
    if not profile or not profile.resume_url:
        raise HTTPException(
            status_code=400,
            detail="No resume found. Please upload your resume in Profile before starting Apply.",
        )

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    daily_max = get_effective_daily_limit(user_settings)
    today_applied = get_today_application_count(db, uid)
    remaining = max(0, daily_max - today_applied)

    requested = payload.apply_count if payload.apply_count is not None else (payload.job_count if payload.job_count is not None else 5)
    if requested > remaining:
        if remaining == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Daily max limit reached ({today_applied}/{daily_max}). Try again tomorrow.",
            )
        requested = remaining

    try:
        return auto_apply_runner.start_batch(uid=uid, apply_count=requested)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
def get_auto_apply_status(current_user: User = Depends(get_current_user)):
    return auto_apply_runner.get_status(current_user.id)


@router.post("/stop")
def stop_auto_apply_batch(current_user: User = Depends(get_current_user)):
    return auto_apply_runner.stop_batch(current_user.id)


@router.post("/dismiss")
def dismiss_auto_apply_status(current_user: User = Depends(get_current_user)):
    return auto_apply_runner.dismiss_batch(current_user.id)
