import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session

from src.app.db.database import get_db
from src.app.core.security import get_current_user
from src.app.db.models import Application, JobFound, User
from src.app.services.application.pipeline import execute_job_application

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("")
def list_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    apply_method: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all applied jobs for the authenticated user so they can inspect status and proof."""
    query = db.query(Application).filter(Application.user_id == current_user.id)
    if status_filter:
        query = query.filter(Application.status == status_filter)
    if apply_method:
        query = query.filter(Application.apply_method == apply_method)

    apps = query.order_by(Application.applied_at.desc()).all()
    return [
        {
            "id": a.id,
            "job_id": a.job_id,
            "title": a.title,
            "company": a.company,
            "company_email": a.company_email,
            "opportunity_type": a.opportunity_type,
            "apply_method": a.apply_method or "email",
            "status": a.status,
            "url": a.url,
            "screenshot_path": a.screenshot_path,
            "applied_at": a.applied_at,
            "cover_letter": a.cover_letter,
            "notes": a.notes,
            "gmail_message_id": a.gmail_message_id,
        }
        for a in apps
    ]


@router.get("/{application_id}")
def get_application_details(
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch full details for one applied job."""
    app_record = db.query(Application).filter(
        Application.id == application_id,
        Application.user_id == current_user.id,
    ).first()
    if not app_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application record not found.")

    return {
        "id": app_record.id,
        "job_id": app_record.job_id,
        "title": app_record.title,
        "company": app_record.company,
        "company_email": app_record.company_email,
        "opportunity_type": app_record.opportunity_type,
        "apply_method": app_record.apply_method or "email",
        "status": app_record.status,
        "url": app_record.url,
        "screenshot_path": app_record.screenshot_path,
        "applied_at": app_record.applied_at,
        "cover_letter": app_record.cover_letter,
        "notes": app_record.notes,
        "gmail_message_id": app_record.gmail_message_id,
    }


async def _run_job_apply_bg(user_id: str, job_id: int):
    from src.app.db.database import SessionLocal
    bg_db = SessionLocal()
    try:
        job = bg_db.query(JobFound).filter(JobFound.id == job_id).first()
        if job:
            await execute_job_application(db=bg_db, user_id=user_id, job=job)
    except Exception as exc:
        logger.error(f"Background apply failed for job {job_id}: {exc}", exc_info=True)
    finally:
        bg_db.close()


@router.post("/job/{job_id}/apply")
async def trigger_job_apply_background(
    job_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Queue a single job application (Playwright or HR Email) in the background."""
    job = db.query(JobFound).filter(JobFound.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    background_tasks.add_task(_run_job_apply_bg, current_user.id, job_id)
    return {
        "status": "queued",
        "message": f"Application queued for {job.title} at {job.company}.",
    }
