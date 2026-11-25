from sqlalchemy import Column, String, Boolean, DateTime, Integer, JSON, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    job_matches = relationship("UserJobMatch", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    resume_url = Column(String, nullable=True)
    raw_resume_text = Column(Text, nullable=True)
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    portfolio_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    other_url = Column(String, nullable=True)
    employment_types = Column(JSON, default=list)
    skills = Column(JSON, default=list)
    experience = Column(JSON, default=list)
    education = Column(JSON, default=list)
    projects = Column(JSON, default=list)
    languages = Column(JSON, default=list)
    ats_score = Column(Integer, nullable=True)
    ats_breakdown = Column(JSON, default=dict)
    ats_suggestions = Column(JSON, default=dict)

    user = relationship("User", back_populates="profile")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    # User Career & Job Details ("what type of job they do")
    job_details = Column(Text, nullable=True)
    preferred_countries = Column(JSON, default=list)
    target_roles = Column(JSON, default=list)
    work_mode_preference = Column(String, default="Fully Remote (Worldwide)")
    min_salary_preference = Column(String, nullable=True)
    experience_level = Column(String, nullable=True)
    visa_sponsorship_required = Column(Boolean, default=False)
    visa_sponsorship_preference = Column(String, default="No Visa Needed (Authorized Work Permit)")
    daily_apply_limit = Column(Integer, default=15)

    # AI Provider Configuration
    llm_provider = Column(String, default="openai")
    llm_model = Column(String, default="gpt-4o-mini")
    custom_api_base = Column(String, nullable=True)
    openai_api_key = Column(String, nullable=True)

    # Search Connectors Configuration (disconnected by default; user connects intentionally)
    enabled_connectors = Column(JSON, default=list)
    greenhouse_companies = Column(JSON, default=list)
    serpapi_api_key = Column(String, nullable=True)

    # LinkedIn & Indeed Authenticated Connector Sessions
    is_linkedin_connected = Column(Boolean, default=False)
    linkedin_email = Column(String, nullable=True)
    linkedin_password = Column(String, nullable=True)
    linkedin_session_path = Column(String, nullable=True)
    is_indeed_connected = Column(Boolean, default=False)
    indeed_email = Column(String, nullable=True)
    indeed_password = Column(String, nullable=True)
    indeed_session_path = Column(String, nullable=True)

    # Gmail OAuth & Email Connection Settings
    google_client_id = Column(String, nullable=True)
    google_client_secret = Column(String, nullable=True)
    is_gmail_connected = Column(Boolean, default=False)
    gmail_email_address = Column(String, nullable=True)
    gmail_access_token = Column(String, nullable=True)
    gmail_refresh_token = Column(String, nullable=True)
    smtp_app_password = Column(String, nullable=True)

    user = relationship("User", back_populates="settings")


class JobFound(Base):
    __tablename__ = "jobs_found"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=True)
    country = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    url = Column(String, unique=True, index=True, nullable=False)
    apply_url = Column(String, nullable=True)
    apply_method = Column(String, default="playwright")  # "email" (HR email found) or "playwright" (web-based)
    company_email = Column(String, nullable=True)  # Authentic extracted HR Email only
    extracted_emails = Column(JSON, default=list)
    salary = Column(String, nullable=True)
    source = Column(String, default="Greenhouse")  # "LinkedIn", "Indeed", "Google", "Greenhouse"
    opportunity_type = Column(String, default="job")  # "job" or "internship"
    match_score = Column(Integer, nullable=True)
    match_reasons = Column(JSON, default=list)
    raw_data = Column(JSON, default=dict)
    found_at = Column(DateTime(timezone=True), server_default=func.now())

    user_matches = relationship("UserJobMatch", back_populates="job", cascade="all, delete-orphan")


class UserJobMatch(Base):
    __tablename__ = "user_job_matches"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_match"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    job_id = Column(Integer, ForeignKey("jobs_found.id", ondelete="CASCADE"), index=True, nullable=False)
    match_score = Column(Integer, default=0, nullable=False)
    match_reasons = Column(JSON, default=list)
    matched_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="job_matches")
    job = relationship("JobFound", back_populates="user_matches")


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id = Column(Integer, ForeignKey("jobs_found.id", ondelete="SET NULL"), nullable=True)

    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    company_email = Column(String, nullable=True)
    opportunity_type = Column(String, default="job")
    apply_method = Column(String, default="email")  # "email" or "playwright"
    status = Column(String, default="Applied")  # "Applying", "Applied", "Sent via Gmail", "Applied via Playwright", "Failed"
    url = Column(String, nullable=True)
    screenshot_path = Column(String, nullable=True)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    cover_letter = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    gmail_message_id = Column(String, nullable=True)

    user = relationship("User", back_populates="applications")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    application_id = Column(Integer, ForeignKey("applications.id", ondelete="SET NULL"), nullable=True)

    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String, default="info")  # "success", "error", "info"
    apply_method = Column(String, nullable=True)  # "email" or "playwright"
    job_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")
