"""
RestoAI - Smart Restaurant POS & Demand Forecasting API
Main Application: backend/main.py with JWT Authentication & RBAC
"""

import os
import sys
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from decimal import Decimal
from pydantic import BaseModel, Field, EmailStr

# Ensure project root & backend are available in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
for p in [CURRENT_DIR, PARENT_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.core.database import get_db, engine, Base, SessionLocal
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.core.auth import get_current_user, require_roles
from backend.app.models.models import (
    User,
    UserRole,
    MenuItem,
    ItemCategory,
    InventoryItem,
    InventoryCategory,
    InventoryUnit,
    Recipe,
    Order,
    OrderItem,
    OrderType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    DemandForecast,
    InventoryLog,
    InventoryTransactionType,
)
from backend.seed_data import seed_database
from ml_engine.forecasting import RestaurantDemandForecaster

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RestoAI – Smart Restaurant POS & Demand Forecasting API",
    version="1.1.0",
    description="Backend services protected with JWT Authentication & Role-Based Access Control (Admin, Manager, Cashier).",
)

# Enable CORS for all origins (specifically supporting Vite frontend at http://localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# Pydantic Schemas for Requests & Responses
# =====================================================================

class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfileSchema(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileSchema


class MenuItemSchema(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str] = None
    category: str
    price: float
    cost_price: float
    is_available: bool
    image_url: Optional[str] = None
    preparation_time_minutes: int

    class Config:
        from_attributes = True


class MenuItemUpdatePriceSchema(BaseModel):
    price: float = Field(gt=0, description="New sales price")
    is_available: Optional[bool] = None


class InventoryItemSchema(BaseModel):
    id: int
    name: str
    sku: str
    category: str
    current_stock: float
    unit: str
    minimum_threshold: float
    cost_per_unit: float
    is_low_stock: bool
    low_stock: bool
    last_restocked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderItemCreateSchema(BaseModel):
    menu_item_id: int
    quantity: int = Field(gt=0, default=1)
    notes: Optional[str] = None


class OrderItemSchema(BaseModel):
    id: int
    menu_item_id: int
    menu_item_name: Optional[str] = None
    quantity: int
    unit_price: float
    subtotal: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class OrderCreateSchema(BaseModel):
    customer_name: Optional[str] = "Guest"
    table_number: Optional[int] = None
    order_type: str = "DINE_IN"
    payment_method: str = "CASH"
    discount_amount: float = 0.0
    items: List[OrderItemCreateSchema]


class OrderUpdateStatusSchema(BaseModel):
    status: str  # PENDING, PREPARING, READY, COMPLETED, CANCELLED


class OrderSchema(BaseModel):
    id: int
    order_number: str
    customer_name: Optional[str] = None
    table_number: Optional[int] = None
    order_type: str
    status: str
    payment_method: str
    payment_status: str
    subtotal: float
    tax_amount: float
    discount_amount: float
    total_amount: float
    created_at: datetime
    items: List[OrderItemSchema] = []

    class Config:
        from_attributes = True


# =====================================================================
# Startup Hook: Seed DB if empty
# =====================================================================

@app.on_event("startup")
def startup_event():
    """Checks if the database has menu items; seeds initial 30-day realistic data if empty."""
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        menu_count = db.query(MenuItem).count()
        # Also ensure our demo accounts exist
        admin_user = db.query(User).filter(User.email == "admin@restoai.com").first()
        if user_count == 0 or menu_count == 0 or not admin_user:
            print("[RestoAI] Empty or incomplete database detected. Running seed script...")
            seed_database()
        else:
            print(f"[RestoAI] Database ready ({menu_count} menu items, {user_count} users).")
    except Exception as e:
        print(f"[RestoAI Startup Warning]: {e}")
    finally:
        db.close()


# =====================================================================
# Public Endpoints: Health & Authentication
# =====================================================================

@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "app": "RestoAI – AI-Powered Smart Restaurant POS & Demand Forecasting",
        "version": "1.1.0",
        "docs_url": "/docs",
        "auth": "JWT + RBAC Enabled",
    }


@app.post("/api/auth/login", response_model=LoginResponse, tags=["Authentication"])
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates users (Admin, Manager, Cashier) and returns a signed JWT token with their role.
    Demo Credentials:
    - Admin:   admin@restoai.com   / admin123
    - Manager: manager@restoai.com / manager123
    - Cashier: cashier@restoai.com / cashier123
    """
    email_or_user = credentials.email.strip().lower()
    user = (
        db.query(User)
        .filter((User.email == email_or_user) | (User.username == email_or_user))
        .first()
    )

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your user account has been deactivated.",
        )

    role_str = user.role.value if hasattr(user.role, "value") else str(user.role)

    # Generate JWT token
    token_claims = {
        "sub": str(user.id),
        "email": user.email,
        "username": user.username,
        "role": role_str,
        "full_name": user.full_name,
    }
    access_token = create_access_token(data=token_claims)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": role_str,
            "is_active": user.is_active,
        },
    }


@app.get("/api/auth/me", response_model=UserProfileSchema, tags=["Authentication"])
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Returns profile and role of the currently authenticated user."""
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": role_str,
        "is_active": current_user.is_active,
    }


# =====================================================================
# 1. GET /api/menu — Authenticated (Admin, Manager, Cashier)
#    PATCH /api/menu/{id}/price — Restricted to Admin & Manager
# =====================================================================

@app.get("/api/menu", response_model=List[MenuItemSchema], tags=["Menu"])
def get_menu(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all menu items for POS register or management catalog (Authenticated)."""
    items = db.query(MenuItem).order_by(MenuItem.category, MenuItem.name).all()
    output = []
    for it in items:
        output.append({
            "id": it.id,
            "name": it.name,
            "code": it.code,
            "description": it.description,
            "category": it.category.value if hasattr(it.category, "value") else str(it.category),
            "price": float(it.price),
            "cost_price": float(it.cost_price),
            "is_available": it.is_available,
            "image_url": it.image_url,
            "preparation_time_minutes": it.preparation_time_minutes,
        })
    return output


@app.patch("/api/menu/{item_id}", response_model=MenuItemSchema, tags=["Menu"])
def update_menu_item_price(
    item_id: int,
    price_update: MenuItemUpdatePriceSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager: Update dish sales price or availability.
    Cashiers will receive 403 Forbidden.
    """
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Menu item with ID {item_id} not found.")

    item.price = Decimal(str(price_update.price))
    if price_update.is_available is not None:
        item.is_available = price_update.is_available
    item.updated_at = datetime.now()

    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "name": item.name,
        "code": item.code,
        "description": item.description,
        "category": item.category.value if hasattr(item.category, "value") else str(item.category),
        "price": float(item.price),
        "cost_price": float(item.cost_price),
        "is_available": item.is_available,
        "image_url": item.image_url,
        "preparation_time_minutes": item.preparation_time_minutes,
    }


# =====================================================================
# 2. GET /api/inventory — Restricted to Admin & Manager (RBAC)
# =====================================================================

@app.get("/api/inventory", response_model=List[InventoryItemSchema], tags=["Inventory"])
def get_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager:
    Fetch raw inventory items with real-time stock levels and low-stock warning flags.
    Cashiers will receive 403 Forbidden.
    """
    items = db.query(InventoryItem).order_by(InventoryItem.category, InventoryItem.name).all()
    output = []
    for it in items:
        is_low = bool(it.current_stock <= it.minimum_threshold)
        output.append({
            "id": it.id,
            "name": it.name,
            "sku": it.sku,
            "category": it.category.value if hasattr(it.category, "value") else str(it.category),
            "current_stock": round(float(it.current_stock), 2),
            "unit": it.unit.value if hasattr(it.unit, "value") else str(it.unit),
            "minimum_threshold": round(float(it.minimum_threshold), 2),
            "cost_per_unit": float(it.cost_per_unit),
            "is_low_stock": is_low,
            "low_stock": is_low,
            "last_restocked_at": it.last_restocked_at,
        })
    return output


# =====================================================================
# 3. POST /api/orders — Authenticated (Admin, Manager, Cashier)
# =====================================================================

@app.post("/api/orders", response_model=OrderSchema, status_code=status.HTTP_201_CREATED, tags=["Orders"])
def create_order(
    order_payload: OrderCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits a new POS order (Authenticated as Cashier, Manager, or Admin):
    1. Records order under current authenticated cashier.
    2. Calculates subtotal and 8.25% tax.
    3. Traverses Recipes table to automatically deduct raw ingredients from inventory.
    4. Writes an immutable audit log into InventoryLogs.
    """
    if not order_payload.items:
        raise HTTPException(status_code=400, detail="Order must include at least one menu item.")

    subtotal = Decimal("0.00")
    order_items_entities = []
    inventory_deductions = []

    try:
        order_type_enum = OrderType(order_payload.order_type.upper())
    except Exception:
        order_type_enum = OrderType.DINE_IN

    try:
        payment_method_enum = PaymentMethod(order_payload.payment_method.upper())
    except Exception:
        payment_method_enum = PaymentMethod.CASH

    # 1. Process Line Items
    for line in order_payload.items:
        menu_item = db.query(MenuItem).filter(MenuItem.id == line.menu_item_id).first()
        if not menu_item:
            raise HTTPException(status_code=404, detail=f"Menu item with ID {line.menu_item_id} not found.")

        line_price = Decimal(str(menu_item.price))
        line_total = line_price * line.quantity
        subtotal += line_total

        order_items_entities.append(
            OrderItem(
                menu_item_id=menu_item.id,
                quantity=line.quantity,
                unit_price=line_price,
                subtotal=line_total,
                notes=line.notes,
                created_at=datetime.now(),
            )
        )

        # 2. Recipe Bill-of-Materials: Find raw ingredients to deduct
        recipes = db.query(Recipe).filter(Recipe.menu_item_id == menu_item.id).all()
        for rec in recipes:
            deduction_amount = rec.quantity_required * line.quantity
            inventory_deductions.append((rec.inventory_item_id, deduction_amount, menu_item.name, line.quantity))

    # 3. Apply Inventory Deductions & Audit Logs
    for inv_id, deduction_qty, item_name, count in inventory_deductions:
        inv_item = db.query(InventoryItem).filter(InventoryItem.id == inv_id).first()
        if inv_item:
            inv_item.current_stock = max(0.0, round(inv_item.current_stock - deduction_qty, 3))
            
            log = InventoryLog(
                inventory_item_id=inv_item.id,
                change_amount=-round(deduction_qty, 3),
                transaction_type=InventoryTransactionType.SALE_CONSUMPTION,
                reference_id=f"POS-SALE-{item_name}",
                notes=f"Auto-depleted {deduction_qty} {inv_item.unit.value if hasattr(inv_item.unit, 'value') else inv_item.unit} for {item_name} x{count}",
                created_at=datetime.now(),
            )
            db.add(log)

    # 4. Calculate Tax, Discount, and Final Total
    discount = Decimal(str(order_payload.discount_amount)).quantize(Decimal("0.01"))
    tax_rate = Decimal("0.0825")  # 8.25% sales tax
    taxable_amount = max(Decimal("0.00"), subtotal - discount)
    tax_amount = (taxable_amount * tax_rate).quantize(Decimal("0.01"))
    total_amount = taxable_amount + tax_amount

    order_timestamp = datetime.now()
    today_str = order_timestamp.strftime("%Y%m%d")
    daily_count = db.query(Order).filter(Order.created_at >= datetime.combine(date.today(), datetime.min.time())).count() + 1
    order_number = f"ORD-{today_str}-{daily_count:04d}"

    new_order = Order(
        order_number=order_number,
        user_id=current_user.id,  # Linked directly to logged-in user!
        customer_name=order_payload.customer_name or "Guest",
        table_number=order_payload.table_number,
        order_type=order_type_enum,
        status=OrderStatus.PENDING,
        payment_method=payment_method_enum,
        payment_status=PaymentStatus.PAID,
        subtotal=subtotal,
        discount_amount=discount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        created_at=order_timestamp,
        items=order_items_entities,
    )

    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    # Format response
    formatted_items = []
    for item in new_order.items:
        m_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
        formatted_items.append({
            "id": item.id,
            "menu_item_id": item.menu_item_id,
            "menu_item_name": m_item.name if m_item else f"Item #{item.menu_item_id}",
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "subtotal": float(item.subtotal),
            "notes": item.notes,
        })

    return {
        "id": new_order.id,
        "order_number": new_order.order_number,
        "customer_name": new_order.customer_name,
        "table_number": new_order.table_number,
        "order_type": new_order.order_type.value if hasattr(new_order.order_type, "value") else str(new_order.order_type),
        "status": new_order.status.value if hasattr(new_order.status, "value") else str(new_order.status),
        "payment_method": new_order.payment_method.value if hasattr(new_order.payment_method, "value") else str(new_order.payment_method),
        "payment_status": new_order.payment_status.value if hasattr(new_order.payment_status, "value") else str(new_order.payment_status),
        "subtotal": float(new_order.subtotal),
        "tax_amount": float(new_order.tax_amount),
        "discount_amount": float(new_order.discount_amount),
        "total_amount": float(new_order.total_amount),
        "created_at": new_order.created_at,
        "items": formatted_items,
    }


# =====================================================================
# 4. GET /api/orders & PATCH /api/orders/{id}/status — Authenticated
# =====================================================================

@app.get("/api/orders", response_model=List[OrderSchema], tags=["Orders"])
def get_orders(
    status_filter: Optional[str] = Query(None, description="Filter by status (PENDING, PREPARING, READY, COMPLETED, CANCELLED)"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch recent orders for Kitchen Display System (KDS) and POS tracking (Authenticated)."""
    query = db.query(Order)
    if status_filter:
        try:
            status_enum = OrderStatus(status_filter.upper())
            query = query.filter(Order.status == status_enum)
        except Exception:
            pass

    orders = query.order_by(desc(Order.created_at)).limit(limit).all()

    output = []
    for o in orders:
        items_out = []
        for it in o.items:
            m_item = db.query(MenuItem).filter(MenuItem.id == it.menu_item_id).first()
            items_out.append({
                "id": it.id,
                "menu_item_id": it.menu_item_id,
                "menu_item_name": m_item.name if m_item else f"Item #{it.menu_item_id}",
                "quantity": it.quantity,
                "unit_price": float(it.unit_price),
                "subtotal": float(it.subtotal),
                "notes": it.notes,
            })

        output.append({
            "id": o.id,
            "order_number": o.order_number,
            "customer_name": o.customer_name,
            "table_number": o.table_number,
            "order_type": o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type),
            "status": o.status.value if hasattr(o.status, "value") else str(o.status),
            "payment_method": o.payment_method.value if hasattr(o.payment_method, "value") else str(o.payment_method),
            "payment_status": o.payment_status.value if hasattr(o.payment_status, "value") else str(o.payment_status),
            "subtotal": float(o.subtotal),
            "tax_amount": float(o.tax_amount),
            "discount_amount": float(o.discount_amount),
            "total_amount": float(o.total_amount),
            "created_at": o.created_at,
            "items": items_out,
        })
    return output


@app.patch("/api/orders/{order_id}/status", response_model=OrderSchema, tags=["Orders"])
def update_order_status(
    order_id: int,
    status_update: OrderUpdateStatusSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates the preparation state of an order (Authenticated):
    Valid transitions: PENDING -> PREPARING -> READY -> COMPLETED (or CANCELLED).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail=f"Order with ID {order_id} not found.")

    target_status_str = status_update.status.upper().strip()
    try:
        new_status = OrderStatus(target_status_str)
    except ValueError:
        valid_statuses = [s.value for s in OrderStatus]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status_update.status}'. Valid statuses: {valid_statuses}",
        )

    order.status = new_status
    order.updated_at = datetime.now()
    db.commit()
    db.refresh(order)

    items_out = []
    for it in order.items:
        m_item = db.query(MenuItem).filter(MenuItem.id == it.menu_item_id).first()
        items_out.append({
            "id": it.id,
            "menu_item_id": it.menu_item_id,
            "menu_item_name": m_item.name if m_item else f"Item #{it.menu_item_id}",
            "quantity": it.quantity,
            "unit_price": float(it.unit_price),
            "subtotal": float(it.subtotal),
            "notes": it.notes,
        })

    return {
        "id": order.id,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "table_number": order.table_number,
        "order_type": order.order_type.value if hasattr(order.order_type, "value") else str(order.order_type),
        "status": order.status.value if hasattr(order.status, "value") else str(order.status),
        "payment_method": order.payment_method.value if hasattr(order.payment_method, "value") else str(order.payment_method),
        "payment_status": order.payment_status.value if hasattr(order.payment_status, "value") else str(order.payment_status),
        "subtotal": float(order.subtotal),
        "tax_amount": float(order.tax_amount),
        "discount_amount": float(order.discount_amount),
        "total_amount": float(order.total_amount),
        "created_at": order.created_at,
        "items": items_out,
    }


# =====================================================================
# 5. GET /api/ai/forecast — Restricted to Admin & Manager (RBAC)
# =====================================================================

@app.get("/api/ai/forecast", tags=["AI Forecasting"])
def get_ai_demand_forecast(
    horizon_days: int = Query(7, ge=1, le=14, description="Forecast horizon in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager:
    Executes the Scikit-Learn time-series forecasting model across 30 days of sales history.
    Cashiers will receive 403 Forbidden.
    """
    try:
        forecaster = RestaurantDemandForecaster(db=db)
        forecast_report = forecaster.generate_full_forecast(horizon_days=horizon_days)
        return forecast_report
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating AI demand forecast: {str(e)}",
        )


# =====================================================================
# 6. POST /api/seed — Reset & Re-seed 30 Days of Realistic Data
# =====================================================================

@app.post("/api/seed", tags=["Utility"])
def trigger_seed_database():
    """Manual endpoint to reset and re-seed 30 days of realistic dummy restaurant data."""
    try:
        seed_database()
        return {"status": "success", "message": "Database seeded with 30 days of realistic orders, recipes, and users."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database seeding failed: {str(e)}")
