@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/start-local.mjs --no-open %*
if errorlevel 1 pause
