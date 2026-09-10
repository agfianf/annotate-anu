"""Security utilities for JWT authentication and password hashing."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def _prepare_password(password: str) -> bytes:
    """Pre-hash password with SHA256 to handle bcrypt's 72 byte limit.

    Parameters
    ----------
    password : str
        Plain text password

    Returns
    -------
    bytes
        SHA256 hash of password (UTF-8 encoded hex string)
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("utf-8")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Parameters
    ----------
    password : str
        Plain text password

    Returns
    -------
    str
        Hashed password
    """
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(_prepare_password(password), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash.

    Parameters
    ----------
    plain_password : str
        Plain text password to verify
    hashed_password : str
        Hashed password to compare against

    Returns
    -------
    bool
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(
            _prepare_password(plain_password),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Parameters
    ----------
    data : dict
        Payload data to encode in the token
    expires_delta : timedelta, optional
        Custom expiration time, defaults to settings value

    Returns
    -------
    str
        Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def create_refresh_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token.

    Parameters
    ----------
    data : dict
        Payload data to encode in the token
    expires_delta : timedelta, optional
        Custom expiration time, defaults to settings value

    Returns
    -------
    str
        Encoded JWT refresh token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        )

    # jti keeps tokens distinct; exp alone has 1s resolution and collides on the token hash
    to_encode.update({"exp": expire, "type": "refresh", "jti": uuid.uuid4().hex})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def decode_token(token: str) -> dict | None:
    """Decode and verify a JWT token.

    Parameters
    ----------
    token : str
        JWT token to decode

    Returns
    -------
    dict | None
        Decoded token payload, or None if invalid/expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


def verify_token_type(payload: dict, expected_type: str) -> bool:
    """Verify that a token is of the expected type.

    Parameters
    ----------
    payload : dict
        Decoded token payload
    expected_type : str
        Expected token type ('access' or 'refresh')

    Returns
    -------
    bool
        True if token type matches, False otherwise
    """
    return payload.get("type") == expected_type


# A crop URL travels as a plain <img src>, so it leaks wherever URLs leak: browser history, referrer headers, proxy and access logs. Fifteen minutes is long enough for a reviewer to work through a tile grid whose URLs were all minted in one request, including tiles lazily loaded further down, and short enough that a leaked URL is dead well before anyone finds it in a log.
QC_CROP_TOKEN_TYPE = "qc_crop"
QC_CROP_TOKEN_EXPIRE_MINUTES = 15


def create_qc_crop_token(
    annotation_id: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a short-lived token granting read access to one ROI crop.

    Parameters
    ----------
    annotation_id : str
        Annotation the token is bound to; it grants access to no other crop
    expires_delta : timedelta, optional
        Custom expiration time, defaults to QC_CROP_TOKEN_EXPIRE_MINUTES

    Returns
    -------
    str
        Encoded JWT crop token
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=QC_CROP_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {
        "sub": str(annotation_id),
        "exp": expire,
        "type": QC_CROP_TOKEN_TYPE,
    }
    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_qc_crop_token(token: str, annotation_id: str) -> bool:
    """Check that a crop token is valid, unexpired and issued for this annotation.

    Parameters
    ----------
    token : str
        JWT crop token from the request
    annotation_id : str
        Annotation being requested

    Returns
    -------
    bool
        True only if signature, expiry, token type and subject all match
    """
    payload = decode_token(token)
    if not payload:
        return False

    # The type claim is what stops an access token being spent here, and a crop token being spent on the authenticated API
    if not verify_token_type(payload, QC_CROP_TOKEN_TYPE):
        return False

    return payload.get("sub") == str(annotation_id)
