# VoiceStudio Pro

Local-first desktop studio for long-form voice production with QwenTTS.

This repository is the production rewrite of the original VoiceStudio MVP. The new app is Python-first: the desktop shell opens a local React UI, FastAPI owns the application API, and QwenTTS is called from Python directly instead of proxying the demo Gradio/webview API.

## Goals

- Lightweight local app shell.
- Integrated Python backend.
- First-run runtime installer for Torch and QwenTTS.
- Torch wheel selected by hardware and driver compatibility.
- Production-grade project, voice, generation, timeline, and export workflows.
- Keep the useful MVP behavior without carrying the MVP architecture forward.

## Stack

| Layer | Choice |
| --- | --- |
| Desktop shell | pywebview |
| Backend | FastAPI + Uvicorn |
| Frontend | React + Vite + TypeScript |
| State | Zustand |
| Icons | lucide-react |
| Packaging target | PyInstaller/Nuitka + Inno Setup |
| Runtime cache | `%LOCALAPPDATA%\VoiceStudioPro` |

## Development

Install frontend dependencies:

```powershell
npm install
```

Install backend dependencies:

```powershell
python -m pip install -e .
```

Run backend:

```powershell
python -m app.backend.main
```

Run frontend:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`.

## Desktop Mode

After building the frontend:

```powershell
npm run build
python -m app.desktop.main
```

## Runtime Strategy

The packaged app should stay small. Heavy ML dependencies are installed on first run into:

```text
%LOCALAPPDATA%\VoiceStudioPro\runtime
```

Torch is selected by hardware compatibility. If NVIDIA/CUDA is unavailable or unsupported, the installer falls back to CPU mode with a clear status in the onboarding UI.

