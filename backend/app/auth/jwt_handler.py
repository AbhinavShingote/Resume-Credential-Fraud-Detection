"""
JWT token creation + FastAPI dependencies for authentication and RBAC.

How it works:
  1. User logs in with email/password → we issue a JWT signed with JWT_SECRET.
  2. Frontend sends this token in the `Authorization: Bearer <token>` header
     on every protected request.
  3. `get_current_user` decodes the token and loads the user from DB.
  4. `require_role("admin")` wraps `get_current_user` and checks role.
"""
from datetime import datetime, timedelta
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User

# This tells FastAPI where the token-issuing endpoint lives.
# It also makes the Swagger UI show a nice "Authorize" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=True)


def create_access_token(subject: str | int, role: str) -> str:
    """
    Issue a signed JWT for a logged-in user.

    Payload:
      sub  = user id (who)
      role = their role (what they can do)
      exp  = expiry timestamp (when it stops working)
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Verify and decode a JWT. Raises 401 if it's invalid, expired, or tampered."""
    try:
        return jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that returns the logged-in user.
    Use it in any route that needs authentication:

        @router.get("/me")
        def me(user: User = Depends(get_current_user)):
            return user
    """
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory enforcing role-based access control (RBAC).

    Usage:
        @router.get("/admin/users", dependencies=[Depends(require_role("admin"))])
        def list_users(): ...

    Returns 403 Forbidden if the user's role isn't in the allowed list.
    """
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of these roles: {allowed_roles}",
            )
        return user
    return _check