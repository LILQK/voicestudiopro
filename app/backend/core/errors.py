from __future__ import annotations


class VoiceStudioError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(VoiceStudioError):
    status_code = 400
    code = "validation_error"


class NotFoundError(VoiceStudioError):
    status_code = 404
    code = "not_found"


class RuntimeInstallError(VoiceStudioError):
    status_code = 500
    code = "runtime_install_error"


class InferenceError(VoiceStudioError):
    status_code = 500
    code = "inference_error"

