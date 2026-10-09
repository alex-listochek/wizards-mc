@echo off
chcp 65001 >nul
title Редактор Wizards
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Не найден Node.js. Установите его с https://nodejs.org — версию LTS, 22 или новее.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%v in ('node -v') do if %%v LSS 20 (
  echo Установлен слишком старый Node.js. Нужна версия 22 или новее: https://nodejs.org
  pause
  exit /b 1
)

rem Редактор уже запущен — просто открываем его в браузере.
curl -s -o nul -m 2 http://localhost:5174/ && (
  start "" http://localhost:5174/
  exit /b
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости редактора...
  call npm install || (pause & exit /b 1)
)

echo Редактор откроется в браузере: http://localhost:5174
echo Чтобы остановить редактор, закройте это окно.
echo.
call npm run dev
if errorlevel 1 pause
