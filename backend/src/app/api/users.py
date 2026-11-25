from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Union
from sqlalchemy.orm import Session

from src.app.db.database import get_db
from src.app.core.config import settings as app_settings
from src.app.core.security import get_current_user
from src.app.db.models import User, Profile, UserSettings
from src.app.services.search.connector_auth import (
    connect_linkedin,
    connect_indeed,
    disconnect_session,
)

router = APIRouter(prefix="/users", tags=["users"])


class LinkedInConnectRequest(BaseModel):
    email: str
    password: str = ""
    interactive: bool = False


class IndeedConnectRequest(BaseModel):
    email: str = ""
    password: str = ""
    interactive: bool = False


class SettingsUpdateRequest(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    custom_api_base: Optional[str] = None
    openai_api_key: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    enabled_connectors: Optional[List[str]] = None
    greenhouse_companies: Optional[List[str]] = None
    serpapi_api_key: Optional[str] = None
    target_countries: Optional[List[str]] = None


class ProfileUpdateRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    other_url: Optional[str] = None
    job_details: Optional[str] = None
    target_roles: Optional[List[str]] = None
    target_countries: Optional[List[str]] = None
    work_mode_preference: Optional[str] = None
    employment_types: Optional[List[str]] = None
    salary_preference: Optional[str] = None
    experience_level: Optional[str] = None
    visa_sponsorship: Optional[Union[bool, str]] = None
    visa_sponsorship_str: Optional[str] = None
    daily_apply_limit: Optional[int] = None


def _mask_key(k: Optional[str]) -> str:
    if not k or len(k) < 6:
        return ""
    return k[:4] + "••••••••" + k[-4:]


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Fetch the authenticated user's summary record."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": current_user.created_at,
        "profile": {
            "resume_url": current_user.profile.resume_url,
            "skills": current_user.profile.skills or [],
            "projects": current_user.profile.projects or [],
            "ats_score": current_user.profile.ats_score,
        } if current_user.profile else None,
    }


@router.get("/settings")
def get_user_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch user preferences, job details, AI vault config, and connector settings."""
    uid = current_user.id
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    if not user_settings:
        user_settings = UserSettings(user_id=uid)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    profile = db.query(Profile).filter(Profile.user_id == uid).first()

    raw_enabled = user_settings.enabled_connectors if user_settings.enabled_connectors is not None else []
    enabled_list = [
        str(c).lower() for c in raw_enabled
        if (str(c).lower() != "linkedin" or user_settings.is_linkedin_connected)
        and (str(c).lower() != "indeed" or user_settings.is_indeed_connected)
    ]

    return {
        "llm_provider": user_settings.llm_provider or "openai",
        "llm_model": user_settings.llm_model or "gpt-4o-mini",
        "custom_api_base": user_settings.custom_api_base or "",
        "openai_api_key": _mask_key(user_settings.openai_api_key),
        "google_client_id": user_settings.google_client_id or "",
        "google_client_secret": _mask_key(user_settings.google_client_secret),
        "enabled_connectors": enabled_list,
        "greenhouse_companies": user_settings.greenhouse_companies or app_settings.TRACKED_COMPANIES_GREENHOUSE,
        "serpapi_api_key": _mask_key(user_settings.serpapi_api_key),
        "is_linkedin_connected": bool(user_settings.is_linkedin_connected),
        "linkedin_email": user_settings.linkedin_email or "",
        "is_indeed_connected": bool(user_settings.is_indeed_connected),
        "indeed_email": user_settings.indeed_email or "",
        "is_gmail_connected": user_settings.is_gmail_connected,
        "gmail_email_address": user_settings.gmail_email_address or "",
        "job_details": user_settings.job_details or "",
        "target_roles": user_settings.target_roles or [],
        "target_countries": user_settings.preferred_countries or [],
        "work_mode_preference": user_settings.work_mode_preference or "Fully Remote (Worldwide)",
        "salary_preference": user_settings.min_salary_preference or "$90,000 - $130,000 / year",
        "experience_level": user_settings.experience_level or "Mid-Level (2 - 5 Yrs)",
        "visa_sponsorship": user_settings.visa_sponsorship_required,
        "visa_sponsorship_str": user_settings.visa_sponsorship_preference
            or ("Visa Sponsorship Required" if user_settings.visa_sponsorship_required else "No Visa Needed (Authorized Work Permit)"),
        "daily_apply_limit": min(user_settings.daily_apply_limit or app_settings.DAILY_APPLY_MAX, app_settings.DAILY_APPLY_MAX),
        "email": current_user.email,
        "full_name": profile.full_name if profile else "",
        "phone": profile.phone if profile else "",
        "portfolio_url": profile.portfolio_url if profile else "",
        "github_url": profile.github_url if profile else "",
        "other_url": profile.other_url if profile else "",
        "employment_types": profile.employment_types if profile else [],
    }


@router.put("/settings")
def update_user_settings(
    payload: SettingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update AI provider credentials, Gmail OAuth app settings, and job source configuration."""
    uid = current_user.id
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    if not user_settings:
        user_settings = UserSettings(user_id=uid)
        db.add(user_settings)

    if payload.llm_provider is not None:
        user_settings.llm_provider = payload.llm_provider
    if payload.llm_model is not None:
        user_settings.llm_model = payload.llm_model
    if payload.custom_api_base is not None:
        user_settings.custom_api_base = payload.custom_api_base
    if payload.openai_api_key is not None and "••••••••" not in payload.openai_api_key:
        user_settings.openai_api_key = payload.openai_api_key
    if payload.google_client_id is not None:
        user_settings.google_client_id = payload.google_client_id
    if payload.google_client_secret is not None and "••••••••" not in payload.google_client_secret:
        user_settings.google_client_secret = payload.google_client_secret
    if payload.enabled_connectors is not None:
        allowed = {"linkedin", "indeed", "google", "greenhouse"}
        requested = [c.lower() for c in payload.enabled_connectors if c.lower() in allowed]
        if "linkedin" in requested and not user_settings.is_linkedin_connected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sign in with your LinkedIn email & password before enabling LinkedIn.",
            )
        if "indeed" in requested and not user_settings.is_indeed_connected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sign in to Indeed before enabling the Indeed connector.",
            )
        user_settings.enabled_connectors = list(dict.fromkeys(requested))
    if payload.greenhouse_companies is not None:
        user_settings.greenhouse_companies = [c.strip().lower() for c in payload.greenhouse_companies if c.strip()]
    if payload.serpapi_api_key is not None and "••••••••" not in payload.serpapi_api_key:
        user_settings.serpapi_api_key = payload.serpapi_api_key
    if payload.target_countries is not None:
        user_settings.preferred_countries = payload.target_countries

    db.commit()
    return {"status": "success", "message": "API keys and integration settings saved successfully!"}


@router.post("/connectors/linkedin/connect")
async def connect_linkedin_connector(
    payload: LinkedInConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sign in to LinkedIn with email/password (or browser window) before enabling connector."""
    if not payload.interactive and (not payload.email.strip() or not payload.password):
        raise HTTPException(status_code=400, detail="LinkedIn email and password are required to connect.")

    res = await connect_linkedin(
        user_id=current_user.id,
        email=payload.email.strip(),
        password=payload.password,
        interactive=payload.interactive,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "LinkedIn sign-in failed."))

    u_set = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not u_set:
        u_set = UserSettings(user_id=current_user.id)
        db.add(u_set)

    u_set.is_linkedin_connected = True
    if payload.email.strip():
        u_set.linkedin_email = payload.email.strip()
    if payload.password:
        u_set.linkedin_password = payload.password
    u_set.linkedin_session_path = res.get("session_path")
    current_enabled = list(u_set.enabled_connectors or [])
    if "linkedin" not in current_enabled:
        current_enabled.append("linkedin")
    u_set.enabled_connectors = current_enabled
    db.commit()

    return {"status": "connected", "message": res.get("message", "LinkedIn connected.")}


@router.post("/connectors/indeed/connect")
async def connect_indeed_connector(
    payload: IndeedConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sign in to Indeed via credentials or browser window before enabling connector."""
    if not payload.interactive and not payload.email.strip():
        raise HTTPException(status_code=400, detail="Indeed email is required (or use Browser Sign-In).")

    res = await connect_indeed(
        user_id=current_user.id,
        email=payload.email.strip(),
        password=payload.password,
        interactive=payload.interactive,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Indeed sign-in failed."))

    u_set = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not u_set:
        u_set = UserSettings(user_id=current_user.id)
        db.add(u_set)

    u_set.is_indeed_connected = True
    if payload.email.strip():
        u_set.indeed_email = payload.email.strip()
    if payload.password:
        u_set.indeed_password = payload.password
    u_set.indeed_session_path = res.get("session_path")
    current_enabled = list(u_set.enabled_connectors or [])
    if "indeed" not in current_enabled:
        current_enabled.append("indeed")
    u_set.enabled_connectors = current_enabled
    db.commit()

    return {"status": "connected", "message": res.get("message", "Indeed connected.")}


@router.post("/connectors/{provider}/disconnect")
def disconnect_job_connector(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect a job connector and wipe stored credentials/session if applicable."""
    prov = provider.strip().lower()
    if prov not in {"linkedin", "indeed", "google", "greenhouse"}:
        raise HTTPException(status_code=404, detail="Unknown connector provider.")

    u_set = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if u_set:
        if prov == "linkedin":
            disconnect_session(u_set.linkedin_session_path)
            u_set.is_linkedin_connected = False
            u_set.linkedin_password = None
            u_set.linkedin_session_path = None
        elif prov == "indeed":
            disconnect_session(u_set.indeed_session_path)
            u_set.is_indeed_connected = False
            u_set.indeed_password = None
            u_set.indeed_session_path = None
        u_set.enabled_connectors = [c for c in (u_set.enabled_connectors or []) if c.lower() != prov]
        db.commit()

    return {"status": "disconnected", "message": f"{prov.capitalize()} disconnected."}


@router.put("/profile")
def update_user_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile links, job details ('what type of work they do'), and daily apply cap."""
    uid = current_user.id

    profile = db.query(Profile).filter(Profile.user_id == uid).first()
    if not profile:
        profile = Profile(user_id=uid)
        db.add(profile)

    if payload.full_name is not None:
        profile.full_name = payload.full_name
    if payload.phone is not None:
        profile.phone = payload.phone
    if payload.portfolio_url is not None:
        profile.portfolio_url = payload.portfolio_url
    if payload.github_url is not None:
        profile.github_url = payload.github_url
    if payload.other_url is not None:
        profile.other_url = payload.other_url
    if payload.employment_types is not None:
        profile.employment_types = payload.employment_types

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    if not user_settings:
        user_settings = UserSettings(user_id=uid)
        db.add(user_settings)

    if payload.job_details is not None:
        user_settings.job_details = payload.job_details
    if payload.target_roles is not None:
        user_settings.target_roles = [r.strip() for r in payload.target_roles if r.strip()]
    if payload.target_countries is not None:
        user_settings.preferred_countries = payload.target_countries
    if payload.work_mode_preference is not None:
        user_settings.work_mode_preference = payload.work_mode_preference
    if payload.salary_preference is not None:
        user_settings.min_salary_preference = payload.salary_preference
    if payload.experience_level is not None:
        user_settings.experience_level = payload.experience_level

    if payload.visa_sponsorship is not None:
        if isinstance(payload.visa_sponsorship, str):
            user_settings.visa_sponsorship_preference = payload.visa_sponsorship
            visa_str = payload.visa_sponsorship.lower()
            user_settings.visa_sponsorship_required = any(
                kw in visa_str for kw in ("required", "needed", "need", "sponsorship")
            ) and "no visa" not in visa_str and "not required" not in visa_str
        else:
            user_settings.visa_sponsorship_required = payload.visa_sponsorship
            user_settings.visa_sponsorship_preference = (
                "Visa Sponsorship Required"
                if payload.visa_sponsorship
                else "No Visa Needed (Authorized Work Permit)"
            )
    if payload.visa_sponsorship_str is not None:
        user_settings.visa_sponsorship_preference = payload.visa_sponsorship_str
        visa_str = payload.visa_sponsorship_str.lower()
        user_settings.visa_sponsorship_required = any(
            kw in visa_str for kw in ("required", "needed", "need", "sponsorship")
        ) and "no visa" not in visa_str and "not required" not in visa_str

    if payload.daily_apply_limit is not None:
        user_settings.daily_apply_limit = max(1, min(int(payload.daily_apply_limit), app_settings.DAILY_APPLY_MAX))

    db.commit()
    return {"status": "success", "message": "Profile, job details, and preferences saved!"}
