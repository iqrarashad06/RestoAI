@echo off
title RestoAI Launcher
echo ========================================================
echo       LAUNCHING RESTOAI FULL-STACK APPLICATION          
echo ========================================================
echo Starting Backend on http://localhost:8000 ...
start "RestoAI Backend" cmd /k "start_backend.bat"

echo Starting Frontend on http://localhost:5173 ...
start "RestoAI Frontend" cmd /k "start_frontend.bat"

echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening browser at http://localhost:5173 ...
start http://localhost:5173

echo.
echo Both servers have been launched and your browser has been opened!
echo - Frontend URL: http://localhost:5173
echo - Backend API:  http://localhost:8000/docs
echo.
pause
