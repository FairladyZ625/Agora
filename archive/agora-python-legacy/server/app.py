"""Agora HTTP Server — FastAPI application factory."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .logging_utils import configure_server_logging
from .routes import create_router


def _resolve_dashboard_dir(project_root: Path | None = None) -> Path | None:
    root = project_root or Path(__file__).resolve().parents[2]
    dashboard_root = root / "dashboard"
    dist_dir = dashboard_root / "dist"
    if dist_dir.exists():
        return dist_dir
    if dashboard_root.exists():
        return dashboard_root
    return None


def create_app(db_path: str = "tasks.db", config_path: str | None = None) -> FastAPI:
    configure_server_logging()
    app = FastAPI(title="Agora", description="Multi-Agent Democratic Orchestration API")
    router = create_router(db_path=db_path, config_path=config_path)
    app.include_router(router, prefix="/api")

    dashboard_dir = _resolve_dashboard_dir()
    if dashboard_dir is not None:
        if dashboard_dir.name == "dist":
            assets_dir = dashboard_dir / "assets"
            if assets_dir.exists():
                app.mount(
                    "/dashboard/assets",
                    StaticFiles(directory=str(assets_dir), html=False),
                    name="dashboard-assets",
                )

            @app.get("/dashboard", include_in_schema=False)
            @app.get("/dashboard/", include_in_schema=False)
            @app.get("/dashboard/{full_path:path}", include_in_schema=False)
            async def dashboard_shell(full_path: str = ""):
                requested = (dashboard_dir / full_path).resolve() if full_path else dashboard_dir / "index.html"
                if (
                    full_path
                    and requested.is_file()
                    and requested.exists()
                    and dashboard_dir.resolve() in requested.parents
                ):
                    return FileResponse(requested)
                return FileResponse(dashboard_dir / "index.html")
        else:
            app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")

    return app
