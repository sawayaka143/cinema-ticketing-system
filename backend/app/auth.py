"""Supabase login check.

The frontend signs users in with Supabase Auth and sends the access token as
`Authorization: Bearer <token>`. We verify it with the project's public signing keys (JWKS).
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    base = get_settings().supabase_url.rstrip("/")
    return jwt.PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser:
    if creds is None:
        raise _unauthorized("Not logged in")
    try:
        key = _jwks_client().get_signing_key_from_jwt(creds.credentials)
        claims = jwt.decode(
            creds.credentials,
            key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid or expired token") from exc
    return CurrentUser(id=UUID(claims["sub"]), email=claims.get("email"))


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
