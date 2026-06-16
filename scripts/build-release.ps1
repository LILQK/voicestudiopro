param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"
$portableDir = Join-Path $distDir "VoiceStudioPro"
$releaseDir = Join-Path $distDir "release"
$portableStageDir = Join-Path $releaseDir "portable-stage"
$portableRootDir = Join-Path $portableStageDir "VoiceStudioPro"
$portableZip = Join-Path $releaseDir "VoiceStudioPro-$Version-win64-portable.zip"
$installerBaseName = "VoiceStudioPro-$Version-win64-setup"
$installerPath = Join-Path $releaseDir "$installerBaseName.exe"
$checksumPath = Join-Path $releaseDir "SHA256SUMS.txt"
$isccPath = Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"

Push-Location $root
try {
    npm run build:desktop

    if (-not (Test-Path $portableDir)) {
        throw "Portable build folder not found at '$portableDir'."
    }

    if (Test-Path $releaseDir) {
        Remove-Item $releaseDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $portableRootDir -Force | Out-Null
    Copy-Item -Path (Join-Path $portableDir "*") -Destination $portableRootDir -Recurse -Force

    Compress-Archive -Path $portableRootDir -DestinationPath $portableZip -CompressionLevel Optimal
    Remove-Item $portableStageDir -Recurse -Force

    if (-not (Test-Path $isccPath)) {
        throw "Inno Setup was not found at '$isccPath'. Install Inno Setup 6 before building release artifacts."
    }

    & $isccPath `
        "/DAppVersion=$Version" `
        "/DReleaseDir=$releaseDir" `
        "/DOutputBaseFilename=$installerBaseName" `
        (Join-Path $root "installer\VoiceStudioPro.iss")

    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed with exit code $LASTEXITCODE."
    }

    $checksumLines = @()
    foreach ($artifact in @($portableZip, $installerPath)) {
        if (-not (Test-Path $artifact)) {
            throw "Expected artifact '$artifact' was not created."
        }

        $hash = (Get-FileHash -Path $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
        $fileName = [System.IO.Path]::GetFileName($artifact)
        $checksumLines += "$hash *$fileName"
    }

    Set-Content -Path $checksumPath -Value $checksumLines

    Write-Host ""
    Write-Host "Release artifacts:"
    Write-Host "  Portable ZIP: $portableZip"
    Write-Host "  Installer EXE: $installerPath"
    Write-Host "  Checksums:     $checksumPath"
}
finally {
    Pop-Location
}
