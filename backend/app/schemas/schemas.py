from datetime import datetime, date
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field
from backend.app.models.models import (
    UserRole,
    ItemCategory,
    InventoryCategory,
    InventoryUnit,
    OrderType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    InventoryTransactionType,
)


# ==========================================
# User Schemas
# ==========================================

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.CASHIER
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# Inventory Schemas
# ==========================================

class InventoryItemBase(BaseModel):
    name: str
    sku: str
    category: InventoryCategory
    current_stock: float
    unit: InventoryUnit
    minimum_threshold: float = 10.0
    cost_per_unit: Decimal


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemResponse(InventoryItemBase):
    id: int
    last_restocked_at: Optional[datetime] = None
    is_low_stock: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# Recipe Schemas
# ==========================================

class RecipeBase(BaseModel):
    menu_item_id: int
    inventory_item_id: int
    quantity_required: float
    unit: str
    notes: Optional[str] = None


class RecipeCreate(RecipeBase):
    pass


class RecipeResponse(RecipeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# Menu Item Schemas
# ==========================================

class MenuItemBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    category: ItemCategory
    price: Decimal
    cost_price: Decimal
    is_available: bool = True
    image_url: Optional[str] = None
    preparation_time_minutes: int = 15


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemResponse(MenuItemBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# Order & Order Item Schemas
# ==========================================

class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(gt=0, default=1)
    notes: Optional[str] = None


class OrderItemResponse(BaseModel):
    id: int
    menu_item_id: int
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    user_id: Optional[int] = None
    customer_name: Optional[str] = None
    table_number: Optional[int] = None
    order_type: OrderType = OrderType.DINE_IN
    payment_method: PaymentMethod = PaymentMethod.CASH
    discount_amount: Decimal = Decimal("0.00")
    items: List[OrderItemCreate]


class OrderResponse(BaseModel):
    id: int
    order_number: str
    user_id: Optional[int]
    customer_name: Optional[str]
    table_number: Optional[int]
    order_type: OrderType
    status: OrderStatus
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    created_at: datetime
    items: List[OrderItemResponse] = []

    class Config:
        from_attributes = True


# ==========================================
# Demand Forecast Schemas
# ==========================================

class DemandForecastResponse(BaseModel):
    id: int
    menu_item_id: int
    forecast_date: date
    predicted_quantity: float
    actual_quantity: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None
    model_version: str
    features_used: Optional[dict] = None

    class Config:
        from_attributes = True
