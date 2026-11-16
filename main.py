"""
Root entry point forwarding to backend.main:app
Allows running `uvicorn main:app --reload --port 8000` from repository root.
"""
from backend.main import app

__all__ = ["app"]
