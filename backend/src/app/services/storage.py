import os
import uuid
import logging
from abc import ABC, abstractmethod
from src.app.core.config import settings

logger = logging.getLogger(__name__)


class StorageProvider(ABC):
    @abstractmethod
    def upload(self, file_content: bytes, filename: str) -> str:
        """Uploads a file and returns its accessible URL."""
        pass


class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = None):
        configured = upload_dir or settings.UPLOAD_DIR or "uploads"
        self.upload_dir = os.path.abspath(configured)
        os.makedirs(self.upload_dir, exist_ok=True)

    def upload(self, file_content: bytes, filename: str) -> str:
        file_ext = os.path.splitext(filename)[1].lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        filepath = os.path.join(self.upload_dir, unique_filename)

        with open(filepath, "wb") as f:
            f.write(file_content)

        logger.info(f"File uploaded locally to {filepath}")
        return f"/uploads/{unique_filename}"


def get_storage_provider() -> StorageProvider:
    return LocalStorageProvider()


storage_service = get_storage_provider()
