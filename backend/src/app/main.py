import os
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from src.app.core.config import settings
from src.app.api.users import router as users_router
from src.app.api.resumes import router as resumes_router
from src.app.api.search import router as search_router
from src.app.api.applications import router as applications_router
from src.app.api.gmail import router as gmail_router
from src.app.api.auto_apply import router as auto_apply_router
from src.app.api.notifications import router as notifications_router
from src.app.services.search.scheduler import start_search_scheduler, stop_search_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await start_search_scheduler()
    except Exception as e:
        logger.warning(f"Search scheduler failed to start (non-fatal): {e}")

    yield

    try:
        await stop_search_scheduler()
    except Exception as e:
        logger.warning(f"Search scheduler failed to stop cleanly: {e}")


app = FastAPI(
    title="Auto Apply AI API",
    description="Real-time automated job discovery (LinkedIn, Indeed, Google, Greenhouse) and Playwright/Email auto-apply platform",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS or ["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    try:
        response = await call_next(request)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unhandled exception in request handler")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    process_time = time.perf_counter() - start_time
    response.headers["X-Process-Time-Ms"] = f"{process_time * 1000:.2f}"
    return response


upload_dir = os.path.abspath(settings.UPLOAD_DIR)
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

app.include_router(users_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")
app.include_router(gmail_router, prefix="/api/v1")
app.include_router(auto_apply_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": "Auto Apply AI API",
        "version": "0.3.0",
    }


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}
