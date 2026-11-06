@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM QamqorMap: қорғауға арналған демо режим (бөлек qamqormap_demo дерекқоры, демо-кіру қосулы)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-windows.ps1" -Demo
echo.
pause
