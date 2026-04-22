@echo off
REM Sobe o Next sem usar npm (evita erro de ExecutionPolicy do npm.ps1 no PowerShell).
cd /d "%~dp0"
if not exist "%ProgramFiles%\nodejs\node.exe" (
  echo Node nao encontrado em "%ProgramFiles%\nodejs".
  exit /b 1
)
"%ProgramFiles%\nodejs\node.exe" scripts/sync-env.cjs
"%ProgramFiles%\nodejs\node.exe" scripts/run-in-app.cjs dev --turbopack
