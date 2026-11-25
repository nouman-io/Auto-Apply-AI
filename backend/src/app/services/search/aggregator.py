import asyncio
import logging
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.db.models import JobFound, Profile, UserSettings, UserJobMatch
from src.app.services.email_extractor import extract_emails_from_text, select_best_hiring_email
from src.app.services.matching.matcher import MatchingEngine
from src.app.services.search.linkedin import LinkedInProvider
from src.app.services.search.indeed import IndeedProvider
from src.app.services.search.google import GoogleJobsProvider
from src.app.services.search.greenhouse import GreenhouseProvider

logger = logging.getLogger(__name__)

COUNTRY_MAP = {
    "united states": "us", "canada": "ca", "united kingdom": "gb",
    "germany": "de", "netherlands": "nl", "switzerland": "ch",
    "sweden": "se", "australia": "au", "singapore": "sg",
    "united arab emirates": "ae", "saudi arabia": "sa", "japan": "jp",
    "ireland": "ie", "france": "fr", "new zealand": "nz",
    "denmark": "dk", "norway": "no", "finland": "fi",
    "india": "in", "pakistan": "pk", "poland": "pl",
}


def _extract_country_codes(preferred_countries: Optional[List[str]]) -> List[str]:
    if not preferred_countries:
        return ["us"]
    emoji_pattern = re.compile(r"[\U0001F1E6-\U0001F1FF]")
    codes: List[str] = []
    for raw in preferred_countries:
        cleaned = emoji_pattern.sub("", str(raw).lower()).strip()
        matched = False
        for name_key, code in COUNTRY_MAP.items():
            if name_key in cleaned or cleaned == code:
                codes.append(code)
                matched = True
                break
        if not matched and len(cleaned) == 2 and cleaned.isalpha():
            codes.append(cleaned)
    return list(dict.fromkeys(codes)) or ["us"]


def build_resume_guided_queries(
    profile: Optional[Profile],
    user_settings: Optional[UserSettings],
    explicit_query: Optional[str] = None,
) -> List[str]:
    """
    Build search queries from:
    1. Explicit user query / job_details ("what type of work they do")
    2. Target roles
    3. Resume skills & projects
    """
    if explicit_query and explicit_query.strip():
        return [explicit_query.strip()]

    queries: List[str] = []
    target_roles = (user_settings.target_roles if user_settings and user_settings.target_roles else []) or []
    job_details = (user_settings.job_details if user_settings else "") or ""
    skills = (profile.skills if profile and profile.skills else []) or []
    projects = (profile.projects if profile and profile.projects else []) or []

    # Extract concise tech stack from projects
    project_terms: List[str] = []
    for proj in projects[:4]:
        if isinstance(proj, dict):
            for t in proj.get("technologies") or []:
                if isinstance(t, str) and t.strip():
                    project_terms.append(t.strip())
            if proj.get("name"):
                words = [w for w in re.findall(r"[a-zA-Z0-9+#.]{3,}", proj["name"]) if w.lower() not in ("app", "system", "project", "platform")]
                project_terms.extend(words[:2])

    # Extract concise focus terms from job_details
    detail_terms = [
        w for w in re.findall(r"[a-zA-Z0-9+#.]{3,}", job_details)
        if w.lower() not in ("want", "work", "jobs", "looking", "with", "that", "this", "have", "type")
    ]

    top_skills = skills[:2]
    top_proj = list(dict.fromkeys(project_terms))[:2]

    for role in target_roles[:2]:
        if role and role.strip():
            queries.append(role.strip())
            if top_skills:
                queries.append(f"{role.strip()} {top_skills[0]}".strip())

    if detail_terms:
        queries.append(" ".join(detail_terms[:3]))

    if top_proj:
        base_role = target_roles[0] if target_roles else (top_skills[0] if top_skills else "Software Engineer")
        queries.append(f"{base_role} {top_proj[0]}".strip())

    if not queries:
        if top_skills:
            queries.append(f"{' '.join(top_skills[:2])} Developer")
        else:
            queries.append("Software Engineer")

    return list(dict.fromkeys(q for q in queries if q))[:4]


class SearchAggregator:
    """Connects to LinkedIn, Indeed, Google, and Greenhouse to gather and score jobs."""

    def __init__(self):
        self.linkedin = LinkedInProvider()
        self.indeed = IndeedProvider()
        self.google = GoogleJobsProvider()
        self.greenhouse = GreenhouseProvider()

    async def run_aggregation(
        self,
        db: Session,
        query: str,
        country: str = "us",
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run LinkedIn, Indeed, Google, and Greenhouse concurrently and persist new jobs."""
        logger.info(f"Running 4-source aggregation (LinkedIn, Indeed, Google, Greenhouse) for '{query}' [{country}]")

        greenhouse_companies = None
        serpapi_key = None
        enabled = {"linkedin", "indeed", "google", "greenhouse"}
        if user_id and db:
            u_set = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
            if u_set:
                if u_set.greenhouse_companies:
                    greenhouse_companies = u_set.greenhouse_companies
                serpapi_key = u_set.serpapi_api_key
                if u_set.enabled_connectors is not None:
                    enabled = {c.lower() for c in u_set.enabled_connectors}

        provider_specs = [
            ("linkedin", self.linkedin, self.linkedin.search(query, country=country)),
            ("indeed", self.indeed, self.indeed.search(query, country=country)),
            ("google", self.google, self.google.search(query, country=country, serpapi_key=serpapi_key)),
            ("greenhouse", self.greenhouse, self.greenhouse.search(query, country=country, companies=greenhouse_companies)),
        ]
        active = [(p, coro) for key, p, coro in provider_specs if key in enabled]
        for key, p, coro in provider_specs:
            if key not in enabled:
                coro.close()

        providers = [p for p, _ in active]
        tasks = [coro for _, coro in active]

        gathered = await asyncio.gather(*tasks, return_exceptions=True)

        all_opportunities: List[Dict[str, Any]] = []
        source_status: Dict[str, Dict[str, Any]] = {}
        for provider, res in zip(providers, gathered):
            if isinstance(res, Exception):
                logger.error(f"Provider {provider.source_name} failed: {res}")
                source_status[provider.source_name] = {
                    "source": provider.source_name,
                    "status": "error",
                    "count": 0,
                    "detail": str(res),
                }
            else:
                all_opportunities.extend(res)
                source_status[provider.source_name] = dict(provider.last_status)

        new_records_count = 0
        touched_job_ids: List[int] = []
        seen_urls = set()

        for opp in all_opportunities:
            url = (opp.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            existing = db.query(JobFound).filter(JobFound.url == url).first()
            if existing:
                touched_job_ids.append(existing.id)
                continue

            description = opp.get("description") or ""
            company = opp.get("company") or "Company"

            # Extract ONLY genuine HR emails found in posting content (never fabricate)
            extracted_emails = extract_emails_from_text(description)
            company_email = select_best_hiring_email(extracted_emails, company)
            apply_method = "email" if company_email else "playwright"

            job_record = JobFound(
                title=opp.get("title") or "Untitled Role",
                company=company,
                company_email=company_email,
                extracted_emails=extracted_emails,
                location=opp.get("location"),
                country=(opp.get("country") or country).lower(),
                description=description,
                url=url,
                apply_url=opp.get("apply_url") or url,
                apply_method=apply_method,
                salary=opp.get("salary"),
                source=opp.get("source") or "Greenhouse",
                opportunity_type=opp.get("opportunity_type") or "job",
                raw_data=opp.get("raw_data") or {},
            )
            db.add(job_record)
            try:
                db.commit()
                db.refresh(job_record)
                new_records_count += 1
                touched_job_ids.append(job_record.id)
            except IntegrityError:
                db.rollback()
            except Exception as exc:
                db.rollback()
                logger.error(f"Failed to insert job {url}: {exc}")

        return {
            "new_count": new_records_count,
            "job_ids": touched_job_ids,
            "source_status": source_status,
        }

    async def run_preferences_guided_search(
        self,
        db: Session,
        user_id: str,
        explicit_query: Optional[str] = None,
        explicit_country: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Full whiteboard pipeline:
        1. Read extracted Resume details & projects + user job_details & target preferences.
        2. Query LinkedIn, Indeed, Google, and Greenhouse.
        3. Score every discovered job against the user's Resume & projects and persist scores.
        """
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()

        queries = build_resume_guided_queries(profile, user_settings, explicit_query=explicit_query)
        if explicit_country:
            countries = [explicit_country.lower()]
        else:
            countries = _extract_country_codes(user_settings.preferred_countries if user_settings else None)

        total_new = 0
        merged_sources: Dict[str, Dict[str, Any]] = {}
        candidate_job_ids: List[int] = []

        for country in countries[:2]:
            for query in queries[:3]:
                agg = await self.run_aggregation(db=db, query=query, country=country, user_id=user_id)
                total_new += agg["new_count"]
                candidate_job_ids.extend(agg["job_ids"])
                for src, info in agg["source_status"].items():
                    prev = merged_sources.get(src)
                    if not prev:
                        merged_sources[src] = dict(info)
                    else:
                        prev["count"] = prev.get("count", 0) + info.get("count", 0)
                        if info.get("status") == "ok":
                            prev["status"] = "ok"
                            prev["detail"] = f"Collected {prev['count']} results from {src}."

        # Score all jobs (new + recent) for this user so the portal ranks according to resume
        matcher = MatchingEngine()
        jobs_to_score = db.query(JobFound).order_by(JobFound.found_at.desc()).limit(100).all()
        scored_count = 0

        for job in jobs_to_score:
            eval_res = await matcher.evaluate_job_match(db=db, user_id=user_id, job_id=job.id)
            score_pct = eval_res["score_pct"]
            reasons = eval_res["reasons"]

            existing_match = (
                db.query(UserJobMatch)
                .filter(UserJobMatch.user_id == user_id, UserJobMatch.job_id == job.id)
                .first()
            )
            if existing_match:
                existing_match.match_score = score_pct
                existing_match.match_reasons = reasons
            else:
                db.add(UserJobMatch(
                    user_id=user_id,
                    job_id=job.id,
                    match_score=score_pct,
                    match_reasons=reasons,
                ))

            job.match_score = score_pct
            job.match_reasons = reasons
            scored_count += 1

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error(f"Failed to persist job match scores: {exc}")

        return {
            "new_opportunities_found": total_new,
            "total_scored": scored_count,
            "queries_used": queries,
            "countries_used": countries[:2],
            "source_status": merged_sources,
        }
