"""
RestoAI - Smart Restaurant POS & Demand Forecasting API
Main Application: backend/main.py with Full SaaS Capabilities
(JWT Auth, RBAC, Table Floor Plan Sync, 1-Click Restock, CSV Export, White-Label Settings)
"""

import os
import sys
import io
import csv
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

from fastapi import FastAPI, Depends, HTTPException, Query, Response, status
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
    StoreSetting,
)
from backend.seed_data import seed_database
from ml_engine.forecasting import RestaurantDemandForecaster

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RestoAI – Smart Restaurant POS & Demand Forecasting API",
    version="1.2.0",
    description="Full-stack commercial restaurant POS, inventory deduction, KDS table floor plan sync, and AI forecasting.",
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


class StoreSettingSchema(BaseModel):
    id: int
    restaurant_name: str
    tagline: str
    address: str
    phone: str
    currency_symbol: str
    tax_rate: float
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StoreSettingUpdateSchema(BaseModel):
    restaurant_name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(min_length=1, max_length=150)
    address: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=50)
    currency_symbol: str = Field(min_length=1, max_length=10)
    tax_rate: float = Field(ge=0.0, le=50.0)


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


class RestockRequest(BaseModel):
    quantity: float = Field(gt=0, default=20.0, description="Quantity to replenish")
    notes: Optional[str] = "Manual restock replenishment"


class TableStatusSchema(BaseModel):
    table_number: int
    status: str  # "AVAILABLE" | "OCCUPIED"
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    total_amount: Optional[float] = None
    customer_name: Optional[str] = None
    items_count: Optional[int] = None
    created_at: Optional[datetime] = None


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
        admin_user = db.query(User).filter(User.email == "admin@restoai.com").first()
        store_setting = db.query(StoreSetting).first()

        if user_count == 0 or menu_count == 0 or not admin_user:
            print("[RestoAI] Empty or incomplete database detected. Running seed script...")
            seed_database()
        elif not store_setting:
            default_setting = StoreSetting(
                restaurant_name="RestoAI Bistro & Lounge",
                tagline="Smart AI-Powered Hospitality",
                address="100 Innovation Way, Silicon Valley, CA",
                phone="(555) 019-2831",
                currency_symbol="$",
                tax_rate=8.25,
            )
            db.add(default_setting)
            db.commit()
            print("[RestoAI] Initialized default store branding settings.")
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
        "version": "1.2.0",
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
# 1. White-Label Restaurant Branding Settings (Admin Only)
# =====================================================================

@app.get("/api/settings", response_model=StoreSettingSchema, tags=["Store Settings"])
def get_store_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns store branding, currency symbol, and tax rate.
    Accessible to all authenticated users so POS, receipts, and KDS stay synchronized.
    """
    setting = db.query(StoreSetting).first()
    if not setting:
        setting = StoreSetting(
            restaurant_name="RestoAI Bistro & Lounge",
            tagline="Smart AI-Powered Hospitality",
            address="100 Innovation Way, Silicon Valley, CA",
            phone="(555) 019-2831",
            currency_symbol="$",
            tax_rate=8.25,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


@app.put("/api/settings", response_model=StoreSettingSchema, tags=["Store Settings"])
def update_store_settings(
    settings_in: StoreSettingUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    """
    Restricted to Admin Only:
    Customizes restaurant white-label parameters (name, tagline, address, phone, currency, sales tax).
    Dynamically reflected across POS calculations, receipt prints, and KDS headers.
    """
    setting = db.query(StoreSetting).first()
    if not setting:
        setting = StoreSetting(**settings_in.dict())
        db.add(setting)
    else:
        setting.restaurant_name = settings_in.restaurant_name
        setting.tagline = settings_in.tagline
        setting.address = settings_in.address
        setting.phone = settings_in.phone
        setting.currency_symbol = settings_in.currency_symbol
        setting.tax_rate = settings_in.tax_rate
        setting.updated_at = datetime.now()

    db.commit()
    db.refresh(setting)
    return setting


# =====================================================================
# 2. Interactive Dine-In Table Floor Plan (Tables 1 to 12)
# =====================================================================

@app.get("/api/tables", response_model=List[TableStatusSchema], tags=["Tables"])
def get_table_floor_plan_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetches real-time status of Dine-In Tables 1 through 12.
    Synchronized with KDS:
    - Tables with orders in PENDING or PREPARING status are OCCUPIED (Rose Red).
    - Tables with orders moved to READY or COMPLETED are AVAILABLE (Emerald Green).
    """
    tables_result = []

    for table_num in range(1, 13):
        # Find any active order occupying this table
        active_order = (
            db.query(Order)
            .filter(
                Order.table_number == table_num,
                Order.order_type == OrderType.DINE_IN,
                Order.status.in_([OrderStatus.PENDING, OrderStatus.PREPARING]),
            )
            .order_by(desc(Order.created_at))
            .first()
        )

        if active_order:
            tables_result.append({
                "table_number": table_num,
                "status": "OCCUPIED",
                "order_id": active_order.id,
                "order_number": active_order.order_number,
                "total_amount": float(active_order.total_amount),
                "customer_name": active_order.customer_name,
                "items_count": len(active_order.items),
                "created_at": active_order.created_at,
            })
        else:
            tables_result.append({
                "table_number": table_num,
                "status": "AVAILABLE",
                "order_id": None,
                "order_number": None,
                "total_amount": None,
                "customer_name": None,
                "items_count": None,
                "created_at": None,
            })

    return tables_result


# =====================================================================
# 3. Menu Endpoints (Catalog & Pricing Management)
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
    """Restricted to Admin & Manager: Update dish sales price or availability."""
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
# 4. Inventory Endpoints (Ledger & 1-Click Restock)
# =====================================================================

@app.get("/api/inventory", response_model=List[InventoryItemSchema], tags=["Inventory"])
def get_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager:
    Fetch raw inventory items with real-time stock levels and low-stock warning flags.
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


@app.post("/api/inventory/{item_id}/restock", response_model=InventoryItemSchema, tags=["Inventory"])
def restock_inventory_item(
    item_id: int,
    payload: RestockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager:
    1-Click Inventory Restock replenishment. Immediately increases stock, updates
    last_restocked_at timestamp, and writes an audit entry into InventoryLogs.
    """
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Inventory item with ID {item_id} not found.")

    qty = round(float(payload.quantity), 2)
    item.current_stock = round(item.current_stock + qty, 2)
    item.last_restocked_at = datetime.now()

    # Create immutable audit log
    log = InventoryLog(
        inventory_item_id=item.id,
        change_amount=qty,
        transaction_type=InventoryTransactionType.RESTOCK,
        reference_id=f"RESTOCK-{current_user.username.upper()}",
        notes=payload.notes or f"Manual restock of +{qty} {item.unit.value if hasattr(item.unit, 'value') else item.unit}",
        created_at=datetime.now(),
    )
    db.add(log)
    db.commit()
    db.refresh(item)

    is_low = bool(item.current_stock <= item.minimum_threshold)
    return {
        "id": item.id,
        "name": item.name,
        "sku": item.sku,
        "category": item.category.value if hasattr(item.category, "value") else str(item.category),
        "current_stock": round(float(item.current_stock), 2),
        "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit),
        "minimum_threshold": round(float(item.minimum_threshold), 2),
        "cost_per_unit": float(item.cost_per_unit),
        "is_low_stock": is_low,
        "low_stock": is_low,
        "last_restocked_at": item.last_restocked_at,
    }


# =====================================================================
# 5. Orders & POS Transactions (with Dynamic Tax & Recipe Depletion)
# =====================================================================

@app.post("/api/orders", response_model=OrderSchema, status_code=status.HTTP_201_CREATED, tags=["Orders"])
def create_order(
    order_payload: OrderCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits a new POS order (Authenticated as Cashier, Manager, or Admin):
    1. Records order under current authenticated user.
    2. Calculates subtotal and dynamic tax from StoreSettings.
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

        recipes = db.query(Recipe).filter(Recipe.menu_item_id == menu_item.id).all()
        for rec in recipes:
            deduction_amount = rec.quantity_required * line.quantity
            inventory_deductions.append((rec.inventory_item_id, deduction_amount, menu_item.name, line.quantity))

    # 2. Apply Inventory Deductions & Audit Logs
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

    # 3. Dynamic Tax Calculation from StoreSettings
    store_setting = db.query(StoreSetting).first()
    tax_percent = Decimal(str(store_setting.tax_rate)) if store_setting else Decimal("8.25")
    tax_rate = tax_percent / Decimal("100")

    discount = Decimal(str(order_payload.discount_amount)).quantize(Decimal("0.01"))
    taxable_amount = max(Decimal("0.00"), subtotal - discount)
    tax_amount = (taxable_amount * tax_rate).quantize(Decimal("0.01"))
    total_amount = taxable_amount + tax_amount

    order_timestamp = datetime.now()
    today_str = order_timestamp.strftime("%Y%m%d")
    daily_count = db.query(Order).filter(Order.created_at >= datetime.combine(date.today(), datetime.min.time())).count() + 1
    order_number = f"ORD-{today_str}-{daily_count:04d}"

    new_order = Order(
        order_number=order_number,
        user_id=current_user.id,
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
# 6. Kitchen Display System (KDS) & Order Status Workflow
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
    Transitions: PENDING -> PREPARING -> READY -> COMPLETED.
    When marked READY or COMPLETED, any occupied table immediately becomes AVAILABLE again on the floor plan!
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
# 7. One-Click Daily Sales & Financial CSV Report (Admin & Manager)
# =====================================================================

@app.get("/api/reports/sales/csv", tags=["Financial Reports"])
def export_sales_report_csv(
    days: int = Query(30, ge=1, le=90, description="Report window in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Restricted to Admin & Manager:
    Generates and downloads a clean, well-formatted CSV financial report containing:
    Order ID, Date, Time, Type, Table, Cashier, Items Sold, Subtotal, Tax, Total Revenue,
    plus a bottom summary row with grand totals.
    """
    cutoff = datetime.now() - timedelta(days=days)
    orders = (
        db.query(Order)
        .filter(Order.created_at >= cutoff, Order.status != OrderStatus.CANCELLED)
        .order_by(desc(Order.created_at))
        .all()
    )

    store_setting = db.query(StoreSetting).first()
    currency = store_setting.currency_symbol if store_setting else "$"

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Header Information
    writer.writerow(["RESTOAI DAILY SALES & FINANCIAL REPORT"])
    writer.writerow([f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
    writer.writerow([f"Report Range: Past {days} Days", f"Total Orders: {len(orders)}"])
    writer.writerow([])  # Blank row

    # 2. Table Column Headers
    writer.writerow([
        "Order Number",
        "Date",
        "Time",
        "Order Type",
        "Table",
        "Cashier",
        "Items Sold",
        f"Subtotal ({currency})",
        f"Tax ({currency})",
        f"Total Revenue ({currency})",
        "Payment Method",
        "Status",
    ])

    total_subtotal = Decimal("0.00")
    total_tax = Decimal("0.00")
    total_revenue = Decimal("0.00")

    # 3. Data Rows
    for o in orders:
        total_subtotal += Decimal(str(o.subtotal))
        total_tax += Decimal(str(o.tax_amount))
        total_revenue += Decimal(str(o.total_amount))

        item_summary = "; ".join(
            f"{it.quantity}x {it.menu_item.name if it.menu_item else f'Item #{it.menu_item_id}'}"
            for it in o.items
        )

        cashier_name = o.cashier.full_name if o.cashier else "Staff"
        table_str = f"Table {o.table_number}" if o.table_number else (
            o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type)
        )

        writer.writerow([
            o.order_number,
            o.created_at.strftime("%Y-%m-%d"),
            o.created_at.strftime("%H:%M:%S"),
            o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type),
            table_str,
            cashier_name,
            item_summary,
            f"{float(o.subtotal):.2f}",
            f"{float(o.tax_amount):.2f}",
            f"{float(o.total_amount):.2f}",
            o.payment_method.value if hasattr(o.payment_method, "value") else str(o.payment_method),
            o.status.value if hasattr(o.status, "value") else str(o.status),
        ])

    # 4. Summary Totals Row at the bottom
    writer.writerow([])
    writer.writerow([
        "TOTALS SUMMARY",
        f"{len(orders)} Orders",
        "",
        "",
        "",
        "",
        "",
        f"{float(total_subtotal):.2f}",
        f"{float(total_tax):.2f}",
        f"{float(total_revenue):.2f}",
        "",
        "COMPLETED",
    ])

    csv_data = output.getvalue()
    filename = f"restoai_sales_report_{datetime.now().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        },
    )


# =====================================================================
# 8. AI Demand Forecasting Engine
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
# 9. Database Seeding Endpoint
# =====================================================================

@app.post("/api/seed", tags=["Utility"])
def trigger_seed_database():
    """Manual endpoint to reset and re-seed 30 days of realistic dummy restaurant data."""
    try:
        seed_database()
        return {"status": "success", "message": "Database seeded with 30 days of realistic orders, recipes, and users."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database seeding failed: {str(e)}")
