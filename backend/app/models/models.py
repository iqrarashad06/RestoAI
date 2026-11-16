import enum
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Numeric,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Text,
    Enum as SQLEnum,
    UniqueConstraint,
    Index,
    JSON,
    func,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base


# ==========================================
# Enumerations for Domain Values
# ==========================================

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"


class ItemCategory(str, enum.Enum):
    STARTERS = "STARTERS"
    MAIN_COURSE = "MAIN_COURSE"
    BEVERAGES = "BEVERAGES"
    DESSERTS = "DESSERTS"
    SIDES = "SIDES"


class InventoryCategory(str, enum.Enum):
    MEAT = "MEAT"
    PRODUCE = "PRODUCE"
    DAIRY = "DAIRY"
    DRY_GOODS = "DRY_GOODS"
    BEVERAGE_BASE = "BEVERAGE_BASE"
    PACKAGING = "PACKAGING"


class InventoryUnit(str, enum.Enum):
    KG = "kg"
    G = "g"
    L = "l"
    ML = "ml"
    UNITS = "units"
    PORTIONS = "portions"


class OrderType(str, enum.Enum):
    DINE_IN = "DINE_IN"
    TAKEAWAY = "TAKEAWAY"
    DELIVERY = "DELIVERY"


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    PREPARING = "PREPARING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    CARD = "CARD"
    UPI = "UPI"
    DIGITAL_WALLET = "DIGITAL_WALLET"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


class InventoryTransactionType(str, enum.Enum):
    SALE_CONSUMPTION = "SALE_CONSUMPTION"
    RESTOCK = "RESTOCK"
    WASTAGE = "WASTAGE"
    ADJUSTMENT = "ADJUSTMENT"


# ==========================================
# 1. Users Table (RBAC Authentication)
# ==========================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role_enum", native_enum=False),
        default=UserRole.CASHIER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="cashier")

    def __repr__(self) -> str:
        return f"<User id={self.id} username='{self.username}' role='{self.role}'>"


# ==========================================
# 2. Menu Items Table
# ==========================================

class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[ItemCategory] = mapped_column(
        SQLEnum(ItemCategory, name="item_category_enum", native_enum=False),
        nullable=False,
        index=True,
    )
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    cost_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    order_items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="menu_item", cascade="all, delete-orphan")
    recipes: Mapped[List["Recipe"]] = relationship("Recipe", back_populates="menu_item", cascade="all, delete-orphan")
    demand_forecasts: Mapped[List["DemandForecast"]] = relationship("DemandForecast", back_populates="menu_item", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<MenuItem id={self.id} code='{self.code}' name='{self.name}' price={self.price}>"


# ==========================================
# 3. Inventory Items Table (Raw Ingredients)
# ==========================================

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    category: Mapped[InventoryCategory] = mapped_column(
        SQLEnum(InventoryCategory, name="inventory_category_enum", native_enum=False),
        nullable=False,
        index=True,
    )
    current_stock: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unit: Mapped[InventoryUnit] = mapped_column(
        SQLEnum(InventoryUnit, name="inventory_unit_enum", native_enum=False),
        nullable=False,
    )
    minimum_threshold: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    cost_per_unit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    last_restocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    recipes: Mapped[List["Recipe"]] = relationship("Recipe", back_populates="inventory_item", cascade="all, delete-orphan")
    stock_logs: Mapped[List["InventoryLog"]] = relationship("InventoryLog", back_populates="inventory_item", cascade="all, delete-orphan")

    @property
    def is_low_stock(self) -> bool:
        """Helper to quickly check if current stock is below reorder threshold."""
        return self.current_stock <= self.minimum_threshold

    def __repr__(self) -> str:
        return f"<InventoryItem id={self.id} sku='{self.sku}' name='{self.name}' stock={self.current_stock}{self.unit}>"


# ==========================================
# 4. Recipes Table (Bill of Materials)
# ==========================================

class Recipe(Base):
    """
    Associates Menu Items with raw Inventory Ingredients.
    Enables automatic inventory deduction upon order placement
    and accurate cost calculations.
    """
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menu_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity_required: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="recipes")
    inventory_item: Mapped["InventoryItem"] = relationship("InventoryItem", back_populates="recipes")

    __table_args__ = (
        UniqueConstraint("menu_item_id", "inventory_item_id", name="uq_recipe_menu_inventory"),
    )

    def __repr__(self) -> str:
        return f"<Recipe menu_item_id={self.menu_item_id} inventory_item_id={self.inventory_item_id} qty={self.quantity_required}>"


# ==========================================
# 5. Orders Table (POS Transactions)
# ==========================================

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    table_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_type: Mapped[OrderType] = mapped_column(
        SQLEnum(OrderType, name="order_type_enum", native_enum=False),
        default=OrderType.DINE_IN,
        nullable=False,
    )
    status: Mapped[OrderStatus] = mapped_column(
        SQLEnum(OrderStatus, name="order_status_enum", native_enum=False),
        default=OrderStatus.PENDING,
        nullable=False,
        index=True,
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod, name="payment_method_enum", native_enum=False),
        default=PaymentMethod.CASH,
        nullable=False,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, name="payment_status_enum", native_enum=False),
        default=PaymentStatus.PAID,
        nullable=False,
        index=True,
    )
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, nullable=False)
    
    # Highly indexed for time-series forecasting & analytics queries
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    cashier: Mapped[Optional["User"]] = relationship("User", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Order id={self.id} order_number='{self.order_number}' total={self.total_amount} status='{self.status}'>"


# ==========================================
# 6. Order Items Table
# ==========================================

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    menu_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="items")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="order_items")

    def __repr__(self) -> str:
        return f"<OrderItem id={self.id} order_id={self.order_id} item_id={self.menu_item_id} qty={self.quantity}>"


# ==========================================
# 7. Demand Forecasts Table (ML Time-Series Output)
# ==========================================

class DemandForecast(Base):
    """
    Stores ML predictions generated by the Demand Forecasting Engine.
    Keeps historical predictions alongside actual consumption for MAPE/MAE tracking.
    """
    __tablename__ = "demand_forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menu_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    predicted_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    actual_quantity: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    model_version: Mapped[str] = mapped_column(String(50), default="rf_v1.0", nullable=False)
    features_used: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="demand_forecasts")

    __table_args__ = (
        UniqueConstraint("menu_item_id", "forecast_date", "model_version", name="uq_forecast_item_date_model"),
        Index("ix_forecast_item_date", "menu_item_id", "forecast_date"),
    )

    def __repr__(self) -> str:
        return f"<DemandForecast item_id={self.menu_item_id} date={self.forecast_date} pred={self.predicted_quantity}>"


# ==========================================
# 8. Inventory Logs Table (Audit & Consumption Ledger)
# ==========================================

class InventoryLog(Base):
    """
    Maintains an immutable ledger of every stock fluctuation:
    orders fulfilled, raw ingredient shipments, waste/spoilage, or inventory counts.
    """
    __tablename__ = "inventory_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inventory_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    change_amount: Mapped[float] = mapped_column(Float, nullable=False)  # e.g., -0.400 or +25.0
    transaction_type: Mapped[InventoryTransactionType] = mapped_column(
        SQLEnum(InventoryTransactionType, name="inv_tx_type_enum", native_enum=False),
        nullable=False,
    )
    reference_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Order # or Batch #
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )

    # Relationships
    inventory_item: Mapped["InventoryItem"] = relationship("InventoryItem", back_populates="stock_logs")

    def __repr__(self) -> str:
        return f"<InventoryLog item_id={self.inventory_item_id} change={self.change_amount} type='{self.transaction_type}'>"


# ==========================================
# 9. Store Settings Table (White-Label SaaS Branding)
# ==========================================

class StoreSetting(Base):
    """
    White-label SaaS configuration persisted per restaurant instance.
    Controls branding, currency symbols, and sales tax across POS, receipts, and reports.
    """
    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    restaurant_name: Mapped[str] = mapped_column(
        String(100), default="RestoAI Bistro & Lounge", nullable=False
    )
    tagline: Mapped[str] = mapped_column(
        String(150), default="Smart AI-Powered Hospitality", nullable=False
    )
    address: Mapped[str] = mapped_column(
        String(255), default="100 Innovation Way, Silicon Valley, CA", nullable=False
    )
    phone: Mapped[str] = mapped_column(
        String(50), default="(555) 019-2831", nullable=False
    )
    currency_symbol: Mapped[str] = mapped_column(
        String(10), default="$", nullable=False
    )
    tax_rate: Mapped[float] = mapped_column(
        Float, default=8.25, nullable=False
    )  # percentage e.g. 8.25%
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    def __repr__(self) -> str:
        return f"<StoreSetting name='{self.restaurant_name}' currency='{self.currency_symbol}' tax={self.tax_rate}%>"
