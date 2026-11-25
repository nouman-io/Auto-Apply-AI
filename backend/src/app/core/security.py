from fastapi import Depends
from sqlalchemy.orm import Session
from src.app.db.database import get_db
from src.app.db.models import User

DEFAULT_WORKSPACE_USER_ID = "workspace-default"
DEFAULT_WORKSPACE_EMAIL = "workspace@autoapply.local"


async def get_current_user(db: Session = Depends(get_db)) -> User:
    """Resolve the active local workspace user without requiring authentication."""
    user = db.query(User).filter(User.id == DEFAULT_WORKSPACE_USER_ID).first()
    if not user:
        user = db.query(User).first()
    if not user:
        user = User(
            id=DEFAULT_WORKSPACE_USER_ID,
            email=DEFAULT_WORKSPACE_EMAIL,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
