"""Agora HTTP Server — FastAPI application factory."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .logging_utils import configure_server_logging
from .routes import create_router


def create_app(db_path: str = "tasks.db", config_path: str | None = None) -> FastAPI:
    configure_server_logging()
    app = FastAPI(title="Agora", description="Multi-Agent Democratic Orchestration API")
    router = create_router(db_path=db_path, config_path=config_path)
    app.include_router(router, prefix="/api")

    dashboard_dir = Path(__file__).resolve().parents[2] / "dashboard"
    if dashboard_dir.exists():
        app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")

    return app
