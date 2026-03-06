"""Agora HTTP Server — FastAPI application factory."""
from fastapi import FastAPI

from .routes import create_router


def create_app(db_path: str = "tasks.db", config_path: str | None = None) -> FastAPI:
    app = FastAPI(title="Agora", description="Multi-Agent Democratic Orchestration API")
    router = create_router(db_path=db_path, config_path=config_path)
    app.include_router(router, prefix="/api")
    return app
