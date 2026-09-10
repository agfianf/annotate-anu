"""S3 / MinIO access for QC workflows.

Secrets are encrypted with SECRET_KEY before they reach the database, and the
QC manifest is written back as an object rather than moving any source data.
"""

import base64
import hashlib
import json
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.helpers.logger import logger

IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def _fernet() -> Fernet:
    """Derive a stable Fernet key from SECRET_KEY."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        raise ValueError("Stored credential could not be decrypted; re-enter it")


class S3Service:
    """Thin wrapper over boto3 for one storage connection."""

    def __init__(self, connection: dict):
        self.bucket = connection["bucket"]
        self.prefix = (connection.get("prefix") or "").strip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=connection.get("endpoint_url") or None,
            region_name=connection.get("region") or "us-east-1",
            aws_access_key_id=connection["access_key"],
            aws_secret_access_key=decrypt_secret(connection["secret_key"]),
            use_ssl=connection.get("use_ssl", True),
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    def _full_key(self, key: str) -> str:
        key = key.lstrip("/")
        return f"{self.prefix}/{key}" if self.prefix else key

    def check(self) -> tuple[bool, str]:
        """Confirm the bucket is reachable with these credentials."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True, "Bucket reachable"
        except ClientError as exc:
            return False, f"{exc.response.get('Error', {}).get('Code', 'Error')}: {exc}"
        except BotoCoreError as exc:
            return False, str(exc)

    def list_prefixes(self, under: str = "") -> list[str]:
        """Immediate sub-prefixes, i.e. the folder-like batches in the bucket."""
        base = self._full_key(under)
        if base and not base.endswith("/"):
            base += "/"
        paginator = self.client.get_paginator("list_objects_v2")
        prefixes = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=base, Delimiter="/"):
            for item in page.get("CommonPrefixes", []):
                prefixes.append(item["Prefix"])
        return prefixes

    def list_objects(self, under: str = "", suffixes: tuple[str, ...] | None = None, limit: int = 1000) -> list[dict]:
        """Objects beneath a prefix, optionally filtered by suffix."""
        base = self._full_key(under)
        paginator = self.client.get_paginator("list_objects_v2")
        out: list[dict] = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=base):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith("/"):
                    continue
                if suffixes and not key.lower().endswith(suffixes):
                    continue
                out.append({"key": key, "size": obj["Size"], "last_modified": obj["LastModified"].isoformat()})
                if len(out) >= limit:
                    return out
        return out

    def get_object_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def put_json(self, key: str, payload: Any) -> str:
        """Write a JSON object; used for the QC manifest."""
        full_key = self._full_key(key)
        body = json.dumps(payload, indent=2, default=str).encode()
        self.client.put_object(
            Bucket=self.bucket, Key=full_key, Body=body, ContentType="application/json"
        )
        logger.info(f"Wrote {len(body)} bytes to s3://{self.bucket}/{full_key}")
        return full_key

    def presigned_url(self, key: str, expires: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires
        )
