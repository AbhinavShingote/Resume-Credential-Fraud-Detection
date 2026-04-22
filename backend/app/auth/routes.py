"""
Authentication HTTP endpoints.

  POST /api/v1/auth/register  → create a new user account
  POST /api/v1/auth/login     → get a JWT token
  GET  /api/v1/auth/me        → who am I (requires token)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import TokenResponse, UserLogin, UserOut, UserRegister
from .jwt_handler import create_access_token, get_current_user
from .password import hash_password, verify_password

# All routes in this file will be prefixed with /api/v1/auth
# and grouped under the "auth" tag in Swagger docs.
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """Create a new user account (open to everyone)."""
    # 1. Reject duplicate emails
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already registered")

    # 2. Hash the password (never store plain text!) and save the user
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)  # reload to get the auto-generated `id`
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Exchange email + password for a JWT access token."""
    user = db.query(User).filter(User.email == payload.email).first()

    # Generic error message — don't reveal whether email exists or password is wrong
    # (this stops attackers enumerating valid accounts)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    token = create_access_token(subject=user.id, role=user.role)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    """
    Return info about the currently logged-in user.
    Depends on `get_current_user`, so it requires a valid JWT.
    Useful for the frontend to check "am I still logged in?"
    """
    return user