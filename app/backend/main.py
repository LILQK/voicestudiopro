from __future__ import annotations

import uvicorn

from app.backend.app_factory import create_app
from app.backend.core.config import settings
from app.backend.core.logging import configure_logging


app = create_app()


def main() -> None:
    configure_logging()
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()

