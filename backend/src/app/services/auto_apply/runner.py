import asyncio
import logging
import random
import threading
import time
import uuid
from typing import Dict
from sqlalchemy.orm import Session

from src.app.core.config import settings
from src.app.db.models import JobFound, Profile, UserSettings, Application, UserJobMatch
from src.app.services.application.pipeline import (
    execute_job_application,
    get_today_application_count,
    get_effective_daily_limit,
)

logger = logging.getLogger(__name__)

_active_runs: Dict[str, dict] = {}
_run_locks: Dict[str, threading.Lock] = {}
_stop_events: Dict[str, threading.Event] = {}


class AutoApplyBatchRunner:
    """
    Runs real-time batch application pipeline (0 -> 15 daily max):
    - Routes each job: Gmail if HR email found, Playwright if web-based.
    - Persists notifications & application proof so user can check every applied job.
    """

    MAX_DAILY_APPLY = settings.DAILY_APPLY_MAX

    def start_batch(self, uid: str, apply_count: int) -> dict:
        if apply_count < 0 or apply_count > self.MAX_DAILY_APPLY:
            raise ValueError(f"Apply count must be between 0 and {self.MAX_DAILY_APPLY}.")
        if apply_count == 0:
            raise ValueError("Select at least 1 job to start applying (0 -> 15).")

        if uid in _active_runs and _active_runs[uid].get("status") == "running":
            self.stop_batch(uid)

        run_id = uuid.uuid4().hex[:12]
        stop_event = threading.Event()
        _stop_events[uid] = stop_event
        _run_locks[uid] = threading.Lock()
        _active_runs[uid] = {
            "run_id": run_id,
            "status": "running",
            "target_count": apply_count,
            "total_applied": 0,
            "email_applied": 0,
            "playwright_applied": 0,
            "total_failed": 0,
            "started_at": time.time(),
            "completed_at": None,
            "last_error": None,
            "current_job_title": None,
            "current_job_company": None,
            "current_apply_method": None,
            "applied_jobs": [],
        }

        thread = threading.Thread(
            target=self._run_batch_worker,
            args=(uid, apply_count, run_id, stop_event),
            daemon=True,
            name=f"auto-apply-{uid}-{run_id}",
        )
        thread.start()

        return {
            "success": True,
            "run_id": run_id,
            "message": f"Auto-apply started for up to {apply_count} job(s) (daily max {self.MAX_DAILY_APPLY}).",
        }

    def stop_batch(self, uid: str) -> dict:
        if uid in _stop_events:
            _stop_events[uid].set()
        if uid in _active_runs:
            lock = _run_locks.get(uid, threading.Lock())
            with lock:
                _active_runs[uid]["status"] = "stopped"
                _active_runs[uid]["completed_at"] = time.time()
                applied = _active_runs[uid]["total_applied"]
            return {"success": True, "message": f"Auto-apply stopped. Applied to {applied} job(s)."}
        return {"success": False, "message": "No active auto-apply run found."}

    def dismiss_batch(self, uid: str) -> dict:
        if uid in _active_runs and _active_runs[uid].get("status") == "running":
            return {"success": False, "message": "Cannot dismiss an active auto-apply run. Stop it first."}
        _active_runs.pop(uid, None)
        _run_locks.pop(uid, None)
        _stop_events.pop(uid, None)
        return {"success": True, "message": "Auto-apply status dismissed."}

    def get_status(self, uid: str) -> dict:
        if uid not in _active_runs:
            return {
                "status": "idle",
                "run_id": None,
                "target_count": 0,
                "total_applied": 0,
                "email_applied": 0,
                "playwright_applied": 0,
                "total_failed": 0,
                "started_at": None,
                "completed_at": None,
                "current_job_title": None,
                "current_job_company": None,
                "current_apply_method": None,
                "applied_jobs": [],
            }
        state = dict(_active_runs[uid])
        state["applied_jobs"] = list(state.get("applied_jobs") or [])
        return state

    def _run_batch_worker(self, uid: str, apply_count: int, run_id: str, stop_event: threading.Event):
        from src.app.db.database import SessionLocal

        db: Session = SessionLocal()
        lock = _run_locks.get(uid, threading.Lock())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            profile = db.query(Profile).filter(Profile.user_id == uid).first()
            user_settings = db.query(UserSettings).filter(UserSettings.user_id == uid).first()

            if not profile or not profile.resume_url:
                self._update_state(uid, status="error", last_error="Please upload your resume first.")
                return

            daily_limit = get_effective_daily_limit(user_settings)
            today_count = get_today_application_count(db, uid)
            remaining_quota = max(0, daily_limit - today_count)
            if remaining_quota <= 0:
                self._update_state(
                    uid,
                    status="error",
                    last_error=f"Daily maximum reached ({today_count}/{daily_limit}). Try again tomorrow.",
                )
                return

            effective_target = min(apply_count, remaining_quota)
            applied_urls = {
                row.url
                for row in db.query(Application).filter(
                    Application.user_id == uid,
                    Application.status != "Failed",
                ).all()
                if row.url
            }

            # Order unapplied jobs by this user's resume match score descending
            score_map = {
                m.job_id: m.match_score
                for m in db.query(UserJobMatch).filter(UserJobMatch.user_id == uid).all()
            }
            all_jobs = db.query(JobFound).order_by(JobFound.found_at.desc()).all()
            queue = [
                j for j in all_jobs
                if (j.apply_url or j.url) not in applied_urls and j.url not in applied_urls
            ]
            queue.sort(key=lambda j: score_map.get(j.id, j.match_score or 0), reverse=True)

            if not queue:
                self._update_state(
                    uid,
                    status="error",
                    last_error="No unapplied jobs available. Run job search first.",
                )
                return

            processed = 0
            for idx, job in enumerate(queue):
                if stop_event.is_set():
                    return
                if _active_runs.get(uid, {}).get("total_applied", 0) >= effective_target:
                    break
                if processed >= effective_target * 2:
                    break

                expected_method = "email" if (
                    job.company_email
                    and user_settings
                    and user_settings.is_gmail_connected
                ) else "playwright"

                self._update_state(
                    uid,
                    current_job_title=job.title,
                    current_job_company=job.company,
                    current_apply_method=expected_method,
                )

                res = loop.run_until_complete(execute_job_application(db=db, user_id=uid, job=job))
                processed += 1

                if res.get("success"):
                    method = res.get("apply_method", expected_method)
                    with lock:
                        _active_runs[uid]["total_applied"] += 1
                        if method == "email":
                            _active_runs[uid]["email_applied"] += 1
                        else:
                            _active_runs[uid]["playwright_applied"] += 1
                        _active_runs[uid]["applied_jobs"].append({
                            "application_id": res.get("application_id"),
                            "title": job.title,
                            "company": job.company,
                            "method": method,
                            "status": "applied",
                            "target": res.get("recipient_email") or job.apply_url or job.url,
                            "screenshot_path": res.get("screenshot_path"),
                        })
                else:
                    with lock:
                        _active_runs[uid]["total_failed"] += 1
                        _active_runs[uid]["applied_jobs"].append({
                            "application_id": res.get("application_id"),
                            "title": job.title,
                            "company": job.company,
                            "method": res.get("apply_method", expected_method),
                            "status": "failed",
                            "error": res.get("error", "Unknown error"),
                        })
                    if not res.get("retryable", True):
                        self._update_state(uid, status="error", last_error=res.get("error"))
                        return

                # Check if target reached before sleeping
                if _active_runs.get(uid, {}).get("total_applied", 0) >= effective_target or idx + 1 >= len(queue):
                    break

                if res.get("apply_method") == "email":
                    delay = random.randint(
                        settings.EMAIL_APPLY_MIN_DELAY_SECONDS,
                        settings.EMAIL_APPLY_MAX_DELAY_SECONDS,
                    )
                else:
                    delay = random.randint(
                        settings.PLAYWRIGHT_APPLY_MIN_DELAY_SECONDS,
                        settings.PLAYWRIGHT_APPLY_MAX_DELAY_SECONDS,
                    )
                if stop_event.wait(timeout=delay):
                    return

            if not stop_event.is_set():
                with lock:
                    _active_runs[uid]["status"] = "completed"
                    _active_runs[uid]["completed_at"] = time.time()
                    _active_runs[uid]["current_job_title"] = None
                    _active_runs[uid]["current_job_company"] = None
                    _active_runs[uid]["current_apply_method"] = None

        except Exception as e:
            logger.error(f"Auto-apply worker error for user {uid}: {e}", exc_info=True)
            self._update_state(uid, status="error", last_error=str(e))
        finally:
            try:
                loop.close()
            except Exception:
                pass
            try:
                db.close()
            except Exception:
                pass

    def _update_state(self, uid: str, **kwargs):
        if uid in _active_runs:
            lock = _run_locks.get(uid, threading.Lock())
            with lock:
                for k, v in kwargs.items():
                    _active_runs[uid][k] = v


auto_apply_runner = AutoApplyBatchRunner()
