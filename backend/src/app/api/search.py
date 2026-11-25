import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.app.db.database import get_db
from src.app.core.security import get_current_user
from src.app.db.models import JobFound, User, UserJobMatch, Application
from src.app.services.search.aggregator import SearchAggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


class TriggerSearchRequest(BaseModel):
    query: Optional[str] = Field(None, description="Optional override query; defaults to resume details, projects, and job details.")
    country: Optional[str] = Field(None, description="Optional country code (e.g. us, gb, de).")


@router.post("/trigger")
async def trigger_search(
    payload: TriggerSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scan LinkedIn, Indeed, Google, and Greenhouse using the user's extracted Resume,
    Projects, and Job Details, then score and rank jobs for the portal.
    """
    aggregator = SearchAggregator()
    try:
        result = await aggregator.run_preferences_guided_search(
            db=db,
            user_id=current_user.id,
            explicit_query=payload.query,
            explicit_country=payload.country,
        )
        source_names = ", ".join(result.get("source_status", {}).keys())
        msg = (
            f"Scanned {source_names}: {result['new_opportunities_found']} new jobs found, "
            f"{result['total_scored']} jobs matched to your resume."
            if source_names
            else "No job connectors are enabled yet. Connect your sources in Plugins first."
        )
        return {
            "status": "success",
            "message": msg,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search aggregation trigger failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run job search: {str(e)}",
        )


@router.get("/opportunities")
def get_opportunities(
    source: Optional[str] = Query(None, description="Filter by source: LinkedIn, Indeed, Google, Greenhouse"),
    opportunity_type: Optional[str] = Query(None, description="Filter by type: job, internship"),
    company: Optional[str] = Query(None, description="Filter by company name"),
    title: Optional[str] = Query(None, description="Filter by job title"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch jobs ranked by this user's resume & project match score."""
    query = db.query(JobFound)
    if source:
        query = query.filter(JobFound.source.ilike(source))
    if opportunity_type:
        query = query.filter(JobFound.opportunity_type == opportunity_type)
    if company:
        query = query.filter(JobFound.company.ilike(f"%{company}%"))
    if title:
        query = query.filter(JobFound.title.ilike(f"%{title}%"))

    jobs = query.order_by(JobFound.found_at.desc()).all()

    # Load per-user match scores & applied status
    user_matches = {
        m.job_id: m
        for m in db.query(UserJobMatch).filter(UserJobMatch.user_id == current_user.id).all()
    }
    applied_urls = {
        a.url
        for a in db.query(Application).filter(
            Application.user_id == current_user.id,
            Application.status != "Failed",
        ).all()
        if a.url
    }

    enriched = []
    for o in jobs:
        um = user_matches.get(o.id)
        score = um.match_score if um else o.match_score
        reasons = (um.match_reasons if um else o.match_reasons) or []
        apply_target = o.apply_url or o.url
        already_applied = (apply_target in applied_urls) or (o.url in applied_urls)
        method = "email" if o.company_email else (o.apply_method or "playwright")
        enriched.append({
            "id": o.id,
            "title": o.title,
            "company": o.company,
            "location": o.location,
            "country": o.country,
            "description": o.description,
            "url": o.url,
            "apply_url": apply_target,
            "apply_method": method,
            "company_email": o.company_email,
            "extracted_emails": o.extracted_emails or [],
            "salary": o.salary,
            "source": o.source,
            "opportunity_type": o.opportunity_type,
            "match_score": score,
            "match_reasons": reasons,
            "already_applied": already_applied,
            "found_at": o.found_at,
        })

    # Rank according to user resume match score descending, then newest
    enriched.sort(key=lambda item: (item["match_score"] or 0), reverse=True)
    total = len(enriched)
    paged = enriched[skip: skip + limit]

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": paged,
    }
