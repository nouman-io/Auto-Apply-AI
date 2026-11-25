import logging
from typing import Optional
from sqlalchemy.orm import Session
from src.app.db.models import Notification

logger = logging.getLogger(__name__)


class NotificationService:
    """Persist and manage in-app real-time notifications for user actions."""

    @staticmethod
    def create_notification(
        db: Session,
        user_id: str,
        title: str,
        message: str,
        notification_type: str = "info",
        apply_method: Optional[str] = None,
        application_id: Optional[int] = None,
        job_url: Optional[str] = None,
    ) -> Optional[Notification]:
        try:
            record = Notification(
                user_id=user_id,
                application_id=application_id,
                title=title,
                message=message,
                type=notification_type,
                apply_method=apply_method,
                job_url=job_url,
                is_read=False,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to persist notification for user {user_id}: {e}")
            return None
