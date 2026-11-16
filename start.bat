@echo off
chcp 65001 >nul
title Backrooms - сервер
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Скачайте и установите его: https://nodejs.org  ^(версия LTS^)
  echo Потом запустите этот файл ещё раз.
  pause
  exit /b
)
cd /d "%~dp0"
start "" http://localhost:3000
node server.js
pause
