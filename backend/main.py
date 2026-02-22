from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import admin, config, feedback, orders

app = FastAPI(title="Loku Caters API", version="2.0.0")

_local_origins = [f"http://localhost:{p}" for p in range(3000, 3010)]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list({settings.frontend_url} | set(_local_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router)
app.include_router(config.router)
app.include_router(admin.router)
app.include_router(feedback.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Loku Caters API"}
