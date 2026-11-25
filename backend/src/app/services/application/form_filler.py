import os
import uuid
import logging
try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    async_playwright = None
    HAS_PLAYWRIGHT = False
from src.app.core.config import settings

logger = logging.getLogger(__name__)


class FormFillerService:
    def __init__(self):
        self.screenshot_dir = os.path.abspath(os.path.join(settings.UPLOAD_DIR, "screenshots"))
        os.makedirs(self.screenshot_dir, exist_ok=True)

    async def auto_fill_application(
        self,
        application_url: str,
        candidate_info: dict,
        resume_path: str = None,
        cover_letter_content: str = None,
        storage_state_path: str = None,
    ) -> dict:
        """
        Launch Playwright headless Chromium, open the web application form,
        fill candidate fields and upload resume, take screenshots, and submit.
        Reports failure honestly if blocked by login/CAPTCHA or if no application form/submit button exists.
        """
        logger.info(f"Launching Playwright form filler for URL: {application_url}")

        full_name = (candidate_info.get("name") or "").strip()
        name_parts = full_name.split()
        first_name = name_parts[0] if name_parts else ""
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        result = {
            "success": False,
            "screenshot_path": None,
            "error_message": None,
        }

        if not application_url:
            result["error_message"] = "No web application URL provided."
            return result

        if not HAS_PLAYWRIGHT:
            result["error_message"] = "Playwright library is not installed on the server."
            return result

        async with async_playwright() as p:
            browser = None
            try:
                browser = await p.chromium.launch(
                    headless=settings.PLAYWRIGHT_HEADLESS,
                    timeout=settings.PLAYWRIGHT_TIMEOUT,
                )
                ctx_kwargs = {"viewport": {"width": 1280, "height": 900}}
                if storage_state_path and os.path.exists(storage_state_path):
                    ctx_kwargs["storage_state"] = storage_state_path
                context = await browser.new_context(**ctx_kwargs)
                page = await context.new_page()

                await page.goto(application_url, timeout=settings.PLAYWRIGHT_TIMEOUT, wait_until="domcontentloaded")
                await page.wait_for_timeout(1500)

                page_text = (await page.inner_text("body") or "").lower()
                if any(marker in page_text for marker in ("verify you are human", "captcha", "sign in to apply", "log in to apply")):
                    screenshot_filename = f"{uuid.uuid4()}.png"
                    screenshot_path = os.path.join(self.screenshot_dir, screenshot_filename)
                    await page.screenshot(path=screenshot_path)
                    result["screenshot_path"] = f"/uploads/screenshots/{screenshot_filename}"
                    result["error_message"] = "Web portal requires login or CAPTCHA verification."
                    return result

                # Click an "Apply" trigger button first if the listing page opens a form modal/section
                apply_triggers = [
                    "a:has-text('Apply for this job')",
                    "button:has-text('Apply for this job')",
                    "a:has-text('Apply now')",
                    "button:has-text('Apply now')",
                ]
                for trig in apply_triggers:
                    elem = await page.query_selector(trig)
                    if elem:
                        try:
                            await elem.click(timeout=3000)
                            await page.wait_for_timeout(1200)
                        except Exception:
                            pass
                        break

                filled_fields = 0
                inputs = await page.query_selector_all("input")
                for inp in inputs:
                    if not await inp.is_visible():
                        continue
                    name_attr = (await inp.get_attribute("name") or "").lower()
                    id_attr = (await inp.get_attribute("id") or "").lower()
                    placeholder_attr = (await inp.get_attribute("placeholder") or "").lower()
                    type_attr = (await inp.get_attribute("type") or "").lower()
                    aria_label = (await inp.get_attribute("aria-label") or "").lower()

                    label_text = ""
                    if id_attr:
                        label_elem = await page.query_selector(f"label[for='{id_attr}']")
                        if label_elem:
                            label_text = (await label_elem.inner_text() or "").lower()

                    combined = f"{name_attr} {id_attr} {placeholder_attr} {label_text} {aria_label}"

                    if type_attr == "file" and resume_path and os.path.exists(resume_path):
                        if any(k in combined for k in ("resume", "cv", "attach")) or type_attr == "file":
                            await inp.set_input_files(resume_path)
                            filled_fields += 1
                    elif "first" in combined and "name" in combined and first_name:
                        await inp.fill(first_name)
                        filled_fields += 1
                    elif "last" in combined and "name" in combined and last_name:
                        await inp.fill(last_name)
                        filled_fields += 1
                    elif ("name" in combined or "full_name" in combined) and not ("first" in combined or "last" in combined or "company" in combined) and full_name:
                        await inp.fill(full_name)
                        filled_fields += 1
                    elif (type_attr == "email" or "email" in combined) and candidate_info.get("email"):
                        await inp.fill(candidate_info["email"])
                        filled_fields += 1
                    elif (type_attr == "tel" or "phone" in combined or "mobile" in combined) and candidate_info.get("phone"):
                        await inp.fill(candidate_info["phone"])
                        filled_fields += 1
                    elif "linkedin" in combined and candidate_info.get("linkedin"):
                        await inp.fill(candidate_info["linkedin"])
                        filled_fields += 1
                    elif "github" in combined and candidate_info.get("github"):
                        await inp.fill(candidate_info["github"])
                        filled_fields += 1
                    elif ("website" in combined or "portfolio" in combined) and candidate_info.get("portfolio"):
                        await inp.fill(candidate_info["portfolio"])
                        filled_fields += 1

                textareas = await page.query_selector_all("textarea")
                for ta in textareas:
                    if not await ta.is_visible():
                        continue
                    name_attr = (await ta.get_attribute("name") or "").lower()
                    id_attr = (await ta.get_attribute("id") or "").lower()
                    placeholder_attr = (await ta.get_attribute("placeholder") or "").lower()
                    combined = f"{name_attr} {id_attr} {placeholder_attr}"
                    if ("cover" in combined or "letter" in combined or "note" in combined or "why" in combined) and cover_letter_content:
                        await ta.fill(cover_letter_content)
                        filled_fields += 1

                screenshot_filename = f"{uuid.uuid4()}.png"
                screenshot_path = os.path.join(self.screenshot_dir, screenshot_filename)
                await page.screenshot(path=screenshot_path, full_page=False)
                result["screenshot_path"] = f"/uploads/screenshots/{screenshot_filename}"

                submit_selectors = [
                    "#submit_app",
                    "#submit-button",
                    "button[type='submit']",
                    "input[type='submit']",
                    "button:has-text('Submit Application')",
                    "button:has-text('Submit')",
                ]

                submit_btn = None
                for sel in submit_selectors:
                    candidate_btn = await page.query_selector(sel)
                    if candidate_btn and await candidate_btn.is_visible():
                        submit_btn = candidate_btn
                        break

                if not submit_btn:
                    result["success"] = False
                    result["error_message"] = (
                        f"Filled {filled_fields} field(s), but no visible submit button was detected on {application_url}."
                    )
                    return result

                if filled_fields == 0:
                    result["success"] = False
                    result["error_message"] = "No fillable application form fields found on target page."
                    return result

                await page.wait_for_timeout(800)
                await submit_btn.click()
                await page.wait_for_timeout(2500)
                await page.screenshot(path=screenshot_path, full_page=False)

                result["success"] = True
                return result

            except Exception as e:
                logger.error(f"Playwright automation failed: {e}", exc_info=True)
                result["success"] = False
                result["error_message"] = str(e)
                return result
            finally:
                if browser:
                    try:
                        await browser.close()
                    except Exception:
                        pass
