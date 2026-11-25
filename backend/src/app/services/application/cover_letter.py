import logging
import re
from typing import Dict, Optional, Any
from src.app.services.llm_client import is_llm_configured, call_llm_chat

logger = logging.getLogger(__name__)


def append_profile_links(cover_letter: str, profile: Any) -> str:
    """Append GitHub, Portfolio, and LinkedIn URLs cleanly before the closing signature."""
    if not profile:
        return cover_letter

    links = []
    if getattr(profile, "github_url", None):
        links.append(f"GitHub: {profile.github_url}")
    if getattr(profile, "portfolio_url", None):
        links.append(f"Portfolio: {profile.portfolio_url}")
    if getattr(profile, "other_url", None):
        links.append(f"LinkedIn: {profile.other_url}")

    if not links:
        return cover_letter

    links_block = "\n\n" + "\n".join(links)
    signature_match = re.search(r"\n(Sincerely|Best regards|Regards|Yours truly)[,\s]", cover_letter, re.IGNORECASE)
    if signature_match:
        pos = signature_match.start()
        return cover_letter[:pos] + links_block + cover_letter[pos:]
    return cover_letter + links_block


def generate_cover_letter(
    profile_data: dict,
    job_title: str,
    company: str,
    job_description: str,
    candidate_name: str = "Candidate",
    llm_config: Optional[Dict[str, Optional[str]]] = None,
) -> str:
    """Generate a tailored cover letter incorporating resume details, projects, and skills."""
    cfg = llm_config or {}
    if is_llm_configured(
        api_key=cfg.get("api_key"),
        provider=cfg.get("provider"),
        custom_api_base=cfg.get("custom_api_base"),
    ):
        try:
            prompt = f"""
Write a concise, tailored 3-paragraph cover letter (under 280 words) for '{candidate_name}' applying to '{job_title}' at '{company}'.

Candidate Details:
- Summary: {profile_data.get('summary', '')}
- Skills: {', '.join((profile_data.get('skills') or [])[:12])}
- Key Projects: {profile_data.get('projects', [])[:4]}
- Experience: {profile_data.get('experience', [])[:3]}

Job Description:
{(job_description or '')[:2200]}

Guidelines:
- Reference relevant skills and at least one concrete project if available.
- Output ONLY the cover letter text, starting with a salutation and ending with a closing signature for {candidate_name}.
"""
            return call_llm_chat(
                system_prompt="You are a professional cover letter writer. Output only the cover letter text.",
                user_prompt=prompt,
                llm_config=cfg,
                temperature=0.6,
                timeout=30.0,
            )
        except Exception as e:
            logger.warning(f"LLM cover letter failed ({e}); using structured template fallback.")

    return generate_from_template(profile_data, job_title, company, candidate_name)


def generate_from_template(
    profile_data: dict,
    job_title: str,
    company: str,
    candidate_name: str = "Candidate",
) -> str:
    skills = profile_data.get("skills") or []
    skills_str = ", ".join(skills[:5]) if skills else "software engineering and modern web development"

    projects = profile_data.get("projects") or []
    project_clause = ""
    if projects and isinstance(projects[0], dict):
        proj_name = projects[0].get("name") or projects[0].get("title")
        if proj_name:
            project_clause = f" In particular, my work on {proj_name} directly reflects the problem-solving and engineering standards needed for this role."

    experience = profile_data.get("experience") or []
    exp_clause = "building and shipping reliable production software"
    if experience and isinstance(experience[0], dict):
        role = experience[0].get("title")
        comp = experience[0].get("company")
        if role:
            exp_clause = f"working as {role}" + (f" at {comp}" if comp else "")

    return (
        f"Dear Hiring Team at {company},\n\n"
        f"I am writing to express my strong interest in the {job_title} position at {company}. "
        f"With hands-on experience in {skills_str} and a track record of {exp_clause}, "
        f"I am confident I can deliver immediate impact for your team.{project_clause}\n\n"
        f"Please find my resume attached for your review. I would welcome the opportunity to discuss how my background and projects align with your goals.\n\n"
        f"Best regards,\n{candidate_name}"
    )
