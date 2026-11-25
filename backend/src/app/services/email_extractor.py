import re
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

EMAIL_REGEX = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
HIRING_KEYWORDS = ["hr", "careers", "jobs", "hiring", "talent", "recruiting", "apply", "people"]
IGNORED_DOMAINS = (
    "example.com", "domain.com", "schema.org", "w3.org", "sentry.io",
    "linkedin.com", "indeed.com", "greenhouse.io", "google.com", "wixpress.com"
)
IGNORED_LOCAL_PREFIXES = ("noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "privacy", "legal")
IGNORED_TLDS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js")


def extract_emails_from_text(text: str) -> List[str]:
    """Find unique authentic email addresses inside job descriptions or HTML."""
    if not text:
        return []

    matches = re.findall(EMAIL_REGEX, text)
    unique_emails = []
    for email in matches:
        clean_email = email.lower().strip(".")
        if "@" not in clean_email:
            continue
        local_part, domain = clean_email.split("@", 1)
        if any(clean_email.endswith(ext) for ext in IGNORED_TLDS):
            continue
        if any(bad in domain for bad in IGNORED_DOMAINS):
            continue
        if any(local_part.startswith(prefix) for prefix in IGNORED_LOCAL_PREFIXES):
            continue
        if clean_email not in unique_emails:
            unique_emails.append(clean_email)

    return unique_emails


def select_best_hiring_email(emails: List[str], company_name: Optional[str] = None) -> Optional[str]:
    """Select the most probable authentic HR/recruiting email from extracted emails."""
    if not emails:
        return None

    for email in emails:
        local = email.split("@", 1)[0]
        if any(kw in local for kw in HIRING_KEYWORDS):
            return email

    if company_name:
        clean_company = re.sub(r"[^a-zA-Z0-9]", "", company_name.lower())
        if len(clean_company) >= 3:
            for email in emails:
                domain = email.split("@", 1)[-1]
                if clean_company in domain:
                    return email

    return emails[0]
