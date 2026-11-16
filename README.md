# RestoAI 🍽️🤖
### AI-Powered Smart Restaurant POS & Demand Forecasting System

RestoAI is a full-stack, enterprise-grade restaurant point-of-sale (POS) and inventory management platform powered by time-series machine learning. It bridges real-time cashier order workflows with automatic recipe ingredient depletion, kitchen preparation queues, and 7-day predictive demand forecasting.

---

## 🚀 Key Features

- **⚡ Fast POS Cashier Terminal**: Dynamic menu catalog, real-time ticket construction, sales tax calculation, and instant kitchen order routing.
- **🎙️ AI Voice Ordering**: Integrated with the browser's Web Speech API (`SpeechRecognition`). Cashiers can speak dishes and quantities (e.g., *"two cheeseburgers and one cold brew"*) to automatically populate tickets.
- **🧾 Printable 80mm Thermal Receipts**: Automatic pop-up receipt modal upon checkout formatted specifically for standard 80mm thermal printers (`@media print` styling).
- **👨‍🍳 Real-time Kitchen Display System (KDS)**: Ticket lifecycle management with one-click transitions (`PENDING` → `PREPARING` → `READY` → `COMPLETED`).
- **🧠 AI Demand Forecasting Engine**: Scikit-Learn `RandomForestRegressor` and time-series model trained on 30-day POS sales history, incorporating day-of-week seasonality, weekend surges, and moving-average fallbacks.
- **📦 Recipe Bill-of-Materials (BOM)**: Automatic inventory deduction from raw stock upon order placement with immutable ledger audit logs.
- **📉 Food Spoilage Prevention**: Calculates projected ingredient depletion and estimates financial savings from reduced perishable food waste (~14% reduction in spoilage).
- **🔐 JWT Authentication & RBAC**: Role-Based Access Control protecting routes for **Admin**, **Manager**, and **Cashier**.

---

## 🛠️ Tech Stack

- **Frontend**: React.js (Vite) + Tailwind CSS + Recharts + Lucide Icons + Web Speech API
- **Backend**: Python FastAPI + Uvicorn + Pydantic v2
- **Database**: SQLite / PostgreSQL with modern SQLAlchemy 2.0 ORM
- **AI / ML**: Scikit-Learn + Pandas + NumPy + Joblib
- **Security**: PyJWT + Passlib / Bcrypt

---

## 👥 Demo Accounts (1-Click Login)

| Role | Email | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@restoai.com` | `admin123` | Full Access (POS, KDS, Inventory, Menu Pricing, AI Forecast) |
| **Manager** | `manager@restoai.com` | `manager123` | Full Access (POS, KDS, Inventory, Menu Pricing, AI Forecast) |
| **Cashier** | `cashier@restoai.com` | `cashier123` | Restricted (POS Register & Kitchen KDS only) |

---

## 📂 Project Architecture

```text
RestoAI/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── auth.py            # JWT token validation & RBAC dependencies
│   │   │   ├── database.py        # SQLAlchemy engine & session dependency
│   │   │   └── security.py        # Password hashing & JWT generation
│   │   ├── models/
│   │   │   └── models.py          # SQLAlchemy 2.0 schema (Users, MenuItems, Recipes, Orders, etc.)
│   │   └── schemas/
│   │       └── schemas.py         # Pydantic v2 request/response schemas
│   ├── main.py                    # FastAPI application & protected REST endpoints
│   ├── seed_data.py               # 30-day realistic sales & recipe seeder
│   ├── test_api.py                # End-to-end integration test suite
│   └── requirements.txt           # Python backend dependencies
├── ml_engine/
│   ├── forecasting.py             # 7-day demand forecasting & restock recommendation engine
│   ├── forecast_model.py          # Time-series feature engineering & ML model
│   └── train.py                   # Standalone model training & evaluation pipeline
├── frontend/                      # React (Vite) frontend application
│   ├── src/
│   │   ├── App.jsx                # POS, KDS, AI Forecast, Inventory, Pricing & Receipt Modal
│   │   ├── main.jsx
│   │   └── index.css              # Tailwind CSS & @media print styles
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── start_all.bat                  # 1-Click Windows launcher (starts servers & opens browser)
├── start_backend.bat              # Starts FastAPI server on port 8000
├── start_frontend.bat             # Starts Vite dev server on port 5173
├── .gitignore
└── README.md
```

---

## ⚡ Quick Start

### 1-Click Launch (Windows)
Double-click `start_all.bat` to launch both servers and automatically open the application in your browser.

---

### Manual Launch

#### 1. Backend Setup
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Seed the database with 30 days of realistic sales & recipes
python backend/seed_data.py

# Start FastAPI server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be live at: [http://localhost:8000/docs](http://localhost:8000/docs)

#### 2. Frontend Setup
```bash
cd frontend

# Install Node dependencies
npm install  # (or npm.cmd install on Windows PowerShell)

# Start Vite dev server
npm run dev  # (or npm.cmd run dev)
```
Application will be live at: [http://localhost:5173](http://localhost:5173)

---

## 🧪 Running Automated Tests

Run the automated test suite verifying all 10 JWT authentication, RBAC, and ML forecasting endpoints:
```bash
python backend/test_api.py
```

---

## 📜 License
MIT License. Built for modern restaurant operations.
