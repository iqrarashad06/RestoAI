@echo off
title RestoAI Vite Frontend (Port 5173)
echo ========================================================
echo       STARTING RESTOAI VITE FRONTEND ON PORT 5173       
echo ========================================================
cd frontend
call npm.cmd run dev -- --host
pause
