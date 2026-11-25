import asyncio
import logging
import os
from typing import Any, Dict, Optional

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    async_playwright = None
    HAS_PLAYWRIGHT = False

from src.app.core.config import settings

logger = logging.getLogger(__name__)

_BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def get_session_path(user_id: str, provider: str) -> str:
    """Return absolute path for storing a connector's Playwright session state."""
    safe_uid = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in (user_id or "default"))
    session_dir = os.path.abspath(os.path.join(settings.UPLOAD_DIR, "sessions"))
    os.makedirs(session_dir, exist_ok=True)
    return os.path.join(session_dir, f"{safe_uid}_{provider.lower()}.json")


def disconnect_session(session_path: Optional[str]) -> None:
    """Delete a persisted Playwright connector session file if present."""
    if session_path and os.path.exists(session_path):
        try:
            os.remove(session_path)
        except OSError as exc:
            logger.warning(f"Failed to delete connector session file {session_path}: {exc}")


async def _has_cookie(context, names: tuple[str, ...]) -> bool:
    cookies = await context.cookies()
    present = {c.get("name") for c in cookies if c.get("value")}
    return any(name in present for name in names)


async def _wait_for_human_interactive(context, page, cookie_names: tuple[str, ...], success_markers: tuple[str, ...], timeout_sec: int = 90) -> bool:
    """Wait passively while a human user completes their own browser sign-in or 2FA."""
    deadline = asyncio.get_running_loop().time() + timeout_sec
    while asyncio.get_running_loop().time() < deadline:
        if await _has_cookie(context, cookie_names):
            return True
        url = (page.url or "").lower()
        if any(m in url for m in success_markers):
            return True
        await asyncio.sleep(1.5)
    return False


async def _launch_browser(p, interactive: bool):
    if interactive and not (os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")):
        raise RuntimeError(
            "Browser Sign-In Window requires an active desktop display ($DISPLAY). "
            "Use email/password sign-in or run from a desktop session."
        )
    headless = False if interactive else settings.PLAYWRIGHT_HEADLESS
    return await p.chromium.launch(headless=headless, timeout=settings.PLAYWRIGHT_TIMEOUT)


async def connect_linkedin(
    user_id: str,
    email: str,
    password: str = "",
    interactive: bool = False,
) -> Dict[str, Any]:
    """Authenticate a LinkedIn session with Playwright and store browser state."""
    if not HAS_PLAYWRIGHT:
        return {
            "success": False,
            "error": "Playwright is not installed. Run `pip install playwright && playwright install chromium` first.",
        }

    session_file = get_session_path(user_id, "linkedin")
    async with async_playwright() as p:
        browser = None
        try:
            browser = await _launch_browser(p, interactive=interactive)
            context = await browser.new_context(viewport={"width": 1280, "height": 860}, user_agent=_BROWSER_UA)
            page = await context.new_page()

            await page.goto("https://www.linkedin.com/login", timeout=settings.PLAYWRIGHT_TIMEOUT, wait_until="domcontentloaded")
            await page.wait_for_timeout(1000)

            if email and await page.locator("input#username").count() > 0:
                await page.fill("input#username", email.strip())
            if password and await page.locator("input#password").count() > 0:
                await page.fill("input#password", password)

            if email and password and await page.locator("button[type='submit']").count() > 0:
                await page.click("button[type='submit']")
                await page.wait_for_timeout(3500)

            if await _has_cookie(context, ("li_at",)) or any(
                m in (page.url or "").lower() for m in ("/feed", "/jobs", "/mynetwork")
            ):
                await context.storage_state(path=session_file)
                return {"success": True, "session_path": session_file, "message": "LinkedIn authenticated and session saved."}

            body_text = (await page.inner_text("body") or "").lower()
            err_loc = page.locator("#error-for-password, #error-for-username")
            if await err_loc.count() > 0:
                err_txt = (await err_loc.first.inner_text() or "").strip()
                if err_txt and not interactive:
                    return {"success": False, "error": f"LinkedIn sign-in rejected: {err_txt}"}
            if any(k in body_text for k in ("wrong email or password", "that's not the right password", "couldn't recognize")):
                if not interactive:
                    return {"success": False, "error": "Invalid LinkedIn email or password."}

            if interactive:
                signed_in = await _wait_for_human_interactive(
                    context,
                    page,
                    cookie_names=("li_at",),
                    success_markers=("/feed", "/jobs", "/mynetwork"),
                )
                if signed_in:
                    await context.storage_state(path=session_file)
                    return {"success": True, "session_path": session_file, "message": "LinkedIn browser session saved."}
                return {"success": False, "error": "LinkedIn sign-in timed out before completing authentication."}

            return {
                "success": False,
                "error": (
                    "LinkedIn requested 2FA / security verification. "
                    "Click 'Open Browser Sign-In' to verify your account interactively."
                ),
            }
        except Exception as exc:
            logger.warning(f"LinkedIn Playwright sign-in error: {exc}")
            return {"success": False, "error": str(exc)}
        finally:
            if browser:
                await browser.close()


async def connect_indeed(
    user_id: str,
    email: str = "",
    password: str = "",
    interactive: bool = False,
) -> Dict[str, Any]:
    """Authenticate an Indeed session with Playwright and store browser state."""
    if not HAS_PLAYWRIGHT:
        return {
            "success": False,
            "error": "Playwright is not installed. Run `pip install playwright && playwright install chromium` first.",
        }

    session_file = get_session_path(user_id, "indeed")
    async with async_playwright() as p:
        browser = None
        try:
            browser = await _launch_browser(p, interactive=interactive)
            context = await browser.new_context(viewport={"width": 1280, "height": 860}, user_agent=_BROWSER_UA)
            page = await context.new_page()

            await page.goto("https://secure.indeed.com/auth", timeout=settings.PLAYWRIGHT_TIMEOUT, wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)

            body_text = (await page.inner_text("body") or "").lower()
            blocked_markers = ("verify you are human", "cloudflare", "hcaptcha", "additional verification")
            if not interactive and any(m in body_text for m in blocked_markers):
                return {
                    "success": False,
                    "error": (
                        "Indeed requested human verification before login. "
                        "Use 'Open Browser Sign-In' to complete sign-in yourself."
                    ),
                }

            email_input = page.locator("input[name='__email'], input[type='email']")
            if email and await email_input.count() > 0:
                await email_input.first.fill(email.strip())
                submit_btn = page.locator("button[type='submit']")
                if await submit_btn.count() > 0:
                    await submit_btn.first.click()
                    await page.wait_for_timeout(2500)

            pw_input = page.locator("input[type='password']")
            if password and await pw_input.count() > 0:
                await pw_input.first.fill(password)
                submit_btn = page.locator("button[type='submit']")
                if await submit_btn.count() > 0:
                    await submit_btn.first.click()
                    await page.wait_for_timeout(3000)

            if await _has_cookie(context, ("PPID", "SHOE", "SOCK")) and "secure.indeed.com/auth" not in (page.url or "").lower():
                await context.storage_state(path=session_file)
                return {"success": True, "session_path": session_file, "message": "Indeed authenticated and session saved."}

            if interactive:
                signed_in = await _wait_for_human_interactive(
                    context,
                    page,
                    cookie_names=("PPID", "SHOE", "SOCK"),
                    success_markers=("myjobs.indeed.com", "indeed.com/viewjob", "indeed.com/?"),
                )
                if signed_in:
                    await context.storage_state(path=session_file)
                    return {"success": True, "session_path": session_file, "message": "Indeed browser session saved."}
                return {"success": False, "error": "Indeed sign-in timed out before completing authentication."}

            return {
                "success": False,
                "error": (
                    "Indeed requires interactive sign-in (one-time email code, SSO, or verification). "
                    "Use 'Open Browser Sign-In' to connect your Indeed account."
                ),
            }
        except Exception as exc:
            logger.warning(f"Indeed Playwright sign-in error: {exc}")
            return {"success": False, "error": str(exc)}
        finally:
            if browser:
                await browser.close()
