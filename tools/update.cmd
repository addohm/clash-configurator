@echo off
rem Builds and tests Clash Configurator on this PC: tools\update.ps1 asks what to do.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
exit /b %ERRORLEVEL%
