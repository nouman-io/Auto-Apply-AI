import json
import logging
from typing import Optional, Dict
from src.app.services.llm_client import is_llm_configured, call_llm_json

logger = logging.getLogger(__name__)


def evaluate_resume_ats(
    profile_data: dict,
    target_role: Optional[str] = None,
    llm_config: Optional[Dict[str, Optional[str]]] = None,
) -> dict:
    """
    Evaluate parsed resume details against ATS criteria and optional target role.
    Always returns the 4 sub-scores alongside overall ats_score and ats_suggestions.
    """
    baseline = rule_based_ats(profile_data, target_role)
    cfg = llm_config or {}

    if is_llm_configured(
        api_key=cfg.get("api_key"),
        provider=cfg.get("provider"),
        custom_api_base=cfg.get("custom_api_base"),
    ):
        try:
            llm_feedback = evaluate_with_llm(profile_data, target_role, llm_config=cfg)
            if llm_feedback and isinstance(llm_feedback.get("ats_score"), (int, float)):
                baseline["ats_score"] = max(0, min(100, int(llm_feedback["ats_score"])))
                suggestions = llm_feedback.get("ats_suggestions")
                if isinstance(suggestions, dict):
                    for key in ("missing_skills", "formatting_suggestions", "experience_improvements"):
                        if isinstance(suggestions.get(key), list) and suggestions[key]:
                            baseline["ats_suggestions"][key] = suggestions[key]
                for meter in (
                    "formatting_score",
                    "keyword_density_score",
                    "action_verbs_score",
                    "section_completeness_score",
                ):
                    if isinstance(llm_feedback.get(meter), (int, float)):
                        baseline[meter] = max(0, min(100, int(llm_feedback[meter])))
        except Exception as e:
            logger.warning(f"LLM ATS check warning ({e}). Using rule-based ATS evaluation.")

    return baseline


def evaluate_with_llm(
    profile_data: dict,
    target_role: Optional[str] = None,
    llm_config: Optional[Dict[str, Optional[str]]] = None,
) -> dict:
    """Evaluate structured profile (including projects) with the user's configured LLM."""
    role_info = f"target role: '{target_role}'" if target_role else "general software/industry standards"
    prompt = f"""
Evaluate this candidate profile (skills, experience, education, and projects) against {role_info}:
{json.dumps(profile_data, indent=2)}

Return ONLY valid raw JSON matching this exact structure:
{{
  "ats_score": 85,
  "formatting_score": 85,
  "keyword_density_score": 80,
  "action_verbs_score": 82,
  "section_completeness_score": 90,
  "ats_suggestions": {{
    "missing_skills": ["Skill 1", "Skill 2"],
    "formatting_suggestions": ["Suggestion 1"],
    "experience_improvements": ["Improvement 1"]
  }}
}}
"""
    return call_llm_json(
        system_prompt="You are an ATS resume auditor. Respond ONLY in valid raw JSON without markdown fences.",
        user_prompt=prompt,
        llm_config=llm_config,
        timeout=30.0,
    )


def rule_based_ats(profile_data: dict, target_role: Optional[str] = None) -> dict:
    """Compute heuristic ATS scores across 4 categories and actionable suggestions."""
    skills = profile_data.get("skills") or []
    experience = profile_data.get("experience") or []
    education = profile_data.get("education") or []
    projects = profile_data.get("projects") or []

    missing_skills = []
    formatting_suggestions = []
    experience_improvements = []

    formatting_score = 70
    if not education:
        formatting_score -= 15
        formatting_suggestions.append("Education section appears to be missing or could not be detected.")
    if not experience and not projects:
        formatting_score -= 20
        formatting_suggestions.append("Both work experience and projects sections are missing. Add professional history or projects.")
    if not formatting_suggestions:
        formatting_suggestions.append("Ensure contact details (email, LinkedIn, GitHub) are clearly listed at the top.")
        formatting_suggestions.append("Use concise bullet points starting with measurable action verbs.")

    if len(skills) < 5:
        keyword_density_score = 35
        missing_skills.append("Add more technical/domain skills (aim for at least 8–10 relevant skills).")
    elif len(skills) < 8:
        keyword_density_score = 60
        missing_skills.append("Add a few more role-specific technical skills to strengthen keyword matching.")
    elif len(skills) <= 15:
        keyword_density_score = 85
    else:
        keyword_density_score = 95

    if target_role:
        target_lower = target_role.lower()
        keywords_matched = any(
            s.lower() in target_lower or any(word in s.lower() for word in target_lower.split() if len(word) > 2)
            for s in skills
        )
        if not keywords_matched:
            keyword_density_score = max(25, keyword_density_score - 15)
            missing_skills.append(f"Include key skills aligned with '{target_role}'.")

    action_verbs = [
        "developed", "engineered", "architected", "implemented", "optimized", "led", "managed",
        "created", "designed", "built", "improved", "increased", "reduced", "launched", "delivered"
    ]
    action_verbs_score = 60
    combined_descriptions = [
        (exp.get("description") or "").lower() for exp in experience if isinstance(exp, dict)
    ] + [
        (proj.get("description") or "").lower() for proj in projects if isinstance(proj, dict)
    ]

    if combined_descriptions:
        if any(verb in desc for desc in combined_descriptions for verb in action_verbs):
            action_verbs_score = 85
        else:
            action_verbs_score = 45
            experience_improvements.append(
                "Use stronger action verbs (e.g., 'Engineered', 'Optimized', 'Architected') in experience and project bullets."
            )
    else:
        action_verbs_score = 40

    section_completeness_score = 55
    if education:
        section_completeness_score += 10
    if experience:
        section_completeness_score += 15
    if skills and len(skills) >= 5:
        section_completeness_score += 10
    if projects:
        section_completeness_score += 10

    overall_score = int(
        formatting_score * 0.25
        + keyword_density_score * 0.25
        + action_verbs_score * 0.25
        + section_completeness_score * 0.25
    )
    overall_score = max(30, min(96, overall_score))

    if not projects:
        experience_improvements.append("Add key projects with tech stacks so job matching can leverage your hands-on work.")
    if not experience:
        experience_improvements.append("Add internships, freelance, or work roles to strengthen experience signals.")

    return {
        "ats_score": overall_score,
        "formatting_score": min(100, formatting_score),
        "keyword_density_score": min(100, keyword_density_score),
        "action_verbs_score": min(100, action_verbs_score),
        "section_completeness_score": min(100, section_completeness_score),
        "ats_suggestions": {
            "missing_skills": missing_skills,
            "formatting_suggestions": formatting_suggestions,
            "experience_improvements": experience_improvements,
        },
    }
