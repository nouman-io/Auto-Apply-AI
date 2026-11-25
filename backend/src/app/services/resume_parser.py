import re
import logging
from typing import Dict, Any, Optional, List
from fastapi import HTTPException, status
from src.app.services.llm_client import is_llm_configured, call_llm_json

logger = logging.getLogger(__name__)

COMMON_TECH_KEYWORDS = [
    "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express",
    "FastAPI", "Django", "Flask", "HTML", "CSS", "TailwindCSS", "Bootstrap",
    "PostgreSQL", "MongoDB", "MySQL", "SQLite", "Redis", "Docker", "Kubernetes",
    "AWS", "GCP", "Azure", "Git", "GitHub", "REST API", "GraphQL", "CI/CD",
    "Linux", "Machine Learning", "Deep Learning", "Data Analysis", "SQL", "Java",
    "C++", "C#", "Go", "Rust", "PHP", "Laravel", "Vue.js", "Angular", "Redux",
    "TensorFlow", "PyTorch", "LangChain", "Playwright", "Selenium", "Pandas", "NumPy"
]


def extract_contact_and_links(text: str) -> dict:
    """Extract candidate name, email, phone, GitHub URL, LinkedIn URL, and portfolio URL."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    full_name = None
    if lines:
        first_line = lines[0]
        if len(first_line) < 45 and not any(c in first_line for c in ["@", "http", ".com", "|", "/"]):
            full_name = first_line

    email_match = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
    phone_match = re.search(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", text)
    github_match = re.search(r"(?:https?://)?(?:www\.)?github\.com/[\w-]+", text, re.IGNORECASE)
    linkedin_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w-]+", text, re.IGNORECASE)
    portfolio_match = re.search(
        r"https?://(?!(?:www\.)?(?:github\.com|linkedin\.com|twitter\.com|x\.com))[\w.-]+\.[a-z]{2,}(?:/[\w./-]*)?",
        text,
        re.IGNORECASE,
    )

    github_url = github_match.group(0) if github_match else None
    if github_url and not github_url.startswith("http"):
        github_url = f"https://{github_url}"

    linkedin_url = linkedin_match.group(0) if linkedin_match else None
    if linkedin_url and not linkedin_url.startswith("http"):
        linkedin_url = f"https://{linkedin_url}"

    return {
        "full_name": full_name,
        "extracted_email": email_match.group(0) if email_match else None,
        "phone": phone_match.group(0).strip() if phone_match else None,
        "github_url": github_url,
        "linkedin_url": linkedin_url,
        "portfolio_url": portfolio_match.group(0) if portfolio_match else None,
    }


def _normalize_projects(raw_projects: Any) -> List[dict]:
    normalized = []
    if not isinstance(raw_projects, list):
        return normalized
    for item in raw_projects:
        if isinstance(item, dict):
            name = (item.get("name") or item.get("title") or "").strip()
            desc = (item.get("description") or "").strip()
            tech = item.get("technologies") or item.get("tech_stack") or []
            url = item.get("url") or ""
            if name or desc:
                normalized.append({
                    "name": name or "Project",
                    "title": name or "Project",
                    "description": desc,
                    "technologies": tech if isinstance(tech, list) else [],
                    "url": url,
                })
        elif isinstance(item, str) and item.strip():
            normalized.append({
                "name": item.strip()[:80],
                "title": item.strip()[:80],
                "description": item.strip(),
                "technologies": [],
                "url": "",
            })
    return normalized


def _normalize_experience(raw_exp: Any) -> List[dict]:
    normalized = []
    if not isinstance(raw_exp, list):
        return normalized
    for item in raw_exp:
        if isinstance(item, dict):
            title = (item.get("title") or item.get("role") or "").strip()
            company = (item.get("company") or "").strip()
            duration = (item.get("duration") or item.get("date") or "").strip()
            desc = (item.get("description") or "").strip()
            if title or company or desc:
                normalized.append({
                    "title": title or "Experience",
                    "company": company,
                    "duration": duration,
                    "date": duration,
                    "description": desc,
                })
    return normalized


def _normalize_education(raw_edu: Any) -> List[dict]:
    normalized = []
    if not isinstance(raw_edu, list):
        return normalized
    for item in raw_edu:
        if isinstance(item, dict):
            degree = (item.get("degree") or "").strip()
            inst = (item.get("institution") or item.get("school") or "").strip()
            year = str(item.get("year") or item.get("date") or "").strip()
            if degree or inst:
                normalized.append({
                    "degree": degree or "Degree",
                    "institution": inst,
                    "year": year,
                    "date": year,
                })
    return normalized


def parse_resume_with_llm(text: str, llm_config: Optional[Dict[str, Optional[str]]] = None) -> dict:
    """Parse structured resume details, summary, skills, experience, education, and projects using LLM."""
    system_prompt = (
        "You are an expert ATS resume parser. Extract structured details from the resume text. "
        "Respond ONLY with valid raw JSON (no markdown fences) matching this schema:\n"
        "{\n"
        '  "full_name": "Candidate full name or empty string",\n'
        '  "summary": "Concise 2-3 sentence professional summary of the candidate",\n'
        '  "skills": ["Skill 1", "Skill 2"],\n'
        '  "experience": [{"title": "Role", "company": "Company", "duration": "Dates", "description": "Key work"}],\n'
        '  "education": [{"degree": "Degree", "institution": "School", "year": "Year"}],\n'
        '  "projects": [{"name": "Project Name", "description": "What it does and impact", "technologies": ["Tech1", "Tech2"], "url": ""}],\n'
        '  "languages": ["English"]\n'
        "}"
    )

    try:
        parsed = call_llm_json(
            system_prompt=system_prompt,
            user_prompt=text[:8000],
            llm_config=llm_config,
            timeout=30.0,
        )
    except RuntimeError as err:
        msg = str(err)
        if "429" in msg or "quota" in msg.lower():
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="LLM API rate limit reached")
        raise

    return {
        "full_name": (parsed.get("full_name") or "").strip() or None,
        "summary": (parsed.get("summary") or "").strip(),
        "skills": [str(s).strip() for s in (parsed.get("skills") or []) if str(s).strip()],
        "experience": _normalize_experience(parsed.get("experience")),
        "education": _normalize_education(parsed.get("education")),
        "projects": _normalize_projects(parsed.get("projects")),
        "languages": [str(l).strip() for l in (parsed.get("languages") or []) if str(l).strip()],
    }


def rule_based_parse(text: str) -> dict:
    """Heuristic parser for skills, summary, experience, education, projects, and languages."""
    headings = {
        "summary": ["summary", "profile", "objective", "about me", "professional summary"],
        "education": ["education", "academic history", "qualification", "academic background"],
        "skills": ["skills", "core competencies", "technical skills", "technologies", "expertise", "tech stack"],
        "experience": ["experience", "work history", "employment", "professional experience", "work experience"],
        "projects": ["projects", "personal projects", "academic projects", "key projects", "selected projects"],
        "languages": ["languages", "spoken languages", "language proficiency"],
    }

    lines = text.split("\n")
    sections = {k: [] for k in headings}
    current_section = None

    for line in lines:
        cleaned = line.strip()
        if not cleaned:
            continue

        found_heading = False
        for sec, keywords in headings.items():
            for kw in keywords:
                if re.match(rf"^\s*(?:#+\s*)?{kw}\b[:\s-]*$", cleaned, re.IGNORECASE) or (
                    len(cleaned) < 40 and re.match(rf"^\s*(?:#+\s*)?{kw}\b", cleaned, re.IGNORECASE)
                ):
                    current_section = sec
                    found_heading = True
                    break
            if found_heading:
                break

        if not found_heading and current_section:
            sections[current_section].append(cleaned)

    parsed = {
        "summary": "",
        "skills": [],
        "experience": [],
        "education": [],
        "projects": [],
        "languages": [],
    }

    if sections["summary"]:
        parsed["summary"] = " ".join(sections["summary"][:4])
    else:
        intro_lines = [l.strip() for l in lines if l.strip() and len(l.strip()) > 20]
        parsed["summary"] = " ".join(intro_lines[:3])[:500] if intro_lines else ""

    skills_text = " ".join(sections["skills"])
    if skills_text:
        raw_skills = [s.strip("•-* ") for s in re.split(r"[,•|;]|\band\b", skills_text) if s.strip()]
        parsed["skills"] = list(dict.fromkeys([s for s in raw_skills if 1 < len(s) < 45]))[:40]

    # Always supplement with detected tech keywords found anywhere in resume
    detected_tech = [
        kw for kw in COMMON_TECH_KEYWORDS
        if re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", text, re.IGNORECASE)
    ]
    existing_lower = {s.lower() for s in parsed["skills"]}
    for kw in detected_tech:
        if kw.lower() not in existing_lower:
            parsed["skills"].append(kw)
            existing_lower.add(kw.lower())

    for line in sections["education"][:6]:
        institution = ""
        year = ""
        inst_match = re.search(r"(?:at|,|-|—|\|)\s*([A-Za-z0-9\s.&]+?)(?:,|\s+\d{4})?$", line, re.IGNORECASE)
        if inst_match:
            institution = inst_match.group(1).strip()
        year_match = re.search(r"\b(19|20)\d{2}\b", line)
        if year_match:
            year = year_match.group(0)
        parsed["education"].append({
            "degree": line,
            "institution": institution,
            "year": year,
            "date": year,
        })

    for line in sections["experience"][:10]:
        parts = re.split(r"\s+(?:at|@|\||—|-)\s+", line, maxsplit=1)
        title = parts[0].strip() if parts else line
        company = parts[1].strip() if len(parts) > 1 else ""
        parsed["experience"].append({
            "title": title,
            "company": company,
            "duration": "",
            "date": "",
            "description": line,
        })

    for line in sections["projects"][:8]:
        parts = re.split(r"\s*[:\-—|]\s*", line, maxsplit=1)
        proj_name = parts[0].strip("•-* ") if parts else line[:60]
        proj_desc = parts[1].strip() if len(parts) > 1 else line
        proj_tech = [
            kw for kw in COMMON_TECH_KEYWORDS
            if re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", line, re.IGNORECASE)
        ]
        parsed["projects"].append({
            "name": proj_name or "Project",
            "title": proj_name or "Project",
            "description": proj_desc,
            "technologies": proj_tech,
            "url": "",
        })

    lang_text = " ".join(sections["languages"])
    if lang_text:
        langs = [l.strip("•-* ") for l in re.split(r"[,•|;]|\band\b", lang_text) if l.strip()]
        parsed["languages"] = list(dict.fromkeys(langs))

    return parsed


def parse_resume_text(
    text: str,
    llm_config: Optional[Dict[str, Optional[str]]] = None,
) -> dict:
    """Parse raw resume text into full structured profile details, projects, and contact info."""
    cfg = llm_config or {}
    links_data = extract_contact_and_links(text)

    parsed_data = None
    if is_llm_configured(
        api_key=cfg.get("api_key"),
        provider=cfg.get("provider"),
        custom_api_base=cfg.get("custom_api_base"),
    ):
        try:
            parsed_data = parse_resume_with_llm(text, llm_config=cfg)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"LLM resume parsing failed ({e}); falling back to rule-based parser.")

    if not parsed_data:
        parsed_data = rule_based_parse(text)
    else:
        # Ensure rule-based fallback fills empty sections if LLM omitted them
        heuristic = rule_based_parse(text)
        for key in ("skills", "experience", "education", "projects", "languages"):
            if not parsed_data.get(key):
                parsed_data[key] = heuristic[key]
        if not parsed_data.get("summary"):
            parsed_data["summary"] = heuristic["summary"]

    for k, v in links_data.items():
        if v and not parsed_data.get(k):
            parsed_data[k] = v

    return parsed_data
