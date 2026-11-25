import html
import logging
import os
import re
from typing import List, Dict, Optional
from urllib.parse import quote_plus
import httpx
from bs4 import BeautifulSoup

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    async_playwright = None
    HAS_PLAYWRIGHT = False

from src.app.core.config import settings
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

    async def search(
        self,
        query: str,
        country: str = "us",
        limit: int = 10,
        session_path: Optional[str] = None,
        **kwargs,
    ) -> List[Dict]:
        """Inspect live LinkedIn jobs using the user's authenticated Playwright session."""
        location = COUNTRY_NAMES.get((country or "us").lower(), country or "United States")

        if session_path and os.path.exists(session_path) and HAS_PLAYWRIGHT:
            auth_results = await self._search_authenticated(query, location, country, limit, session_path)
            if auth_results is not None:
                return auth_results

        return await self._search_guest(query, location, country, limit)

    async def _search_authenticated(
        self, query: str, location: str, country: str, limit: int, session_path: str
    ) -> Optional[List[Dict]]:
        search_url = (
            f"https://www.linkedin.com/jobs/search/"
            f"?keywords={quote_plus(query)}&location={quote_plus(location)}&f_TPR=r604800"
        )
        results: List[Dict] = []
        async with async_playwright() as p:
            browser = None
            try:
                browser = await p.chromium.launch(
                    headless=settings.PLAYWRIGHT_HEADLESS,
                    timeout=settings.PLAYWRIGHT_TIMEOUT,
                )
                context = await browser.new_context(
                    storage_state=session_path,
                    viewport={"width": 1280, "height": 900},
                )
                page = await context.new_page()
                await page.goto(search_url, timeout=settings.PLAYWRIGHT_TIMEOUT, wait_until="domcontentloaded")
                await page.wait_for_timeout(2500)

                cur_url = (page.url or "").lower()
                if "/login" in cur_url or "uas/login" in cur_url:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "auth_expired",
                        "count": 0,
                        "detail": "LinkedIn session expired — reconnect LinkedIn in Plugins.",
                    }
                    return []
                if "checkpoint" in cur_url or "challenge" in cur_url:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "blocked",
                        "count": 0,
                        "detail": "LinkedIn requested security verification — reconnect via Browser Sign-In.",
                    }
                    return []

                cards = page.locator("li[data-occludable-job-id], div.job-card-container[data-job-id]")
                card_count = min(await cards.count(), limit)
                for i in range(card_count):
                    card = cards.nth(i)
                    try:
                        await card.scroll_into_view_if_needed(timeout=2000)
                        link = card.locator("a.job-card-container__link, a.job-card-list__title--link").first
                        title = (await link.inner_text(timeout=2000) or "").strip() if await link.count() > 0 else ""
                        href = (await link.get_attribute("href") or "") if await link.count() > 0 else ""
                        if not title or not href:
                            continue
                        job_url = f"https://www.linkedin.com{href.split('?')[0]}" if href.startswith("/") else href.split("?")[0]

                        comp_loc = card.locator(".artdeco-entity-lockup__subtitle, .job-card-container__primary-description").first
                        company = (await comp_loc.inner_text(timeout=1500) or "Company").strip() if await comp_loc.count() > 0 else "Company"
                        meta_loc = card.locator(".job-card-container__metadata-wrapper li, .artdeco-entity-lockup__caption").first
                        loc_text = (await meta_loc.inner_text(timeout=1500) or location).strip() if await meta_loc.count() > 0 else location

                        # Click card so authenticated LinkedIn renders full description & apply target
                        await card.click(timeout=2000)
                        await page.wait_for_timeout(700)
                        desc_el = page.locator("#job-details, div.jobs-description__content").first
                        description = (
                            (await desc_el.inner_text(timeout=2000) or "").strip()
                            if await desc_el.count() > 0
                            else f"{title} at {company} ({loc_text})."
                        )

                        results.append({
                            "title": " ".join(title.split()),
                            "company": " ".join(company.split()),
                            "location": " ".join(loc_text.split()),
                            "country": (country or "us").lower(),
                            "description": description,
                            "url": job_url,
                            "apply_url": job_url,
                            "salary": None,
                            "opportunity_type": "internship" if "intern" in title.lower() else "job",
                            "source": self.source_name,
                            "raw_data": {"linkedin_url": job_url, "authenticated": True},
                        })
                    except Exception:
                        continue

                await context.storage_state(path=session_path)
                self.last_status = {
                    "source": self.source_name,
                    "status": "ok",
                    "count": len(results),
                    "detail": f"Inspected {len(results)} postings using signed-in LinkedIn session.",
                }
                return results
            except Exception as exc:
                logger.warning(f"Authenticated LinkedIn Playwright search error: {exc}")
                return None
            finally:
                if browser:
                    await browser.close()

    async def _search_guest(self, query: str, location: str, country: str, limit: int) -> List[Dict]:
        url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        params = {"keywords": query, "location": location, "start": 0}
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
                        "detail": "LinkedIn rate limited (429).",
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

                    results.append({
                        "title": title,
                        "company": company,
                        "location": loc_text,
                        "country": (country or "us").lower(),
                        "description": description,
                        "url": job_url,
                        "apply_url": apply_url,
                        "salary": None,
                        "opportunity_type": "internship" if "intern" in title.lower() else "job",
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
