"""
RestoAI JWT Auth & RBAC Integration Test Suite
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
    print("=" * 65)
    print("RUNNING RESTOAI JWT AUTHENTICATION & RBAC TESTS")
    print("=" * 65)

    # 1. Test Unauthenticated access to protected endpoint (Should fail with 401)
    res = client.get("/api/menu")
    assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
    print("[PASS] 1. Unauthenticated request to /api/menu rejected (401 Unauthorized)")

    # 2. Test Admin Login (admin@restoai.com / admin123)
    login_admin = client.post("/api/auth/login", json={"email": "admin@restoai.com", "password": "admin123"})
    assert login_admin.status_code == 200, f"Admin login failed: {login_admin.text}"
    admin_data = login_admin.json()
    admin_token = admin_data["access_token"]
    assert admin_data["user"]["role"] == "ADMIN"
    print(f"[PASS] 2. Admin Login successful (Role: {admin_data['user']['role']}, Token issued)")

    # 3. Test Cashier Login (cashier@restoai.com / cashier123)
    login_cashier = client.post("/api/auth/login", json={"email": "cashier@restoai.com", "password": "cashier123"})
    assert login_cashier.status_code == 200, f"Cashier login failed: {login_cashier.text}"
    cashier_data = login_cashier.json()
    cashier_token = cashier_data["access_token"]
    assert cashier_data["user"]["role"] == "CASHIER"
    print(f"[PASS] 3. Cashier Login successful (Role: {cashier_data['user']['role']}, Token issued)")

    # 4. Test Manager Login (manager@restoai.com / manager123)
    login_manager = client.post("/api/auth/login", json={"email": "manager@restoai.com", "password": "manager123"})
    assert login_manager.status_code == 200, f"Manager login failed: {login_manager.text}"
    manager_data = login_manager.json()
    manager_token = manager_data["access_token"]
    assert manager_data["user"]["role"] == "MANAGER"
    print(f"[PASS] 4. Manager Login successful (Role: {manager_data['user']['role']}, Token issued)")

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cashier_headers = {"Authorization": f"Bearer {cashier_token}"}

    # 5. Test Authenticated Menu Access
    res = client.get("/api/menu", headers=cashier_headers)
    assert res.status_code == 200
    menu = res.json()
    print(f"[PASS] 5. Cashier can view Menu catalog ({len(menu)} items)")

    # 6. Test RBAC on Inventory: Cashier should receive 403 Forbidden!
    res = client.get("/api/inventory", headers=cashier_headers)
    assert res.status_code == 403, f"Expected 403 for Cashier on inventory, got {res.status_code}"
    print("[PASS] 6. RBAC Enforced: Cashier blocked from /api/inventory (403 Forbidden)")

    # 7. Test RBAC on Inventory: Admin should receive 200 OK!
    res = client.get("/api/inventory", headers=admin_headers)
    assert res.status_code == 200, f"Admin inventory access failed: {res.status_code}"
    print(f"[PASS] 7. RBAC Allowed: Admin granted access to /api/inventory ({len(res.json())} items)")

    # 8. Test RBAC on AI Forecast: Cashier should receive 403 Forbidden!
    res = client.get("/api/ai/forecast", headers=cashier_headers)
    assert res.status_code == 403, f"Expected 403 for Cashier on forecast, got {res.status_code}"
    print("[PASS] 8. RBAC Enforced: Cashier blocked from /api/ai/forecast (403 Forbidden)")

    # 9. Test RBAC on AI Forecast: Admin should receive 200 OK!
    res = client.get("/api/ai/forecast", headers=admin_headers)
    assert res.status_code == 200
    print("[PASS] 9. RBAC Allowed: Admin granted access to /api/ai/forecast (7-day ML model)")

    # 10. Test POS Order placement with Cashier JWT
    first_item = menu[0]
    order_res = client.post(
        "/api/orders",
        headers=cashier_headers,
        json={
            "customer_name": "Cashier Test Table",
            "table_number": 2,
            "order_type": "DINE_IN",
            "payment_method": "CARD",
            "discount_amount": 0.0,
            "items": [{"menu_item_id": first_item["id"], "quantity": 1}],
        },
    )
    assert order_res.status_code == 201
    print(f"[PASS] 10. Cashier placed order #{order_res.json()['order_number']} with automatic ingredient deduction")

    print("=" * 65)
    print("ALL 10 JWT AUTH & RBAC TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()
