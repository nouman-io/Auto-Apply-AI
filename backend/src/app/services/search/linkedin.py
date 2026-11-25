import html
import logging
import re
from typing import List, Dict
import httpx
from bs4 import BeautifulSoup
from src.app.services.search.base import BaseSearchProvider

logger = logging.getLogger(__name__)

COUNTRY_NAMES = {
    "us": "United States",
    "gb": "United Kingdom",
    "ca": "Canada",
    "de": "Germany",
    "nl": "Netherlands",
    "ch": "Switzerland",
    "se": "Sweden",
    "au": "Australia",
    "sg": "Singapore",
    "ae": "United Arab Emirates",
    "in": "India",
    "pk": "Pakistan",
    "fr": "France",
}


class LinkedInProvider(BaseSearchProvider):
    source_name = "LinkedIn"

    async def search(self, query: str, country: str = "us", limit: int = 10, **kwargs) -> List[Dict]:
        """Fetch live public job postings from LinkedIn's guest jobs API."""
        location = COUNTRY_NAMES.get((country or "us").lower(), country or "United States")
        url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        params = {
            "keywords": query,
            "location": location,
            "start": 0,
        }
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
        results: List[Dict] = []

        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 429:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "rate_limited",
                        "count": 0,
                        "detail": "LinkedIn guest API rate limited (429).",
                    }
                    return []
                if resp.status_code != 200:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "error",
                        "count": 0,
                        "detail": f"LinkedIn returned HTTP {resp.status_code}.",
                    }
                    return []

                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select("li")[:limit]
                for card in cards:
                    title_el = card.select_one("h3.base-search-card__title")
                    company_el = card.select_one("h4.base-search-card__subtitle")
                    loc_el = card.select_one("span.job-search-card__location")
                    link_el = card.select_one("a.base-card__full-link")
                    if not title_el or not link_el:
                        continue

                    job_url = (link_el.get("href") or "").split("?")[0].strip()
                    title = title_el.get_text(" ", strip=True)
                    company = company_el.get_text(" ", strip=True) if company_el else "Company"
                    loc_text = loc_el.get_text(" ", strip=True) if loc_el else location

                    # Extract job ID and fetch full description + external apply URL when possible
                    description = f"{title} at {company} ({loc_text})."
                    apply_url = job_url
                    id_match = re.search(r"-(\d+)(?:/?$)", job_url)
                    if id_match:
                        job_id = id_match.group(1)
                        try:
                            detail_resp = await client.get(
                                f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}",
                                headers=headers,
                            )
                            if detail_resp.status_code == 200:
                                detail_soup = BeautifulSoup(detail_resp.text, "html.parser")
                                desc_el = detail_soup.select_one("div.show-more-less-html__markup")
                                if desc_el:
                                    description = html.unescape(desc_el.get_text("\n", strip=True))
                                ext_link = detail_soup.select_one("a.apply-button")
                                if ext_link and ext_link.get("href"):
                                    apply_url = ext_link["href"]
                        except Exception:
                            pass

                    opp_type = "internship" if "intern" in title.lower() else "job"
                    results.append({
                        "title": title,
                        "company": company,
                        "location": loc_text,
                        "country": (country or "us").lower(),
                        "description": description,
                        "url": job_url,
                        "apply_url": apply_url,
                        "salary": None,
                        "opportunity_type": opp_type,
                        "source": self.source_name,
                        "raw_data": {"linkedin_url": job_url},
                    })

            self.last_status = {
                "source": self.source_name,
                "status": "ok",
                "count": len(results),
                "detail": f"Fetched {len(results)} postings from LinkedIn.",
            }
        except Exception as e:
            logger.warning(f"LinkedIn search failed: {e}")
            self.last_status = {
                "source": self.source_name,
                "status": "error",
                "count": 0,
                "detail": str(e),
            }

        return results
