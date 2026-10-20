@echo off
rem Zomba - servidor em um clique: de dois cliques neste arquivo.
title Zomba - servidor
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Instale a versao LTS em https://nodejs.org e de dois cliques aqui de novo.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0iniciar.mjs" %*
if errorlevel 1 pause
