import asyncio
import html
import logging
import re
from typing import List, Dict, Optional
import httpx
from src.app.core.config import settings
from src.app.services.search.base import BaseSearchProvider

logger = logging.getLogger(__name__)


def clean_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return " ".join(text.split())


def _infer_country_from_location(location: str, default_country: str) -> str:
    loc = (location or "").lower()
    if any(k in loc for k in ("united kingdom", "london", ", uk", "manchester")):
        return "gb"
    if any(k in loc for k in ("canada", "toronto", "vancouver", "montreal")):
        return "ca"
    if any(k in loc for k in ("germany", "berlin", "munich")):
        return "de"
    if any(k in loc for k in ("singapore",)):
        return "sg"
    if any(k in loc for k in ("india", "bengaluru", "bangalore", "hyderabad")):
        return "in"
    if any(k in loc for k in ("remote", "worldwide", "global", "united states", "san francisco", "new york", "usa", ", us")):
        return "us"
    return (default_country or "us").lower()


class GreenhouseProvider(BaseSearchProvider):
    source_name = "Greenhouse"

    async def search(
        self,
        query: str,
        country: str = "us",
        companies: Optional[List[str]] = None,
        limit: int = 20,
        **kwargs,
    ) -> List[Dict]:
        """Crawl public Greenhouse job boards and match via keyword tokens from resume & role query."""
        board_list = companies or settings.TRACKED_COMPANIES_GREENHOUSE
        tokens = [t.lower() for t in re.findall(r"[a-zA-Z0-9+#.]{2,}", query or "")]
        results: List[Dict] = []

        async def _fetch_board(client: httpx.AsyncClient, company: str) -> List[Dict]:
            board_url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true"
            board_hits: List[Dict] = []
            try:
                resp = await client.get(board_url)
                if resp.status_code != 200:
                    return board_hits
                data = resp.json()
                for job in data.get("jobs", []):
                    title = job.get("title", "")
                    content_html = job.get("content", "")
                    desc = clean_html(content_html)
                    haystack = f"{title} {desc}".lower()

                    if tokens:
                        matched = sum(1 for tok in tokens if tok in haystack)
                        required = 1 if len(tokens) <= 2 else 2
                        if matched < required:
                            continue

                    loc_name = (job.get("location") or {}).get("name", "Remote")
                    abs_url = job.get("absolute_url", "")
                    if not abs_url:
                        continue
                    opp_type = "internship" if "intern" in title.lower() else "job"
                    board_hits.append({
                        "title": title,
                        "company": company.capitalize(),
                        "location": loc_name,
                        "country": _infer_country_from_location(loc_name, country),
                        "description": desc or f"{title} at {company.capitalize()}.",
                        "url": abs_url,
                        "apply_url": f"{abs_url}#app",
                        "salary": None,
                        "opportunity_type": opp_type,
                        "source": self.source_name,
                        "raw_data": job,
                    })
            except Exception as exc:
                logger.warning(f"Failed to fetch Greenhouse board for {company}: {exc}")
            return board_hits

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                batches = await asyncio.gather(*[_fetch_board(client, comp) for comp in board_list])
            for batch in batches:
                results.extend(batch)
            results = results[:limit]
            self.last_status = {
                "source": self.source_name,
                "status": "ok",
                "count": len(results),
                "detail": f"Scanned {len(board_list)} Greenhouse boards and matched {len(results)} roles.",
            }
        except Exception as e:
            logger.warning(f"Greenhouse crawl failed: {e}")
            self.last_status = {
                "source": self.source_name,
                "status": "error",
                "count": 0,
                "detail": str(e),
            }

        return results
