"""
FastAPI application entry point.

Started by Docker via:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Responsibilities:
  1. Create the FastAPI app instance with OpenAPI metadata
  2. Configure CORS (so the React frontend can call us)
  3. Mount all the route modules
  4. On startup: create DB tables and seed demo data
  5. Root + health-check endpoints
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.password import hash_password
from .auth.routes import router as auth_router
from .database import Base, SessionLocal, engine
from .models import KnownCompany, User
from .routes.admin import router as admin_router
from .routes.ats import router as ats_router
from .routes.reports import router as reports_router
from .routes.resumes import router as resumes_router


# ---------------- Startup: create tables + seed demo data ----------------

def seed() -> None:
    """
    Runs once on startup. Idempotent — safe to run many times.

    Creates:
      - demo recruiter account:   recruiter@demo.com / demo1234
      - demo admin account:       admin@demo.com    / admin1234
      - 15 well-known companies for the verifier
    """
    db = SessionLocal()
    try:
        # --- Demo users ---
        if not db.query(User).filter(User.email == "recruiter@demo.com").first():
            db.add(User(
                email="recruiter@demo.com",
                name="Demo Recruiter",
                password_hash=hash_password("demo1234"),
                role="recruiter",
            ))

        if not db.query(User).filter(User.email == "admin@demo.com").first():
            db.add(User(
                email="admin@demo.com",
                name="Demo Admin",
                password_hash=hash_password("admin1234"),
                role="admin",
            ))

        # --- Known companies (for REQ-19 verification) ---
        companies = [
            # Tech giants
            ("Google", "google.com"),
            ("Microsoft", "microsoft.com"),
            ("Amazon", "amazon.com"),
            ("Meta", "meta.com"),
            ("Apple", "apple.com"),
            ("Netflix", "netflix.com"),
            ("Cisco", "cisco.com"),
            ("IBM", "ibm.com"),
            ("Oracle", "oracle.com"),
            ("Intel", "intel.com"),
            ("NVIDIA", "nvidia.com"),
            ("Salesforce", "salesforce.com"),
            ("Adobe", "adobe.com"),
            ("SAP", "sap.com"),
            # Indian IT services
            ("Tata Consultancy Services", "tcs.com"),
            ("Infosys", "infosys.com"),
            ("Wipro", "wipro.com"),
            ("Accenture", "accenture.com"),
            ("HCL Technologies", "hcltech.com"),
            ("Tech Mahindra", "techmahindra.com"),
            ("Cognizant", "cognizant.com"),
            ("Capgemini", "capgemini.com"),
            ("L&T Infotech", "lntinfotech.com"),
            ("Mindtree", "mindtree.com"),
            # Indian product companies + unicorns
            ("Flipkart", "flipkart.com"),
            ("Zomato", "zomato.com"),
            ("Swiggy", "swiggy.com"),
            ("Paytm", "paytm.com"),
            ("Razorpay", "razorpay.com"),
            ("PhonePe", "phonepe.com"),
            ("Byju's", "byjus.com"),
            ("Ola", "olacabs.com"),
            ("Myntra", "myntra.com"),
            ("Zoho", "zoho.com"),
            ("Freshworks", "freshworks.com"),
            # Educational / internship platforms
            ("SmartBridge", "smartbridge.in"),
            ("Internshala", "internshala.com"),
            ("Coursera", "coursera.org"),
            ("Udemy", "udemy.com"),
            # MIT Academy of Engineering (your college — legit affiliation)
            ("MIT Academy of Engineering", "mitaoe.ac.in"),
            ("MIT World Peace University", "mitwpu.edu.in"),
        ]
        for name, domain in companies:
            if not db.query(KnownCompany).filter(KnownCompany.name == name).first():
                db.add(KnownCompany(name=name, domain=domain))

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Startup + shutdown hooks (modern FastAPI pattern).
    Creates the tables (if missing), then seeds demo data.
    """
    Base.metadata.create_all(bind=engine)
    seed()
    yield
    # (nothing to do on shutdown)


# ---------------- App instance ----------------

app = FastAPI(
    title="VisiVerify — Resume & Credential Fraud Detection Platform",
    description=(
        "AI-powered fraud detection for resumes and credentials. "
        "Built as an academic mini-project at MIT Academy of Engineering."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------- CORS ----------------
# The React frontend runs on localhost:5173 during development.
# Without this, browsers block its fetch() calls to :8000.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- Mount route modules ----------------

app.include_router(auth_router)
app.include_router(resumes_router)
app.include_router(reports_router)
app.include_router(ats_router)
app.include_router(admin_router)


# ---------------- Root & health ----------------

@app.get("/")
def root():
    """Basic 'are we alive' endpoint — hit this to confirm the server is up."""
    return {
        "service": "VisiVerify Backend",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
    }


@app.get("/health")
def health():
    """Docker healthcheck target."""
    return {"status": "ok"}