import html
import logging
import re
import xml.etree.ElementTree as ET
from typing import List, Dict
import httpx
from bs4 import BeautifulSoup
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

    async def search(self, query: str, country: str = "us", limit: int = 10, **kwargs) -> List[Dict]:
        """Fetch public job listings from Indeed RSS / public search without bypassing anti-bot gates."""
        cc = (country or "us").lower()
        host = INDEED_HOSTS.get(cc, "www.indeed.com")
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

                        # Indeed RSS titles often look like "Role - Company - Location"
                        parts = [p.strip() for p in raw_title.split(" - ")]
                        title = parts[0] if parts else raw_title
                        company = parts[1] if len(parts) > 1 else "Indeed Employer"
                        loc = parts[2] if len(parts) > 2 else cc.upper()

                        soup = BeautifulSoup(desc_html, "html.parser")
                        description = html.unescape(soup.get_text(" ", strip=True))
                        opp_type = "internship" if "intern" in title.lower() else "job"
                        results.append({
                            "title": title,
                            "company": company,
                            "location": loc,
                            "country": cc,
                            "description": description or title,
                            "url": link,
                            "apply_url": link,
                            "salary": None,
                            "opportunity_type": opp_type,
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
