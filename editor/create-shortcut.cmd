@echo off
rem Creates the editor shortcut in the project folder (see shortcut.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shortcut.ps1"
pause
