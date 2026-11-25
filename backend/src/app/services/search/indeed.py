import html
import logging
import os
import xml.etree.ElementTree as ET
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

INDEED_HOSTS = {
    "us": "www.indeed.com",
    "gb": "uk.indeed.com",
    "uk": "uk.indeed.com",
    "ca": "ca.indeed.com",
    "de": "de.indeed.com",
    "nl": "nl.indeed.com",
    "fr": "fr.indeed.com",
    "au": "au.indeed.com",
    "sg": "sg.indeed.com",
    "ae": "ae.indeed.com",
    "in": "in.indeed.com",
    "pk": "pk.indeed.com",
}


class IndeedProvider(BaseSearchProvider):
    source_name = "Indeed"

    async def search(
        self,
        query: str,
        country: str = "us",
        limit: int = 10,
        session_path: Optional[str] = None,
        **kwargs,
    ) -> List[Dict]:
        """Fetch live job listings from Indeed using signed-in Playwright session or RSS fallback."""
        cc = (country or "us").lower()
        host = INDEED_HOSTS.get(cc, "www.indeed.com")

        if session_path and os.path.exists(session_path) and HAS_PLAYWRIGHT:
            auth_results = await self._search_authenticated(query, cc, host, limit, session_path)
            if auth_results is not None:
                return auth_results

        return await self._search_rss(query, cc, host, limit)

    async def _search_authenticated(
        self, query: str, cc: str, host: str, limit: int, session_path: str
    ) -> Optional[List[Dict]]:
        search_url = f"https://{host}/jobs?q={quote_plus(query)}&fromage=7&sort=date"
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
                await page.wait_for_timeout(2200)

                body_text = (await page.inner_text("body") or "").lower()
                if any(m in body_text for m in ("verify you are human", "cloudflare", "hcaptcha", "additional verification")):
                    self.last_status = {
                        "source": self.source_name,
                        "status": "blocked",
                        "count": 0,
                        "detail": f"Indeed ({host}) presented human verification.",
                    }
                    return []

                cards = page.locator("div.job_seen_beacon")
                card_count = min(await cards.count(), limit)
                for i in range(card_count):
                    card = cards.nth(i)
                    try:
                        link = card.locator("a.jcs-JobTitle").first
                        if await link.count() == 0:
                            continue
                        title = (await link.inner_text(timeout=1500) or "").strip()
                        href = (await link.get_attribute("href") or "").strip()
                        if not title or not href:
                            continue
                        full_url = f"https://{host}{href}" if href.startswith("/") else href

                        comp_el = card.locator("[data-testid='company-name']").first
                        company = (await comp_el.inner_text(timeout=1500) or "Indeed Employer").strip() if await comp_el.count() > 0 else "Indeed Employer"
                        loc_el = card.locator("[data-testid='text-location']").first
                        loc_text = (await loc_el.inner_text(timeout=1500) or cc.upper()).strip() if await loc_el.count() > 0 else cc.upper()

                        await link.click(timeout=2000)
                        await page.wait_for_timeout(700)
                        desc_el = page.locator("#jobDescriptionText").first
                        description = (
                            (await desc_el.inner_text(timeout=2000) or "").strip()
                            if await desc_el.count() > 0
                            else title
                        )

                        results.append({
                            "title": " ".join(title.split()),
                            "company": " ".join(company.split()),
                            "location": " ".join(loc_text.split()),
                            "country": cc,
                            "description": description or title,
                            "url": full_url,
                            "apply_url": full_url,
                            "salary": None,
                            "opportunity_type": "internship" if "intern" in title.lower() else "job",
                            "source": self.source_name,
                            "raw_data": {"indeed_host": host, "authenticated": True},
                        })
                    except Exception:
                        continue

                await context.storage_state(path=session_path)
                self.last_status = {
                    "source": self.source_name,
                    "status": "ok",
                    "count": len(results),
                    "detail": f"Inspected {len(results)} postings using signed-in Indeed session.",
                }
                return results
            except Exception as exc:
                logger.warning(f"Authenticated Indeed Playwright search error: {exc}")
                return None
            finally:
                if browser:
                    await browser.close()

    async def _search_rss(self, query: str, cc: str, host: str, limit: int) -> List[Dict]:
        rss_url = f"https://{host}/rss"
        params = {"q": query, "sort": "date"}
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/rss+xml, application/xml, text/xml, text/html",
        }
        results: List[Dict] = []

        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(rss_url, params=params, headers=headers)
                if resp.status_code in (403, 429) or "cf-challenge" in resp.text.lower() or "captcha" in resp.text.lower():
                    self.last_status = {
                        "source": self.source_name,
                        "status": "blocked",
                        "count": 0,
                        "detail": f"Indeed ({host}) returned HTTP {resp.status_code} or anti-bot challenge.",
                    }
                    return []

                if resp.status_code == 200 and "<item>" in resp.text:
                    root = ET.fromstring(resp.text)
                    channel = root.find("channel")
                    items = channel.findall("item") if channel is not None else []
                    for item in items[:limit]:
                        raw_title = item.findtext("title") or ""
                        link = (item.findtext("link") or "").strip()
                        desc_html = item.findtext("description") or ""
                        if not raw_title or not link:
                            continue

                        parts = [p.strip() for p in raw_title.split(" - ")]
                        title = parts[0] if parts else raw_title
                        company = parts[1] if len(parts) > 1 else "Indeed Employer"
                        loc = parts[2] if len(parts) > 2 else cc.upper()

                        soup = BeautifulSoup(desc_html, "html.parser")
                        description = html.unescape(soup.get_text(" ", strip=True))
                        results.append({
                            "title": title,
                            "company": company,
                            "location": loc,
                            "country": cc,
                            "description": description or title,
                            "url": link,
                            "apply_url": link,
                            "salary": None,
                            "opportunity_type": "internship" if "intern" in title.lower() else "job",
                            "source": self.source_name,
                            "raw_data": {"indeed_host": host},
                        })

                self.last_status = {
                    "source": self.source_name,
                    "status": "ok",
                    "count": len(results),
                    "detail": f"Fetched {len(results)} postings from Indeed ({host}).",
                }
        except Exception as e:
            logger.warning(f"Indeed search failed: {e}")
            self.last_status = {
                "source": self.source_name,
                "status": "error",
                "count": 0,
                "detail": str(e),
            }

        return results
