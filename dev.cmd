@echo off
REM Se no PowerShell "npm run dev" der erro de ExecutionPolicy (npm.ps1),
REM use: npm.cmd run dev   OU   este arquivo: dev.cmd
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\npm.cmd" (
  "%ProgramFiles%\nodejs\npm.cmd" run dev
) else (
  echo Node.js nao encontrado em "%ProgramFiles%\nodejs".
  echo Instale de https://nodejs.org ou adicione npm ao PATH.
  exit /b 1
)
