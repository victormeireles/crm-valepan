@echo off
cd /d "%~dp0"
title CRM Valepan - servidor local (porta 3000)
echo.
echo ============================================================
echo   CRM Valepan - servidor de desenvolvimento
echo   NAO FECHE esta janela enquanto usa o browser.
echo   URL: http://127.0.0.1:3000/dashboard
echo ============================================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\next\dist\bin\next" (
  echo ERRO: Dependencias em falta. Rode: npm install
  pause
  exit /b 1
)
call npm run dev
echo.
echo Servidor encerrado.
pause
