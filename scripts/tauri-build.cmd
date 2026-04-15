@echo off
setlocal

set "ROOT=%~dp0.."
set "CARGO_HOME=%ROOT%\.cargo-local"
set "RUSTUP_HOME=%ROOT%\.rustup-local"
set "PATH=%CARGO_HOME%\bin;C:\Program Files\nodejs;%PATH%"
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe"

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
cd /d "%ROOT%"
call npm run tauri:build %*

