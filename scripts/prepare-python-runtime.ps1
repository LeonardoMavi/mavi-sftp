$ErrorActionPreference = 'Stop'

$pythonVersion = '3.12.10'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'build\python-runtime'
$pythonExe = Join-Path $runtimeDir 'python.exe'

if (Test-Path -LiteralPath $pythonExe) {
    Write-Host "Runtime Python ja preparado em $runtimeDir"
    exit 0
}

$archiveName = "python-$pythonVersion-embed-amd64.zip"
$downloadUrl = "https://www.python.org/ftp/python/$pythonVersion/$archiveName"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName

Write-Host "Baixando Python portatil $pythonVersion..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir -Force
Remove-Item -LiteralPath $archivePath -Force

if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw 'O runtime Python nao foi extraido corretamente.'
}

Write-Host "Runtime Python preparado em $runtimeDir"
