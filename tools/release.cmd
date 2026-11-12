@echo off
rem Makes a release of Clash Configurator on this PC: tools\release.ps1 asks what to do.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0release.ps1"
exit /b %ERRORLEVEL%
