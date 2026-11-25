import os
import uuid
import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import httpx
from sqlalchemy.orm import Session

from src.app.core.config import settings
from src.app.db.models import Application, User, Profile, UserSettings, JobFound
from src.app.services.application.cover_letter import generate_cover_letter, append_profile_links
from src.app.services.application.form_filler import FormFillerService
from src.app.services.gmail_client import gmail_client
from src.app.services.llm_client import build_llm_config
from src.app.services.notification import NotificationService
from src.app.services.pdf_parser import extract_text_from_pdf
from src.app.services.resume_parser import extract_contact_and_links

logger = logging.getLogger(__name__)


def resolve_resume_local_path(resume_url: str) -> Optional[str]:
    """Resolve a stored resume URL into an absolute local file path."""
    if not resume_url:
        return None

    if resume_url.startswith("/uploads/"):
        rel_name = resume_url[len("/uploads/"):]
        upload_abs = os.path.abspath(settings.UPLOAD_DIR)
        candidate = os.path.join(upload_abs, rel_name)
        if os.path.exists(candidate):
            return candidate
        local_path = resume_url.lstrip("/")
        if os.path.exists(local_path):
            return os.path.abspath(local_path)
        backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        alt_path = os.path.join(backend_root, local_path)
        if os.path.exists(alt_path):
            return os.path.abspath(alt_path)

    if os.path.exists(resume_url):
        return os.path.abspath(resume_url)

    try:
        temp_path = os.path.join(tempfile.gettempdir(), f"resume_{uuid.uuid4()}.pdf")
        with httpx.Client(timeout=10.0) as client:
            response = client.get(resume_url)
            if response.status_code == 200:
                with open(temp_path, "wb") as f:
                    f.write(response.content)
                return temp_path
    except Exception as e:
        logger.error(f"Failed to resolve remote resume file: {e}")

    return None


def get_today_application_count(db: Session, user_id: str) -> int:
    """Count non-failed applications submitted today (UTC) for daily max enforcement."""
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(Application).filter(
        Application.user_id == user_id,
        Application.applied_at >= start_of_day,
        Application.status != "Failed",
    ).count()


def get_effective_daily_limit(user_settings: Optional[UserSettings]) -> int:
    configured = user_settings.daily_apply_limit if user_settings and user_settings.daily_apply_limit else settings.DAILY_APPLY_MAX
    return max(1, min(int(configured), settings.DAILY_APPLY_MAX))


def _build_candidate_info(user: User, profile: Optional[Profile], resume_path: Optional[str]) -> Dict[str, Any]:
    raw_text = (profile.raw_resume_text if profile else "") or ""
    if not raw_text and resume_path and os.path.exists(resume_path):
        try:
            with open(resume_path, "rb") as f:
                raw_text = extract_text_from_pdf(f.read())
        except Exception:
            pass

    parsed_contact = extract_contact_and_links(raw_text) if raw_text else {}
    return {
        "name": (profile.full_name if profile and profile.full_name else None)
                or parsed_contact.get("full_name")
                or (user.email.split("@")[0] if user and user.email else "Candidate"),
        "email": (user.email if user else None) or parsed_contact.get("extracted_email") or "",
        "phone": (profile.phone if profile and profile.phone else None) or parsed_contact.get("phone") or "",
        "linkedin": (profile.other_url if profile and profile.other_url else None) or parsed_contact.get("linkedin_url") or "",
        "github": (profile.github_url if profile and profile.github_url else None) or parsed_contact.get("github_url") or "",
        "portfolio": (profile.portfolio_url if profile and profile.portfolio_url else None) or parsed_contact.get("portfolio_url") or "",
    }


def prepare_cover_letter_for_job(
    user: User,
    profile: Optional[Profile],
    user_settings: Optional[UserSettings],
    job: JobFound,
    custom_cover_letter: Optional[str] = None,
) -> str:
    if custom_cover_letter:
        return custom_cover_letter
    profile_data = {
        "summary": profile.summary if profile else "",
        "skills": profile.skills if profile else [],
        "experience": profile.experience if profile else [],
        "education": profile.education if profile else [],
        "projects": profile.projects if profile else [],
    }
    candidate_name = (
        (profile.full_name if profile and profile.full_name else None)
        or (user.email.split("@")[0] if user and user.email else "Candidate")
    )
    llm_cfg = build_llm_config(user_settings)
    letter = generate_cover_letter(
        profile_data=profile_data,
        job_title=job.title,
        company=job.company,
        job_description=job.description or job.title,
        candidate_name=candidate_name,
        llm_config=llm_cfg,
    )
    return append_profile_links(letter, profile)


async def execute_job_application(
    db: Session,
    user_id: str,
    job: JobFound,
    custom_cover_letter: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Whiteboard execution step:
    - If authentic HR email is found (and Gmail connected): send email via Gmail.
    - Otherwise (web-based portal/ATS): run Playwright form filler.
    - Persist Application record & emit user Notification so user can check the applied job.
    """
    user = db.query(User).filter(User.id == user_id).first()
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()

    if not user:
        return {"success": False, "error": "User account not found."}

    if not profile or not profile.resume_url:
        return {"success": False, "error": "Resume not uploaded. Upload your resume in Profile first."}

    resume_path = resolve_resume_local_path(profile.resume_url)
    if not resume_path or not os.path.exists(resume_path):
        return {"success": False, "error": "Resume file could not be located on server."}

    daily_limit = get_effective_daily_limit(user_settings)
    today_count = get_today_application_count(db, user_id)
    if today_count >= daily_limit:
        return {
            "success": False,
            "error": f"Daily maximum limit reached ({today_count}/{daily_limit}).",
            "retryable": False,
        }

    cover_letter = prepare_cover_letter_for_job(user, profile, user_settings, job, custom_cover_letter)

    # Whiteboard decision: send email if HR email found, else use Playwright if web-based
    hr_email = job.company_email
    gmail_ready = bool(
        user_settings
        and user_settings.is_gmail_connected
        and (user_settings.smtp_app_password or user_settings.gmail_access_token)
    )

    if hr_email and gmail_ready:
        apply_method = "email"
        sender_email = user_settings.gmail_email_address or user.email
        subject = f"Application for {job.title} - {sender_email}"

        if user_settings.smtp_app_password:
            send_res = gmail_client.send_email_via_smtp(
                sender_email=sender_email,
                app_password=user_settings.smtp_app_password,
                recipient_email=hr_email,
                subject=subject,
                body_text=cover_letter,
                cv_file_path=resume_path,
            )
        else:
            send_res = gmail_client.send_email_via_oauth(
                access_token=user_settings.gmail_access_token,
                sender_email=sender_email,
                recipient_email=hr_email,
                subject=subject,
                body_text=cover_letter,
                cv_file_path=resume_path,
                refresh_token=user_settings.gmail_refresh_token,
                client_id=user_settings.google_client_id,
                client_secret=user_settings.google_client_secret,
            )
            if send_res.get("new_access_token"):
                user_settings.gmail_access_token = send_res["new_access_token"]

        success = bool(send_res.get("success"))
        app_record = Application(
            user_id=user_id,
            job_id=job.id,
            title=job.title,
            company=job.company,
            company_email=hr_email,
            opportunity_type=job.opportunity_type or "job",
            apply_method="email",
            status="Sent via Gmail" if success else "Failed",
            url=job.apply_url or job.url,
            cover_letter=cover_letter,
            notes=(
                f"Sent via {send_res.get('method')} to {hr_email}"
                if success
                else f"Email apply failed: {send_res.get('error', 'Unknown error')}"
            ),
            gmail_message_id=send_res.get("message_id"),
        )
        db.add(app_record)
        db.commit()
        db.refresh(app_record)

        NotificationService.create_notification(
            db=db,
            user_id=user_id,
            application_id=app_record.id,
            title=f"{'Applied' if success else 'Apply Failed'}: {job.title}",
            message=(
                f"Sent email application with resume to {hr_email} at {job.company}."
                if success
                else f"Email apply to {job.company} failed: {send_res.get('error', 'Unknown error')}"
            ),
            notification_type="success" if success else "error",
            apply_method="email",
            job_url=app_record.url,
        )

        return {
            "success": success,
            "apply_method": apply_method,
            "application_id": app_record.id,
            "recipient_email": hr_email,
            "gmail_message_id": send_res.get("message_id"),
            "error": send_res.get("error") if not success else None,
            "retryable": True,
        }

    # Web-based application via Playwright
    apply_method = "playwright"
    target_url = job.apply_url or job.url
    candidate_info = _build_candidate_info(user, profile, resume_path)

    storage_state = None
    lower_url = (target_url or "").lower()
    if user_settings:
        if "linkedin.com" in lower_url and user_settings.linkedin_session_path and os.path.exists(user_settings.linkedin_session_path):
            storage_state = user_settings.linkedin_session_path
        elif "indeed." in lower_url and user_settings.indeed_session_path and os.path.exists(user_settings.indeed_session_path):
            storage_state = user_settings.indeed_session_path

    filler = FormFillerService()
    fill_res = await filler.auto_fill_application(
        application_url=target_url,
        candidate_info=candidate_info,
        resume_path=resume_path,
        cover_letter_content=cover_letter,
        storage_state_path=storage_state,
    )

    success = bool(fill_res.get("success"))
    app_record = Application(
        user_id=user_id,
        job_id=job.id,
        title=job.title,
        company=job.company,
        company_email=hr_email,
        opportunity_type=job.opportunity_type or "job",
        apply_method="playwright",
        status="Applied via Playwright" if success else "Failed",
        url=target_url,
        screenshot_path=fill_res.get("screenshot_path"),
        cover_letter=cover_letter,
        notes=(
            f"Submitted web form via Playwright on {target_url}"
            if success
            else f"Playwright apply failed: {fill_res.get('error_message', 'Form submission unsuccessful')}"
        ),
    )
    db.add(app_record)
    db.commit()
    db.refresh(app_record)

    NotificationService.create_notification(
        db=db,
        user_id=user_id,
        application_id=app_record.id,
        title=f"{'Applied' if success else 'Apply Failed'}: {job.title}",
        message=(
            f"Submitted web application via Playwright for {job.company}."
            if success
            else f"Playwright form apply for {job.company}: {fill_res.get('error_message', 'Failed')}"
        ),
        notification_type="success" if success else "error",
        apply_method="playwright",
        job_url=target_url,
    )

    return {
        "success": success,
        "apply_method": apply_method,
        "application_id": app_record.id,
        "screenshot_path": fill_res.get("screenshot_path"),
        "error": fill_res.get("error_message") if not success else None,
        "retryable": True,
    }
