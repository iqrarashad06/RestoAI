@echo off
title RestoAI FastAPI Backend (Port 8000)
echo ========================================================
echo       STARTING RESTOAI FASTAPI BACKEND ON PORT 8000      
echo ========================================================
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
