from abc import ABC, abstractmethod
from typing import List, Dict, Any


class BaseSearchProvider(ABC):
    source_name: str = "Unknown"

    def __init__(self):
        self.last_status: Dict[str, Any] = {
            "source": self.source_name,
            "status": "idle",
            "count": 0,
            "detail": "",
        }

    @abstractmethod
    async def search(self, query: str, country: str = "us", **kwargs) -> List[Dict]:
        """
        Search for job opportunities.
        Returns a list of dicts with standard keys:
            title, company, location, country, description, url, apply_url,
            salary, opportunity_type, source, raw_data
        """
        pass
