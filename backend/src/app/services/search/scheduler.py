import asyncio
import logging
from src.app.db.database import SessionLocal
from src.app.core.config import settings
from src.app.services.search.aggregator import SearchAggregator

logger = logging.getLogger(__name__)

_scheduler_task = None
_shutdown_event = asyncio.Event()


async def start_search_scheduler():
    global _scheduler_task
    if _scheduler_task is not None:
        logger.warning("Search scheduler background task is already running.")
        return

    _shutdown_event.clear()
    _scheduler_task = asyncio.create_task(run_scheduler_loop())
    logger.info("Search scheduler background daemon started.")


async def stop_search_scheduler():
    global _scheduler_task
    if _scheduler_task is None:
        return

    _shutdown_event.set()
    try:
        await asyncio.wait_for(_scheduler_task, timeout=5.0)
    except Exception:
        if _scheduler_task:
            _scheduler_task.cancel()
    _scheduler_task = None
    logger.info("Search scheduler background daemon stopped.")


async def run_scheduler_loop():
    aggregator = SearchAggregator()
    interval_seconds = settings.SEARCH_INTERVAL_HOURS * 3600

    try:
        await asyncio.sleep(30.0)
    except asyncio.CancelledError:
        return

    while not _shutdown_event.is_set():
        db = None
        try:
            db = SessionLocal()
            for query in ("Python Developer", "Full Stack Engineer", "AI Engineer"):
                if _shutdown_event.is_set():
                    break
                await aggregator.run_aggregation(db, query)
                await asyncio.sleep(2.0)
        except Exception as e:
            logger.error(f"Scheduled background search error (non-fatal): {e}")
        finally:
            if db:
                db.close()

        elapsed = 0
        while elapsed < interval_seconds and not _shutdown_event.is_set():
            try:
                await asyncio.sleep(10.0)
                elapsed += 10
            except asyncio.CancelledError:
                return
