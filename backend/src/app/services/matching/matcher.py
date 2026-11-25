import json
import logging
import re
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from src.app.core.config import settings
from src.app.db.models import Profile, UserSettings, JobFound
from src.app.services.llm_client import build_llm_config, is_llm_configured, call_llm_json

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "with", "that", "this", "from", "your", "have", "will", "work", "team",
    "role", "building", "using", "based", "into", "over", "more", "years",
    "experience", "looking", "developer", "engineer", "software", "applications",
}


def _extract_project_keywords(projects: List[dict]) -> List[str]:
    tokens = []
    for proj in projects or []:
        if not isinstance(proj, dict):
            continue
        for tech in proj.get("technologies") or []:
            if isinstance(tech, str) and len(tech.strip()) >= 2:
                tokens.append(tech.strip())
        text = f"{proj.get('name') or proj.get('title') or ''} {proj.get('description') or ''}"
        for word in re.findall(r"[a-zA-Z][a-zA-Z0-9+#.]{2,}", text):
            if word.lower() not in STOP_WORDS:
                tokens.append(word)
    return list(dict.fromkeys(tokens))[:25]


def _extract_job_detail_keywords(job_details: str, target_roles: List[str]) -> List[str]:
    text = f"{job_details or ''} {' '.join(target_roles or [])}"
    words = [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+#.]{2,}", text) if w.lower() not in STOP_WORDS]
    return list(dict.fromkeys(words))[:20]


class MatchingEngine:
    async def evaluate_job_match(self, db: Session, user_id: str, job_id: int) -> dict:
        """
        Evaluate a job against user's resume details, projects, job details, and constraints.
        Returns {is_match, score (0.0-1.0), score_pct (0-100), reasons}.
        """
        reasons: List[str] = []

        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        job = db.query(JobFound).filter(JobFound.id == job_id).first()

        if not job:
            return {"is_match": False, "score": 0.0, "score_pct": 0, "reasons": ["Job opportunity not found."]}

        if not profile:
            return {"is_match": False, "score": 0.0, "score_pct": 0, "reasons": ["Resume profile not uploaded yet."]}

        if not user_settings:
            user_settings = UserSettings(user_id=user_id)
            db.add(user_settings)
            db.commit()
            db.refresh(user_settings)

        job_text = f"{job.title} {job.location or ''} {job.description or ''}".lower()

        # Hard Constraint: Work mode
        if user_settings.work_mode_preference:
            pref_lower = user_settings.work_mode_preference.lower()
            is_remote_job = any(w in job_text for w in ("remote", "work from home", "wfh", "telecommute"))
            if "remote" in pref_lower and not is_remote_job and any(
                w in job_text for w in ("onsite only", "strictly onsite", "in-office only")
            ):
                return {
                    "is_match": False,
                    "score": 0.1,
                    "score_pct": 10,
                    "reasons": ["Job requires strictly on-site presence while preference is remote."],
                }

        # Hard Constraint: Visa sponsorship
        if user_settings.visa_sponsorship_required:
            negative_visa = (
                "no sponsorship",
                "does not offer sponsorship",
                "unable to sponsor",
                "cannot sponsor",
                "us citizen or green card only",
                "visa sponsorship is not available",
            )
            if any(phrase in job_text for phrase in negative_visa):
                return {
                    "is_match": False,
                    "score": 0.1,
                    "score_pct": 10,
                    "reasons": ["Visa sponsorship required, but posting rules out sponsorship."],
                }

        # 1. Resume Skills Match
        user_skills = profile.skills or []
        matched_skills = []
        for skill in user_skills:
            if re.search(rf"(?<!\w){re.escape(skill.lower())}(?!\w)", job_text):
                matched_skills.append(skill)
        skill_score = min(1.0, (len(matched_skills) / max(1, min(len(user_skills), 8))) * 1.1) if user_skills else 0.0
        if matched_skills:
            reasons.append(f"Skills match ({len(matched_skills)}): {', '.join(matched_skills[:6])}")

        # 2. Resume Projects Match
        project_keywords = _extract_project_keywords(profile.projects or [])
        matched_proj_kw = [
            kw for kw in project_keywords
            if re.search(rf"(?<!\w){re.escape(kw.lower())}(?!\w)", job_text)
        ]
        project_score = min(1.0, (len(matched_proj_kw) / max(1, min(len(project_keywords), 6))) * 1.1) if project_keywords else 0.0
        if matched_proj_kw:
            reasons.append(f"Projects alignment: {', '.join(matched_proj_kw[:5])}")

        # 3. Job Detail ("what type of work they do") & Target Role Alignment
        detail_keywords = _extract_job_detail_keywords(
            user_settings.job_details or "",
            user_settings.target_roles or [],
        )
        matched_detail_kw = [
            kw for kw in detail_keywords
            if re.search(rf"(?<!\w){re.escape(kw.lower())}(?!\w)", f"{job.title.lower()} {job_text}")
        ]
        role_score = min(1.0, (len(matched_detail_kw) / max(1, min(len(detail_keywords), 5))) * 1.1) if detail_keywords else 0.4
        if matched_detail_kw:
            reasons.append(f"Role/focus match: {', '.join(matched_detail_kw[:5])}")

        heuristic_score = (0.45 * skill_score) + (0.30 * project_score) + (0.25 * role_score)

        # 4. Optional LLM Semantic Evaluation (Resume Details + Projects + Job Details)
        llm_cfg = build_llm_config(user_settings)
        final_score = heuristic_score
        if is_llm_configured(
            api_key=llm_cfg.get("api_key"),
            provider=llm_cfg.get("provider"),
            custom_api_base=llm_cfg.get("custom_api_base"),
        ):
            try:
                candidate_payload: Dict[str, Any] = {
                    "summary": profile.summary or "",
                    "skills": profile.skills or [],
                    "projects": profile.projects or [],
                    "experience": profile.experience or [],
                    "education": profile.education or [],
                    "target_roles": user_settings.target_roles or [],
                    "job_details": user_settings.job_details or "",
                }
                prompt = f"""
Evaluate how well this candidate matches the job using their resume details, projects, and desired job focus.
Job Title: {job.title}
Company: {job.company}
Job Description: {(job.description or '')[:2500]}

Candidate Profile & Projects:
{json.dumps(candidate_payload, indent=2)[:3500]}

Return ONLY raw JSON:
{{"score": 0.85, "reason": "One short sentence explaining alignment with candidate projects and skills."}}
"""
                llm_res = call_llm_json(
                    system_prompt="You are a technical recruiter AI. Output ONLY valid raw JSON.",
                    user_prompt=prompt,
                    llm_config=llm_cfg,
                    timeout=20.0,
                )
                sem_score = max(0.0, min(1.0, float(llm_res.get("score", heuristic_score))))
                if llm_res.get("reason"):
                    reasons.insert(0, str(llm_res["reason"]).strip())
                final_score = (0.65 * sem_score) + (0.35 * heuristic_score)
            except Exception as exc:
                logger.warning(f"LLM matching fallback for job {job_id}: {exc}")

        final_score = round(max(0.05, min(0.99, final_score)), 3)
        score_pct = int(round(final_score * 100))
        is_match = final_score >= settings.MATCHING_THRESHOLD

        if not reasons:
            reasons.append(f"Profile relevance score: {score_pct}%")

        return {
            "is_match": is_match,
            "score": final_score,
            "score_pct": score_pct,
            "reasons": reasons,
        }
