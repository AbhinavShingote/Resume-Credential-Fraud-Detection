"""Central settings loaded from environment variables (.env or Docker env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=False, extra="ignore"
    )

    # --- Database ---
    DATABASE_URL: str = "postgresql://fraud_user:fraud_pass@localhost:5432/fraud_detection"

    # --- JWT authentication ---
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # --- File uploads ---
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 5
    ALLOWED_EXTS: set[str] = {".pdf", ".docx"}

    # --- Risk score thresholds ---
    RISK_LOW_MAX: int = 39    # score 0-39  → low risk
    RISK_MED_MAX: int = 69    # score 40-69 → medium; 70-100 → high


settings = Settings()