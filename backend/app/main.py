from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta

from backend.app.core.database import get_db, engine, Base
from backend.app.models.models import (
    MenuItem,
    InventoryItem,
    Order,
    OrderItem,
    Recipe,
    DemandForecast,
    User,
    OrderStatus,
    PaymentStatus,
    InventoryLog,
    InventoryTransactionType,
)
from backend.app.schemas.schemas import (
    MenuItemResponse,
    InventoryItemResponse,
    OrderCreate,
    OrderResponse,
    DemandForecastResponse,
)

# Auto-create tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RestoAI API - Smart Restaurant POS & Demand Forecasting",
    version="1.0.0",
    description="Backend REST API providing Point of Sale operations, inventory tracking, and ML demand projections.",
)

# Enable CORS for React frontend (Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def health_check():
    return {
        "status": "online",
        "service": "RestoAI POS & Forecasting Engine",
        "version": "1.0.0",
    }


# ==========================================
# Menu Items Endpoints
# ==========================================

@app.get("/api/v1/menu", response_model=List[MenuItemResponse], tags=["Menu"])
def get_menu_items(db: Session = Depends(get_db)):
    """Fetch all available menu items for the POS terminal."""
    return db.query(MenuItem).filter(MenuItem.is_available == True).all()


# ==========================================
# POS Order Placement with Auto-Inventory Deduction
# ==========================================

@app.post("/api/v1/orders", response_model=OrderResponse, tags=["POS"])
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    """
    Creates a new order, calculates totals, and automatically consumes raw ingredients
    from the inventory based on recipe bill of materials.
    """
    if not order_in.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item.")

    # 1. Calculate Subtotal & Validate Items
    subtotal = 0.0
    order_items_to_create = []

    for item_data in order_in.items:
        menu_item = db.query(MenuItem).filter(MenuItem.id == item_data.menu_item_id).first()
        if not menu_item or not menu_item.is_available:
            raise HTTPException(status_code=404, detail=f"Menu item {item_data.menu_item_id} is unavailable.")

        line_subtotal = float(menu_item.price) * item_data.quantity
        subtotal += line_subtotal

        order_items_to_create.append(
            OrderItem(
                menu_item_id=menu_item.id,
                quantity=item_data.quantity,
                unit_price=menu_item.price,
                subtotal=line_subtotal,
                notes=item_data.notes,
            )
        )

        # 2. Recipe Bill-of-Materials Inventory Deduction
        recipes = db.query(Recipe).filter(Recipe.menu_item_id == menu_item.id).all()
        for recipe in recipes:
            required_qty = recipe.quantity_required * item_data.quantity
            inventory_item = db.query(InventoryItem).filter(InventoryItem.id == recipe.inventory_item_id).first()
            if inventory_item:
                inventory_item.current_stock -= required_qty
                # Log transaction audit trail
                log = InventoryLog(
                    inventory_item_id=inventory_item.id,
                    change_amount=-round(required_qty, 3),
                    transaction_type=InventoryTransactionType.SALE_CONSUMPTION,
                    notes=f"Auto-deducted {required_qty}{recipe.unit} for order of {menu_item.name} x{item_data.quantity}",
                )
                db.add(log)

    discount = float(order_in.discount_amount)
    tax = round((subtotal - discount) * 0.0825, 2)  # 8.25% tax
    total = round(subtotal - discount + tax, 2)

    order_number = f"ORD-{date.today().strftime('%Y%m%d')}-{int(timedelta(days=1).total_seconds()) % 10000:04d}"

    new_order = Order(
        order_number=order_number,
        user_id=order_in.user_id,
        customer_name=order_in.customer_name or "Guest",
        table_number=order_in.table_number,
        order_type=order_in.order_type,
        status=OrderStatus.COMPLETED,
        payment_method=order_in.payment_method,
        payment_status=PaymentStatus.PAID,
        subtotal=subtotal,
        discount_amount=discount,
        tax_amount=tax,
        total_amount=total,
        items=order_items_to_create,
    )

    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return new_order


# ==========================================
# Inventory & Low-Stock Alerts
# ==========================================

@app.get("/api/v1/inventory", response_model=List[InventoryItemResponse], tags=["Inventory"])
def get_inventory(db: Session = Depends(get_db)):
    """Fetch current stock levels with low-stock warning indicators."""
    items = db.query(InventoryItem).all()
    # Populate the is_low_stock property in response
    return items


# ==========================================
# AI Demand Forecasting Endpoints
# ==========================================

@app.get("/api/v1/forecasts", response_model=List[DemandForecastResponse], tags=["AI Forecasting"])
def get_forecasts(
    menu_item_id: Optional[int] = Query(None, description="Filter forecast for specific menu item"),
    start_date: Optional[date] = Query(None, description="Start date for range query"),
    db: Session = Depends(get_db),
):
    """
    Retrieve historical and future AI demand predictions
    to plot in Recharts (Actual vs Predicted curves).
    """
    query = db.query(DemandForecast)
    if menu_item_id:
        query = query.filter(DemandForecast.menu_item_id == menu_item_id)
    if start_date:
        query = query.filter(DemandForecast.forecast_date >= start_date)

    return query.order_by(DemandForecast.forecast_date.asc()).all()
