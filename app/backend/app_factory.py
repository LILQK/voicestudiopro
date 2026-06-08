from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.backend.api import audio_routes, export_routes, generation_routes, project_routes, qwen_compat_routes, runtime_routes, voice_routes
from app.backend.core.config import settings
from app.backend.core.errors import VoiceStudioError
from app.backend.core.paths import frontend_dist_dir


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_title)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(VoiceStudioError)
    async def handle_voice_studio_error(_request: Request, error: VoiceStudioError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "details": error.details,
                }
            },
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"ok": "true", "service": "voicestudio-pro"}

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> FileResponse:
        return FileResponse(frontend_dist_dir() / "favicon.svg", media_type="image/svg+xml")

    app.include_router(runtime_routes.router)
    app.include_router(qwen_compat_routes.router)
    app.include_router(project_routes.router)
    app.include_router(voice_routes.router)
    app.include_router(generation_routes.router)
    app.include_router(audio_routes.router)
    app.include_router(export_routes.router)

    dist = frontend_dist_dir()
    if dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    return app
