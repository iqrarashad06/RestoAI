"""
RestoAI - Production Seed Data Generator
Populates 30 days of realistic restaurant orders, menu items, raw ingredients,
recipes (bill of materials), inventory deduction logs, and AI demand forecasts.

Run directly via:
    python backend/seed_data.py
or from root:
    python -m backend.seed_data
"""

import os
import sys
import random
import hashlib
from datetime import datetime, date, timedelta
from decimal import Decimal

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.core.database import Base, engine, SessionLocal
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


try:
    from backend.app.core.security import get_password_hash
except ImportError:
    from app.core.security import get_password_hash

def hash_password(password: str) -> str:
    return get_password_hash(password)


def seed_database():
    print("=" * 70)
    print("   RESTOAI: INITIALIZING DATABASE & SEEDING 30-DAY RESTAURANT DATA   ")
    print("=" * 70)

    # 1. Reset / Create tables
    print("[1/6] Dropping and creating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("      Tables successfully created in:", engine.url)

    db = SessionLocal()

    try:
        # -------------------------------------------------------------
        # 2. Seed Users (RBAC)
        # -------------------------------------------------------------
        print("\n[2/6] Seeding Users (Admin, Manager, Cashiers)...")
        users_data = [
            User(
                username="admin",
                email="admin@restoai.com",
                hashed_password=hash_password("admin123"),
                full_name="Elena Rostova (Executive Chef & Owner)",
                role=UserRole.ADMIN,
                is_active=True,
            ),
            User(
                username="manager",
                email="manager@restoai.com",
                hashed_password=hash_password("manager123"),
                full_name="Marcus Vance (Floor Manager)",
                role=UserRole.MANAGER,
                is_active=True,
            ),
            User(
                username="cashier",
                email="cashier@restoai.com",
                hashed_password=hash_password("cashier123"),
                full_name="Sarah Jenkins (Lead Cashier)",
                role=UserRole.CASHIER,
                is_active=True,
            ),
            User(
                username="alex_cashier",
                email="alex@restoai.com",
                hashed_password=hash_password("cashier123"),
                full_name="Alex Rivera (POS Cashier)",
                role=UserRole.CASHIER,
                is_active=True,
            ),
        ]
        db.add_all(users_data)
        db.commit()
        for u in users_data:
            db.refresh(u)
        cashiers = [u for u in users_data if u.role == UserRole.CASHIER]
        print(f"      Created {len(users_data)} users.")

        # Seed Store Branding Settings (White-Label Default)
        store_settings = StoreSetting(
            restaurant_name="RestoAI Bistro & Lounge",
            tagline="Smart AI-Powered Hospitality",
            address="100 Innovation Way, Silicon Valley, CA",
            phone="(555) 019-2831",
            currency_symbol="$",
            tax_rate=8.25,
        )
        db.add(store_settings)
        db.commit()
        print("      Created default white-label store settings.")

        # -------------------------------------------------------------
        # 3. Seed Inventory Items (Raw Ingredients & Packaging)
        # -------------------------------------------------------------
        print("\n[3/6] Seeding Raw Inventory Items & Reorder Thresholds...")
        raw_inventory = [
            # Produce
            ("Fresh Brioche Buns", "ING-BUN-01", InventoryCategory.DRY_GOODS, 600.0, InventoryUnit.UNITS, 120.0, 0.45),
            ("Prime Angus Ground Beef (180g patties)", "ING-BEEF-01", InventoryCategory.MEAT, 180.0, InventoryUnit.KG, 35.0, 11.50),
            ("Organic Chicken Breast Fillet", "ING-CHK-01", InventoryCategory.MEAT, 140.0, InventoryUnit.KG, 30.0, 8.20),
            ("Whole Milk Mozzarella (Shredded)", "ING-MOZ-01", InventoryCategory.DAIRY, 90.0, InventoryUnit.KG, 20.0, 8.50),
            ("Sharp Aged Cheddar Slices", "ING-CHD-01", InventoryCategory.DAIRY, 65.0, InventoryUnit.KG, 15.0, 10.00),
            ("Italian Tipo 00 Pizza Flour", "ING-FLR-01", InventoryCategory.DRY_GOODS, 200.0, InventoryUnit.KG, 40.0, 1.30),
            ("San Marzano Crushed Tomato Sauce", "ING-SAU-01", InventoryCategory.PRODUCE, 120.0, InventoryUnit.L, 25.0, 3.80),
            ("Organic Heirloom Tomatoes", "ING-TOM-01", InventoryCategory.PRODUCE, 85.0, InventoryUnit.KG, 20.0, 2.70),
            ("Hydroponic Crisp Romaine Lettuce", "ING-LET-01", InventoryCategory.PRODUCE, 70.0, InventoryUnit.KG, 18.0, 3.00),
            ("Idaho Russet Potatoes", "ING-POT-01", InventoryCategory.PRODUCE, 350.0, InventoryUnit.KG, 60.0, 1.15),
            ("Artisan Fettuccine Pasta", "ING-PAS-01", InventoryCategory.DRY_GOODS, 110.0, InventoryUnit.KG, 25.0, 2.50),
            ("Fresh Cremini & Button Mushrooms", "ING-MSH-01", InventoryCategory.PRODUCE, 50.0, InventoryUnit.KG, 12.0, 5.80),
            ("Pasteurized Heavy Whipping Cream", "ING-CRM-01", InventoryCategory.DAIRY, 75.0, InventoryUnit.L, 15.0, 4.20),
            ("Ceremonial Grade Uji Matcha Powder", "ING-MAT-01", InventoryCategory.BEVERAGE_BASE, 15.0, InventoryUnit.KG, 3.0, 48.00),
            ("Farm Fresh Whole Milk", "ING-MLK-01", InventoryCategory.DAIRY, 180.0, InventoryUnit.L, 35.0, 1.25),
            ("Specialty Espresso & Cold Brew Beans", "ING-COF-01", InventoryCategory.BEVERAGE_BASE, 45.0, InventoryUnit.KG, 10.0, 19.50),
            ("Belgian 70% Dark Chocolate Callets", "ING-CHO-01", InventoryCategory.DRY_GOODS, 40.0, InventoryUnit.KG, 8.0, 14.50),
            ("Pasture-Raised Grade A Eggs", "ING-EGG-01", InventoryCategory.DAIRY, 500.0, InventoryUnit.UNITS, 100.0, 0.28),
            ("Vanilla Infused Sugar Syrup", "ING-SYR-01", InventoryCategory.BEVERAGE_BASE, 55.0, InventoryUnit.L, 12.0, 3.20),
            ("Eco-Friendly Takeaway Containers", "ING-PKG-01", InventoryCategory.PACKAGING, 1200.0, InventoryUnit.UNITS, 250.0, 0.35),
        ]

        inv_map = {}
        for name, sku, cat, stock, unit, min_thresh, cost in raw_inventory:
            inv = InventoryItem(
                name=name,
                sku=sku,
                category=cat,
                current_stock=stock,
                unit=unit,
                minimum_threshold=min_thresh,
                cost_per_unit=Decimal(str(cost)),
                last_restocked_at=datetime.now() - timedelta(days=2),
            )
            db.add(inv)
            inv_map[sku] = inv
        db.commit()
        for inv in inv_map.values():
            db.refresh(inv)
        print(f"      Created {len(inv_map)} raw inventory items.")

        # -------------------------------------------------------------
        # 4. Seed Menu Items
        # -------------------------------------------------------------
        print("\n[4/6] Seeding Menu Items...")
        menu_catalog = [
            (
                "Signature Truffle Cheeseburger",
                "BUR-01",
                "Brioche bun, 180g prime beef patty, aged cheddar, lettuce, heirloom tomato, truffle garlic aioli.",
                ItemCategory.MAIN_COURSE,
                14.50,
                4.25,
                12,
                "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500",
            ),
            (
                "Crispy Hot Honey Chicken Sandwich",
                "BUR-02",
                "Crispy fried chicken breast, sweet hot honey glaze, dill pickles, brioche bun.",
                ItemCategory.MAIN_COURSE,
                13.00,
                3.70,
                10,
                "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=500",
            ),
            (
                "Classic Margherita Pizza (12-inch)",
                "PIZ-01",
                "Stone-baked crust, San Marzano tomato sauce, fresh buffalo mozzarella, aromatic sweet basil.",
                ItemCategory.MAIN_COURSE,
                15.50,
                3.60,
                15,
                "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500",
            ),
            (
                "Creamy Wild Mushroom Fettuccine",
                "PAS-01",
                "Artisan fettuccine tossed in rich garlic heavy cream sauce with sautéed cremini mushrooms & parmesan.",
                ItemCategory.MAIN_COURSE,
                16.00,
                4.10,
                14,
                "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=500",
            ),
            (
                "Parmesan Truffle Russet Fries",
                "SID-01",
                "Hand-cut twice-cooked russet potato fries tossed in aromatic truffle oil, parmesan, and sea salt.",
                ItemCategory.SIDES,
                6.50,
                1.30,
                7,
                "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500",
            ),
            (
                "Artisan Caesar Salad",
                "STA-01",
                "Crisp romaine hearts, shaved aged parmesan, garlic croutons, house creamy caesar dressing.",
                ItemCategory.STARTERS,
                9.50,
                2.40,
                6,
                "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=500",
            ),
            (
                "Ceremonial Iced Matcha Latte",
                "BEV-01",
                "Stone-ground Japanese matcha whisked with fresh whole milk and a hint of vanilla cane syrup.",
                ItemCategory.BEVERAGES,
                5.75,
                1.20,
                4,
                "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500",
            ),
            (
                "Nitro Infused Cold Brew",
                "BEV-02",
                "Slow-steeped single-origin specialty roast infused with nitrogen for an ultra-velvety cascade.",
                ItemCategory.BEVERAGES,
                4.75,
                0.85,
                2,
                "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500",
            ),
            (
                "Molten Belgian Chocolate Lava Cake",
                "DES-01",
                "Warm dark chocolate cake with a gooey molten core, dusted with powdered sugar and cocoa.",
                ItemCategory.DESSERTS,
                8.50,
                2.15,
                12,
                "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500",
            ),
        ]

        menu_map = {}
        for name, code, desc, cat, price, cost, prep_min, img in menu_catalog:
            item = MenuItem(
                name=name,
                code=code,
                description=desc,
                category=cat,
                price=Decimal(str(price)),
                cost_price=Decimal(str(cost)),
                preparation_time_minutes=prep_min,
                image_url=img,
                is_available=True,
            )
            db.add(item)
            menu_map[code] = item
        db.commit()
        for item in menu_map.values():
            db.refresh(item)
        print(f"      Created {len(menu_map)} menu items.")

        # -------------------------------------------------------------
        # 5. Link Menu Items to Recipes (Bill of Materials)
        # -------------------------------------------------------------
        print("\n[5/6] Linking Recipes (Bill of Materials) to Menu Items...")
        recipes_specs = [
            # Truffle Cheeseburger (BUR-01)
            ("BUR-01", "ING-BUN-01", 1.0, "unit", "1 Brioche Bun"),
            ("BUR-01", "ING-BEEF-01", 0.180, "kg", "180g Ground Beef Patty"),
            ("BUR-01", "ING-CHD-01", 0.040, "kg", "2 Cheddar Slices"),
            ("BUR-01", "ING-LET-01", 0.030, "kg", "Fresh Lettuce Leaf"),
            ("BUR-01", "ING-TOM-01", 0.040, "kg", "2 Tomato Slices"),
            # Hot Honey Chicken (BUR-02)
            ("BUR-02", "ING-BUN-01", 1.0, "unit", "1 Brioche Bun"),
            ("BUR-02", "ING-CHK-01", 0.200, "kg", "200g Fried Chicken Breast"),
            ("BUR-02", "ING-LET-01", 0.030, "kg", "Fresh Lettuce Leaf"),
            # Margherita Pizza (PIZ-01)
            ("PIZ-01", "ING-FLR-01", 0.250, "kg", "250g Dough Flour"),
            ("PIZ-01", "ING-SAU-01", 0.080, "l", "80ml Tomato Sauce"),
            ("PIZ-01", "ING-MOZ-01", 0.120, "kg", "120g Mozzarella"),
            # Fettuccine (PAS-01)
            ("PAS-01", "ING-PAS-01", 0.150, "kg", "150g Fettuccine"),
            ("PAS-01", "ING-MSH-01", 0.100, "kg", "100g Fresh Mushrooms"),
            ("PAS-01", "ING-CRM-01", 0.100, "l", "100ml Heavy Cream"),
            # Truffle Fries (SID-01)
            ("SID-01", "ING-POT-01", 0.280, "kg", "280g Russet Potatoes"),
            # Caesar Salad (STA-01)
            ("STA-01", "ING-LET-01", 0.140, "kg", "140g Romaine Hearts"),
            ("STA-01", "ING-CRM-01", 0.030, "l", "30ml Cream base for dressing"),
            # Matcha Latte (BEV-01)
            ("BEV-01", "ING-MAT-01", 0.008, "kg", "8g Ceremonial Matcha"),
            ("BEV-01", "ING-MLK-01", 0.250, "l", "250ml Whole Milk"),
            ("BEV-01", "ING-SYR-01", 0.020, "l", "20ml Vanilla Syrup"),
            # Nitro Cold Brew (BEV-02)
            ("BEV-02", "ING-COF-01", 0.028, "kg", "28g Specialty Coffee"),
            # Chocolate Lava Cake (DES-01)
            ("DES-01", "ING-CHO-01", 0.075, "kg", "75g Dark Chocolate"),
            ("DES-01", "ING-EGG-01", 1.0, "unit", "1 Whole Egg"),
            ("DES-01", "ING-CRM-01", 0.030, "l", "30ml Heavy Cream"),
        ]

        recipe_entities = []
        for m_code, i_sku, qty, unit, note in recipes_specs:
            rec = Recipe(
                menu_item_id=menu_map[m_code].id,
                inventory_item_id=inv_map[i_sku].id,
                quantity_required=qty,
                unit=unit,
                notes=note,
            )
            recipe_entities.append(rec)
        db.add_all(recipe_entities)
        db.commit()
        print(f"      Created {len(recipe_entities)} recipe bill-of-material mappings.")

        # -------------------------------------------------------------
        # 6. Simulate 30 Days of Realistic POS Sales Orders
        # -------------------------------------------------------------
        print("\n[6/6] Generating 30 Days of Realistic Sales Orders, Inventory Logs, & ML Forecasts...")
        random.seed(42)  # For reproducible, high-quality test data

        start_date = datetime.now() - timedelta(days=30)
        total_orders_created = 0
        total_order_items_created = 0

        # Menu item weights by base popularity
        item_base_popularity = {
            "BUR-01": 28,  # Best seller burger
            "BUR-02": 22,  # Popular chicken sandwich
            "PIZ-01": 25,  # Top seller pizza
            "PAS-01": 15,  # Pasta
            "SID-01": 35,  # Fries (very common add-on)
            "STA-01": 12,  # Caesar salad
            "BEV-01": 20,  # Matcha latte
            "BEV-02": 26,  # Cold brew (high volume all day)
            "DES-01": 16,  # Lava cake (dinner favorite)
        }

        # Daily sales tracking per item: {date: {item_id: quantity_sold}}
        daily_item_sales = {}

        # Loop through each of the 30 days
        for day_offset in range(30):
            current_day = (start_date + timedelta(days=day_offset)).date()
            daily_item_sales[current_day] = {item.id: 0 for item in menu_map.values()}

            # Day of week seasonality
            # 0=Monday, ..., 4=Friday, 5=Saturday, 6=Sunday
            dow = current_day.weekday()
            is_weekend = dow in (4, 5, 6)

            # Weekends have 1.6x - 2.0x the customer footfall
            if is_weekend:
                num_orders_today = random.randint(75, 115)
            else:
                num_orders_today = random.randint(38, 62)

            # Slight upward 30-day month trend (growth in restaurant popularity)
            growth_factor = 1.0 + (day_offset / 30.0) * 0.18
            num_orders_today = int(num_orders_today * growth_factor)

            for order_idx in range(num_orders_today):
                total_orders_created += 1

                # Realistic meal rush timing distribution:
                # 42% Lunch (11:45 - 14:15)
                # 46% Dinner (18:00 - 21:30)
                # 12% Afternoon/Late (14:30 - 17:30, 21:30 - 22:30)
                rush_choice = random.random()
                if rush_choice < 0.42:
                    hour = random.randint(11, 14)
                    minute = random.randint(0, 59)
                elif rush_choice < 0.88:
                    hour = random.randint(18, 21)
                    minute = random.randint(0, 59)
                else:
                    hour = random.choice([15, 16, 17, 22])
                    minute = random.randint(0, 59)

                second = random.randint(0, 59)
                order_time = datetime(
                    current_day.year, current_day.month, current_day.day, hour, minute, second
                )

                # Order types & payment methods
                order_type = random.choices(
                    [OrderType.DINE_IN, OrderType.TAKEAWAY, OrderType.DELIVERY],
                    weights=[55, 30, 15],
                    k=1,
                )[0]

                pay_method = random.choices(
                    [PaymentMethod.CARD, PaymentMethod.UPI, PaymentMethod.CASH, PaymentMethod.DIGITAL_WALLET],
                    weights=[45, 25, 20, 10],
                    k=1,
                )[0]

                assigned_cashier = random.choice(cashiers)
                table_no = random.randint(1, 24) if order_type == OrderType.DINE_IN else None
                order_number = f"ORD-{current_day.strftime('%Y%m%d')}-{total_orders_created:04d}"

                order = Order(
                    order_number=order_number,
                    user_id=assigned_cashier.id,
                    customer_name=f"Guest #{random.randint(100, 999)}",
                    table_number=table_no,
                    order_type=order_type,
                    status=OrderStatus.COMPLETED,
                    payment_method=pay_method,
                    payment_status=PaymentStatus.PAID,
                    subtotal=Decimal("0.00"),
                    tax_amount=Decimal("0.00"),
                    discount_amount=Decimal("0.00"),
                    total_amount=Decimal("0.00"),
                    created_at=order_time,
                )
                db.add(order)
                db.flush()  # to obtain order.id

                # Pick 1 to 4 items for this ticket
                num_distinct_items = random.choices([1, 2, 3, 4], weights=[25, 45, 20, 10], k=1)[0]
                
                # Boost beverage and dessert probabilities in evening dinner rush
                weights = []
                menu_item_list = list(menu_map.values())
                for mi in menu_item_list:
                    w = item_base_popularity[mi.code]
                    if hour >= 18 and mi.category in (ItemCategory.DESSERTS, ItemCategory.BEVERAGES):
                        w *= 1.4
                    if hour in (12, 13) and mi.category == ItemCategory.MAIN_COURSE:
                        w *= 1.3
                    weights.append(w)

                chosen_items = random.choices(menu_item_list, weights=weights, k=num_distinct_items)
                chosen_items = list({it.code: it for it in chosen_items}.values())  # deduplicate items in order

                order_subtotal = Decimal("0.00")
                for chosen_item in chosen_items:
                    qty = random.choices([1, 2, 3], weights=[75, 20, 5], k=1)[0]
                    line_price = chosen_item.price
                    line_subtotal = Decimal(str(qty)) * line_price
                    order_subtotal += line_subtotal

                    order_item = OrderItem(
                        order_id=order.id,
                        menu_item_id=chosen_item.id,
                        quantity=qty,
                        unit_price=line_price,
                        subtotal=line_subtotal,
                        created_at=order_time,
                    )
                    db.add(order_item)
                    total_order_items_created += 1

                    # Track aggregate sales for ML demand forecasting
                    daily_item_sales[current_day][chosen_item.id] += qty

                # 5% chance of 10% promo discount
                discount = Decimal("0.00")
                if random.random() < 0.08:
                    discount = (order_subtotal * Decimal("0.10")).quantize(Decimal("0.01"))

                tax = ((order_subtotal - discount) * Decimal("0.0825")).quantize(Decimal("0.01"))  # 8.25% sales tax
                total = order_subtotal - discount + tax

                order.subtotal = order_subtotal
                order.discount_amount = discount
                order.tax_amount = tax
                order.total_amount = total

            # Commit day's batch
            db.commit()

        print(f"      Created {total_orders_created} Orders and {total_order_items_created} OrderItems across 30 days.")

        # -------------------------------------------------------------
        # 7. Seed Inventory Stock Consumption Logs
        # -------------------------------------------------------------
        print("\n[Bonus] Deducting Raw Ingredients via Recipes & Logging Inventory Consumption...")
        # Calculate total ingredients consumed over 30 days
        ingredient_consumption = {sku: 0.0 for sku in inv_map.keys()}

        for rec in recipe_entities:
            # Find which menu item this is
            total_qty_sold = sum(
                daily_item_sales[d].get(rec.menu_item_id, 0)
                for d in daily_item_sales
            )
            ing_used = total_qty_sold * rec.quantity_required
            # find sku
            for sku, inv in inv_map.items():
                if inv.id == rec.inventory_item_id:
                    ingredient_consumption[sku] += ing_used
                    break

        # Log periodic restocking and actual current stock
        for sku, inv in inv_map.items():
            consumed = ingredient_consumption[sku]
            # Restock was made 2 times in the month
            restocked_amount = consumed * 1.35  # enough buffer
            log_restock = InventoryLog(
                inventory_item_id=inv.id,
                change_amount=round(restocked_amount, 2),
                transaction_type=InventoryTransactionType.RESTOCK,
                reference_id=f"PO-SUPPLIER-BATCH-{sku}",
                notes="Bi-weekly bulk inventory restock shipment received",
                created_at=datetime.now() - timedelta(days=15),
            )
            log_deduction = InventoryLog(
                inventory_item_id=inv.id,
                change_amount=-round(consumed, 2),
                transaction_type=InventoryTransactionType.SALE_CONSUMPTION,
                reference_id="30D-AGGREGATE-SALES",
                notes="Automatic depletion from POS order sales via recipe bill of materials",
                created_at=datetime.now() - timedelta(hours=2),
            )
            db.add_all([log_restock, log_deduction])

            # Update current stock realistic level
            inv.current_stock = max(round(inv.current_stock - consumed + (restocked_amount * 0.4), 2), round(inv.minimum_threshold * 1.2, 2))
        
        db.commit()
        print("      Created inventory consumption ledger logs & synchronized stock.")

        # -------------------------------------------------------------
        # 8. Seed Demand Forecasts (Historical & 7-Day Future Predictions)
        # -------------------------------------------------------------
        print("\n[AI Engine] Seeding Historical Evaluated Forecasts and 7-Day Future AI Projections...")
        forecast_count = 0

        # We will populate forecasts for:
        # - Past 14 days: Predicted vs Actual (for model monitoring, MAE, MAPE evaluation)
        # - Next 7 days: Future Predictions (for kitchen preparation & smart reordering)
        all_dates_past = sorted(list(daily_item_sales.keys()))[-14:]  # last 14 days
        future_dates = [date.today() + timedelta(days=i) for i in range(1, 8)]

        for item in menu_map.values():
            base_demand = item_base_popularity[item.code]

            # 1. Past 14 Days Forecast Records (with Actuals)
            for d in all_dates_past:
                actual = float(daily_item_sales[d].get(item.id, 0))
                # Realistic model error (MAE around 8-12%)
                error_margin = random.uniform(-0.12, 0.14)
                predicted = max(5.0, round(actual * (1.0 + error_margin), 1))
                lower_bound = max(0.0, round(predicted * 0.82, 1))
                upper_bound = round(predicted * 1.18, 1)

                features = {
                    "day_of_week": d.weekday(),
                    "is_weekend": d.weekday() in (4, 5, 6),
                    "rolling_7d_mean": round(actual * 0.95, 2),
                    "lag_7d_actual": actual,
                }

                fc = DemandForecast(
                    menu_item_id=item.id,
                    forecast_date=d,
                    predicted_quantity=predicted,
                    actual_quantity=actual,
                    confidence_lower=lower_bound,
                    confidence_upper=upper_bound,
                    model_version="RandomForestRegressor_v1.0",
                    features_used=features,
                    created_at=datetime.combine(d - timedelta(days=1), datetime.min.time()),
                )
                db.add(fc)
                forecast_count += 1

            # 2. Next 7 Future Days Forecast Records (Actual is NULL)
            for d in future_dates:
                dow = d.weekday()
                weekend_multiplier = 1.65 if dow in (4, 5, 6) else 1.0
                future_predicted = round(base_demand * weekend_multiplier * random.uniform(0.92, 1.08), 1)
                lower_bound = round(future_predicted * 0.80, 1)
                upper_bound = round(future_predicted * 1.20, 1)

                features = {
                    "day_of_week": dow,
                    "is_weekend": dow in (4, 5, 6),
                    "projected_weather": random.choice(["Sunny", "Cloudy", "Rainy"]),
                    "growth_trend": "+4.2%",
                }

                fc = DemandForecast(
                    menu_item_id=item.id,
                    forecast_date=d,
                    predicted_quantity=future_predicted,
                    actual_quantity=None,  # Pending future sales!
                    confidence_lower=lower_bound,
                    confidence_upper=upper_bound,
                    model_version="RandomForestRegressor_v1.0",
                    features_used=features,
                    created_at=datetime.now(),
                )
                db.add(fc)
                forecast_count += 1

        db.commit()
        print(f"      Created {forecast_count} Demand Forecast entries (14 days historical + 7 days future).")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Database seeding failed: {e}")
        raise e
    finally:
        db.close()

    print("\n" + "=" * 70)
    print("   RESTOAI SEED DATA GENERATION COMPLETE!   ")
    print(f"   Summary:")
    print(f"   - Users:              {len(users_data)} (Admin, Manager, Cashiers)")
    print(f"   - Raw Ingredients:    {len(inv_map)} items with reorder alert thresholds")
    print(f"   - Menu Items:         {len(menu_map)} signature recipes")
    print(f"   - Bill of Materials:  {len(recipe_entities)} item-to-ingredient mappings")
    print(f"   - 30-Day POS Orders:  {total_orders_created} transactions ({total_order_items_created} line items)")
    print(f"   - Demand Forecasts:   {forecast_count} predictions (past evaluations + 7-day future)")
    print("=" * 70)


if __name__ == "__main__":
    seed_database()
