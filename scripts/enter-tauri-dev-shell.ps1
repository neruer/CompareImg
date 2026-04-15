$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$cargoHome = Join-Path $projectRoot ".cargo-local"
$rustupHome = Join-Path $projectRoot ".rustup-local"

New-Item -ItemType Directory -Force -Path $cargoHome, $rustupHome | Out-Null

$env:CARGO_HOME = $cargoHome
$env:RUSTUP_HOME = $rustupHome
$env:Path = "$cargoHome\bin;C:\Program Files\nodejs;$env:Path"

Write-Host "Tauri local dev shell is ready." -ForegroundColor Green
Write-Host "CARGO_HOME=$env:CARGO_HOME"
Write-Host "RUSTUP_HOME=$env:RUSTUP_HOME"
Write-Host ""
Write-Host "Versions:"
& "$cargoHome\bin\rustc.exe" -V
& "$cargoHome\bin\cargo.exe" -V
cmd /c npm -v
node -v
