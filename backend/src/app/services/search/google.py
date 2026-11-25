import html
import logging
import re
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup
from src.app.core.config import settings
from src.app.services.search.base import BaseSearchProvider

logger = logging.getLogger(__name__)


def _query_tokens(query: str) -> List[str]:
    return [t.lower() for t in re.findall(r"[a-zA-Z0-9+#.]{2,}", query or "")]


def _matches_tokens(text: str, tokens: List[str]) -> bool:
    if not tokens:
        return True
    lower = text.lower()
    hits = sum(1 for tok in tokens if tok in lower)
    return hits >= min(2, len(tokens))


class GoogleJobsProvider(BaseSearchProvider):
    source_name = "Google"

    async def search(
        self,
        query: str,
        country: str = "us",
        limit: int = 10,
        serpapi_key: Optional[str] = None,
        **kwargs,
    ) -> List[Dict]:
        """
        Discover jobs via Google:
        1. SerpAPI Google Jobs engine (if SERPAPI_API_KEY configured).
        2. Google Custom Search JSON API (if GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX configured).
        3. Google Careers public job results page as built-in fallback.
        """
        key_serp = serpapi_key or settings.SERPAPI_API_KEY
        if key_serp:
            results = await self._search_serpapi(query, country, key_serp, limit)
            if results:
                return results

        if settings.GOOGLE_SEARCH_API_KEY and settings.GOOGLE_SEARCH_CX:
            results = await self._search_google_cse(query, country, limit)
            if results:
                return results

        return await self._search_google_careers(query, country, limit)

    async def _search_serpapi(self, query: str, country: str, api_key: str, limit: int) -> List[Dict]:
        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google_jobs",
            "q": query,
            "gl": (country or "us").lower(),
            "hl": "en",
            "api_key": api_key,
        }
        results: List[Dict] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "error",
                        "count": 0,
                        "detail": f"SerpAPI Google Jobs returned HTTP {resp.status_code}.",
                    }
                    return []
                data = resp.json()
                for job in data.get("jobs_results", [])[:limit]:
                    apply_opts = job.get("apply_options") or []
                    apply_link = apply_opts[0].get("link") if apply_opts else job.get("share_link", "")
                    if not apply_link:
                        continue
                    title = job.get("title", "Role")
                    opp_type = "internship" if "intern" in title.lower() else "job"
                    results.append({
                        "title": title,
                        "company": job.get("company_name", "Company"),
                        "location": job.get("location", country.upper()),
                        "country": (country or "us").lower(),
                        "description": job.get("description", title),
                        "url": apply_link,
                        "apply_url": apply_link,
                        "salary": (job.get("detected_extensions") or {}).get("salary"),
                        "opportunity_type": opp_type,
                        "source": self.source_name,
                        "raw_data": job,
                    })
                self.last_status = {
                    "source": self.source_name,
                    "status": "ok",
                    "count": len(results),
                    "detail": f"Fetched {len(results)} postings via Google Jobs (SerpAPI).",
                }
        except Exception as e:
            logger.warning(f"SerpAPI Google Jobs failed: {e}")
        return results

    async def _search_google_cse(self, query: str, country: str, limit: int) -> List[Dict]:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": settings.GOOGLE_SEARCH_API_KEY,
            "cx": settings.GOOGLE_SEARCH_CX,
            "q": f"{query} jobs apply",
            "num": min(limit, 10),
        }
        results: List[Dict] = []
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    for item in resp.json().get("items", []):
                        title = item.get("title", "")
                        link = item.get("link", "")
                        snippet = item.get("snippet", "")
                        if not title or not link:
                            continue
                        results.append({
                            "title": title.split(" - ")[0].strip(),
                            "company": item.get("displayLink", "Google Search"),
                            "location": country.upper(),
                            "country": (country or "us").lower(),
                            "description": snippet,
                            "url": link,
                            "apply_url": link,
                            "salary": None,
                            "opportunity_type": "internship" if "intern" in title.lower() else "job",
                            "source": self.source_name,
                            "raw_data": item,
                        })
                    self.last_status = {
                        "source": self.source_name,
                        "status": "ok",
                        "count": len(results),
                        "detail": f"Fetched {len(results)} postings via Google Custom Search.",
                    }
        except Exception as e:
            logger.warning(f"Google CSE failed: {e}")
        return results

    async def _search_google_careers(self, query: str, country: str, limit: int) -> List[Dict]:
        url = "https://www.google.com/about/careers/applications/jobs/results/"
        params = {"q": query}
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        }
        results: List[Dict] = []
        tokens = _query_tokens(query)
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code != 200:
                    self.last_status = {
                        "source": self.source_name,
                        "status": "error",
                        "count": 0,
                        "detail": f"Google Careers returned HTTP {resp.status_code}.",
                    }
                    return []

                soup = BeautifulSoup(resp.text, "html.parser")
                seen_urls = set()
                for anchor in soup.select("a[href*='jobs/results/']"):
                    href = anchor.get("href") or ""
                    if "/jobs/results/" not in href or href in seen_urls:
                        continue
                    text = html.unescape(anchor.get_text(" ", strip=True))
                    if len(text) < 4 or text.lower() in ("learn more", "apply"):
                        continue

                    full_url = href if href.startswith("http") else f"https://www.google.com/about/careers/applications/{href.lstrip('/')}"
                    if full_url in seen_urls:
                        continue

                    card_text = html.unescape(anchor.parent.get_text(" ", strip=True)) if anchor.parent else text
                    if not _matches_tokens(f"{text} {card_text}", tokens):
                        continue

                    seen_urls.add(full_url)
                    results.append({
                        "title": text[:120],
                        "company": "Google",
                        "location": country.upper(),
                        "country": (country or "us").lower(),
                        "description": card_text[:1500],
                        "url": full_url,
                        "apply_url": full_url,
                        "salary": None,
                        "opportunity_type": "internship" if "intern" in text.lower() else "job",
                        "source": self.source_name,
                        "raw_data": {"google_careers_url": full_url},
                    })
                    if len(results) >= limit:
                        break

                self.last_status = {
                    "source": self.source_name,
                    "status": "ok",
                    "count": len(results),
                    "detail": f"Fetched {len(results)} postings from Google Careers.",
                }
        except Exception as e:
            logger.warning(f"Google Careers search failed: {e}")
            self.last_status = {
                "source": self.source_name,
                "status": "error",
                "count": 0,
                "detail": str(e),
            }
        return results
