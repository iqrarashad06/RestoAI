"""
RestoAI - Training & Forecast Generation Pipeline
Loads historical order items from the DB, trains the forecasting model,
and updates the DemandForecast table with new predictions.

Run via:
    python ml_engine/train.py
"""

import os
import sys
import joblib
from datetime import date, timedelta
import pandas as pd
from sqlalchemy import func

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.core.database import SessionLocal
from backend.app.models.models import Order, OrderItem, MenuItem, DemandForecast
from ml_engine.forecast_model import RestaurantDemandForecaster


def train_and_forecast():
    print("=" * 65)
    print("   RESTOAI ML ENGINE: TRAINING & FORECAST INFERENCE PIPELINE   ")
    print("=" * 65)

    db = SessionLocal()
    try:
        # 1. Query daily sales aggregate per menu item from the DB
        print("[1/4] Extracting historical daily sales from database...")
        query = (
            db.query(
                func.date(Order.created_at).label("date"),
                OrderItem.menu_item_id,
                func.sum(OrderItem.quantity).label("quantity_sold"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .group_by(func.date(Order.created_at), OrderItem.menu_item_id)
            .all()
        )

        if not query:
            print("[Warning] No order history found in DB! Please run seed_data.py first.")
            return

        records = [
            {"date": r[0], "menu_item_id": r[1], "quantity_sold": float(r[2])}
            for r in query
        ]
        df = pd.DataFrame(records)
        print(f"      Loaded {len(df)} daily dish sales aggregate records.")

        # 2. Initialize and Train Forecasting Model
        print("\n[2/4] Engineering time-series features & training Random Forest model...")
        forecaster = RestaurantDemandForecaster(model_type="random_forest")
        X, y, clean_df = forecaster.prepare_training_data(df)

        metrics = forecaster.train(X, y)
        print("      Training Performance Metrics:")
        print(f"      - Mean Absolute Error (MAE):   {metrics['MAE']} units")
        print(f"      - Root Mean Squared Error (RMSE): {metrics['RMSE']} units")
        print(f"      - Mean Abs Percentage Error (MAPE): {metrics['MAPE']}%")

        # 3. Save Model Artifact
        os.makedirs(os.path.join(BASE_DIR, "ml_engine", "artifacts"), exist_ok=True)
        artifact_path = os.path.join(BASE_DIR, "ml_engine", "artifacts", "demand_model.joblib")
        joblib.dump(forecaster, artifact_path)
        print(f"\n[3/4] Model artifact saved to: {artifact_path}")

        # 4. Generate 7-Day Ahead Predictions for each menu item
        print("\n[4/4] Generating 7-day ahead demand projections...")
        menu_items = db.query(MenuItem).filter(MenuItem.is_available == True).all()
        today = date.today()

        forecast_records_created = 0
        for item in menu_items:
            item_history = df[df["menu_item_id"] == item.id].sort_values("date")
            if len(item_history) < 7:
                continue

            last_7_sales = item_history["quantity_sold"].tail(7).values
            rolling_mean = float(last_7_sales.mean())
            rolling_std = float(last_7_sales.std())
            lag_1 = float(last_7_sales[-1])
            lag_7 = float(last_7_sales[0])

            for step in range(1, 8):
                forecast_dt = today + timedelta(days=step)
                dow = forecast_dt.weekday()
                is_weekend = int(dow in (4, 5, 6))

                sample_input = pd.DataFrame(
                    [
                        {
                            "menu_item_id": item.id,
                            "day_of_week": dow,
                            "is_weekend": is_weekend,
                            "day_of_month": forecast_dt.day,
                            "month": forecast_dt.month,
                            "lag_1": lag_1,
                            "lag_7": lag_7,
                            "rolling_mean_7d": rolling_mean,
                            "rolling_std_7d": rolling_std,
                        }
                    ]
                )

                pred_res = forecaster.predict_with_confidence(sample_input)
                predicted_qty = float(pred_res["predicted"][0])
                lower_b = float(pred_res["lower_bound"][0])
                upper_b = float(pred_res["upper_bound"][0])

                # Upsert into DemandForecast table
                existing = (
                    db.query(DemandForecast)
                    .filter(
                        DemandForecast.menu_item_id == item.id,
                        DemandForecast.forecast_date == forecast_dt,
                        DemandForecast.model_version == "rf_production_v1.0",
                    )
                    .first()
                )

                if existing:
                    existing.predicted_quantity = predicted_qty
                    existing.confidence_lower = lower_b
                    existing.confidence_upper = upper_b
                else:
                    new_fc = DemandForecast(
                        menu_item_id=item.id,
                        forecast_date=forecast_dt,
                        predicted_quantity=predicted_qty,
                        actual_quantity=None,
                        confidence_lower=lower_b,
                        confidence_upper=upper_b,
                        model_version="rf_production_v1.0",
                        features_used={
                            "dow": dow,
                            "weekend": bool(is_weekend),
                            "rolling_7d": round(rolling_mean, 1),
                        },
                    )
                    db.add(new_fc)
                forecast_records_created += 1

                # Update autoregressive lag for next step
                lag_1 = predicted_qty

        db.commit()
        print(f"      Synchronized {forecast_records_created} forecast rows with the database.")
        print("=" * 65)
        print("   PIPELINE EXECUTION FINISHED SUCCESSFULLY   ")
        print("=" * 65)

    except Exception as e:
        db.rollback()
        print(f"[Error in ML Pipeline]: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    train_and_forecast()
