"""
Password hashing utilities using bcrypt.

Why bcrypt:
  - Stores a one-way hash, not the password itself
  - Automatically salts each hash (so identical passwords get different hashes)
  - Deliberately slow → resistant to brute-force attacks
"""
from passlib.context import CryptContext

# Passlib picks the best bcrypt implementation available.
# `deprecated="auto"` lets us migrate to a newer algorithm in the future
# without breaking existing hashes.
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """
    Turn a plain password into a bcrypt hash.
    Call this when registering a new user.
    """
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Check a login attempt: does `plain` match the stored `hashed`?
    Returns True on match, False on mismatch OR on any error
    (e.g. corrupted hash in DB).
    """
    try:
        return _pwd.verify(plain, hashed)
    except Exception:
        return False