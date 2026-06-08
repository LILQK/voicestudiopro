# Packaging Notes

Recommended production packaging:

1. `npm run build`
2. Build the Python app with PyInstaller or Nuitka.
3. Bundle only the lightweight app dependencies.
4. Do not bundle Torch, QwenTTS, or model weights.
5. Use Inno Setup to install `VoiceStudioPro.exe`.

Heavy runtime files are downloaded into `%LOCALAPPDATA%\VoiceStudioPro\runtime` during onboarding.

