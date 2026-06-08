$ErrorActionPreference = "Stop"

npm run typecheck
npm run build
python -m PyInstaller --clean --noconfirm VoiceStudioPro.spec

Write-Host ""
Write-Host "Built: $PWD\dist\VoiceStudioPro\VoiceStudioPro.exe"
