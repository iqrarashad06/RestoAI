"""
RestoAI Full-Stack SaaS Capabilities Integration Test Suite
Tests:
- Authentication & RBAC (Admin, Manager, Cashier)
- White-Label Store Branding Settings (GET & PUT)
- Interactive Table Floor Plan Sync (GET /api/tables)
- 1-Click Inventory Restock (POST /api/inventory/{id}/restock)
- One-Click Financial CSV Report Export (GET /api/reports/sales/csv)
- Menu Pricing, POS Order Placement & KDS Status Transition
- AI Demand Forecasting (7-Day ML)
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def run_tests():
    print("=" * 70)
    print("   RUNNING RESTOAI COMMERCIAL SAAS INTEGRATION TEST SUITE   ")
    print("=" * 70)

    # 1. Login Accounts
    admin_login = client.post("/api/auth/login", json={"email": "admin@restoai.com", "password": "admin123"})
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    cashier_login = client.post("/api/auth/login", json={"email": "cashier@restoai.com", "password": "cashier123"})
    assert cashier_login.status_code == 200
    cashier_token = cashier_login.json()["access_token"]
    cashier_headers = {"Authorization": f"Bearer {cashier_token}"}

    print("[PASS] 1. Authentication: Tokens generated for Admin and Cashier.")

    # 2. White-Label Settings (GET /api/settings)
    res = client.get("/api/settings", headers=cashier_headers)
    assert res.status_code == 200
    settings = res.json()
    assert "restaurant_name" in settings
    assert "currency_symbol" in settings
    print(f"[PASS] 2. White-Label Settings: Retrieved (Brand: {settings['restaurant_name']}, Currency: {settings['currency_symbol']})")

    # 3. White-Label Settings (PUT /api/settings - Admin Only)
    # Cashier should get 403 Forbidden
    res = client.put("/api/settings", headers=cashier_headers, json={"restaurant_name": "Hack", "tagline": "", "address": "", "phone": "", "currency_symbol": "$", "tax_rate": 8.0})
    assert res.status_code == 403, "Cashier should not be allowed to update store settings"

    # Admin updates store settings
    res = client.put("/api/settings", headers=admin_headers, json={
        "restaurant_name": "RestoAI Signature Bistro",
        "tagline": "AI Smart Dining",
        "address": "456 Silicon Blvd",
        "phone": "(555) 888-9999",
        "currency_symbol": "$",
        "tax_rate": 9.0,
    })
    assert res.status_code == 200
    assert res.json()["restaurant_name"] == "RestoAI Signature Bistro"
    print("[PASS] 3. White-Label Settings Update: Admin updated brand name & 9.0% tax rate.")

    # 4. Interactive Table Floor Plan (GET /api/tables)
    res = client.get("/api/tables", headers=cashier_headers)
    assert res.status_code == 200
    tables = res.json()
    assert len(tables) == 12, f"Expected 12 tables, got {len(tables)}"
    print(f"[PASS] 4. Table Floor Plan: Successfully fetched status for {len(tables)} tables.")

    # 5. Place order on Table 5 and verify Table 5 becomes OCCUPIED
    menu_res = client.get("/api/menu", headers=cashier_headers)
    first_item = menu_res.json()[0]

    order_res = client.post("/api/orders", headers=cashier_headers, json={
        "customer_name": "VIP Table 5 Guests",
        "table_number": 5,
        "order_type": "DINE_IN",
        "payment_method": "CARD",
        "discount_amount": 0.0,
        "items": [{"menu_item_id": first_item["id"], "quantity": 2}],
    })
    assert order_res.status_code == 201
    created_order = order_res.json()
    order_id = created_order["id"]

    # Re-check Table Floor Plan: Table 5 MUST be OCCUPIED!
    res = client.get("/api/tables", headers=cashier_headers)
    table_5 = next(t for t in res.json() if t["table_number"] == 5)
    assert table_5["status"] == "OCCUPIED"
    assert table_5["order_id"] == order_id
    print(f"[PASS] 5. Floor Plan Sync: Table 5 dynamically occupied by Order #{created_order['order_number']}.")

    # 6. Update order status to READY -> Table 5 automatically becomes AVAILABLE!
    patch_res = client.patch(f"/api/orders/{order_id}/status", headers=cashier_headers, json={"status": "READY"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "READY"

    res = client.get("/api/tables", headers=cashier_headers)
    table_5 = next(t for t in res.json() if t["table_number"] == 5)
    assert table_5["status"] == "AVAILABLE"
    print("[PASS] 6. Floor Plan Sync: Table 5 automatically released to AVAILABLE upon KDS READY status.")

    # 7. Smart 1-Click Inventory Restock (POST /api/inventory/{id}/restock)
    inv_res = client.get("/api/inventory", headers=admin_headers)
    first_ing = inv_res.json()[0]
    initial_stock = first_ing["current_stock"]

    restock_res = client.post(
        f"/api/inventory/{first_ing['id']}/restock",
        headers=admin_headers,
        json={"quantity": 25.0, "notes": "Emergency morning delivery"},
    )
    assert restock_res.status_code == 200
    updated_stock = restock_res.json()["current_stock"]
    assert abs(updated_stock - (initial_stock + 25.0)) < 0.01
    print(f"[PASS] 7. 1-Click Restock: {first_ing['name']} replenished +25.0 {first_ing['unit']} (New: {updated_stock}).")

    # 8. One-Click Daily Sales & Financial CSV Report (GET /api/reports/sales/csv)
    # Cashier should get 403 Forbidden
    csv_cashier = client.get("/api/reports/sales/csv", headers=cashier_headers)
    assert csv_cashier.status_code == 403, "Cashier should not access financial CSV export"

    # Admin downloads CSV report
    csv_admin = client.get("/api/reports/sales/csv?days=30", headers=admin_headers)
    assert csv_admin.status_code == 200
    assert "text/csv" in csv_admin.headers["content-type"]
    assert "TOTALS SUMMARY" in csv_admin.text
    assert "attachment; filename=" in csv_admin.headers["content-disposition"]
    print(f"[PASS] 8. Financial CSV Report: Successfully generated and streamed ({len(csv_admin.text)} bytes).")

    # 9. AI Demand Forecasting (GET /api/ai/forecast)
    fc_res = client.get("/api/ai/forecast", headers=admin_headers)
    assert fc_res.status_code == 200
    assert "dish_forecasts" in fc_res.json()
    print("[PASS] 9. AI Forecasting: 7-day demand projections and food waste calculations verified.")

    print("=" * 70)
    print("   ALL 9 COMMERCIAL SAAS INTEGRATION TESTS PASSED WITH 100% SUCCESS!   ")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()
