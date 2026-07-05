@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%svm.ps1"

net session >nul 2>&1
if errorlevel 1 (
    echo Requesting Administrator privileges...
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "SVM_ARGS=%*"
if "%SVM_ARGS%"=="" set "SVM_ARGS=-Repair"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %SVM_ARGS%
exit /b %ERRORLEVEL%
