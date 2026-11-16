"""
RestoAI - Machine Learning Demand Forecasting Engine
Uses Scikit-Learn & Pandas to forecast restaurant dish demand.
Engineers time-series lag features, calendar seasonality, and rolling statistics.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from typing import Tuple, Dict, Any


class RestaurantDemandForecaster:
    """
    Time-series forecasting model for restaurant dish sales.
    Predicts next-day and 7-day quantity demanded per menu item.
    """

    def __init__(self, model_type: str = "random_forest"):
        self.model_type = model_type
        if model_type == "gradient_boosting":
            self.model = GradientBoostingRegressor(
                n_estimators=120, learning_rate=0.08, max_depth=5, random_state=42
            )
        else:
            self.model = RandomForestRegressor(
                n_estimators=100, max_depth=8, min_samples_split=3, random_state=42
            )
        self.feature_columns = []
        self.residual_std = 0.0

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Creates time-series lag features, rolling windows, and calendar indicators.
        Expects df with columns: ['date', 'menu_item_id', 'quantity_sold']
        """
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(["menu_item_id", "date"]).reset_index(drop=True)

        # 1. Calendar & Seasonality Features
        df["day_of_week"] = df["date"].dt.dayofweek
        df["is_weekend"] = df["day_of_week"].isin([4, 5, 6]).astype(int)
        df["day_of_month"] = df["date"].dt.day
        df["month"] = df["date"].dt.month

        # 2. Lag Features (grouped per menu item)
        df["lag_1"] = df.groupby("menu_item_id")["quantity_sold"].shift(1)
        df["lag_7"] = df.groupby("menu_item_id")["quantity_sold"].shift(7)

        # 3. Rolling Window Aggregations (7-day historical momentum)
        df["rolling_mean_7d"] = (
            df.groupby("menu_item_id")["quantity_sold"]
            .transform(lambda x: x.shift(1).rolling(window=7, min_periods=1).mean())
        )
        df["rolling_std_7d"] = (
            df.groupby("menu_item_id")["quantity_sold"]
            .transform(lambda x: x.shift(1).rolling(window=7, min_periods=1).std())
            .fillna(0.0)
        )

        return df

    def prepare_training_data(
        self, df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
        """Engineers features and splits into X, y while dropping NaN lags."""
        featured_df = self.create_features(df)
        clean_df = featured_df.dropna().copy()

        self.feature_columns = [
            "menu_item_id",
            "day_of_week",
            "is_weekend",
            "day_of_month",
            "month",
            "lag_1",
            "lag_7",
            "rolling_mean_7d",
            "rolling_std_7d",
        ]

        X = clean_df[self.feature_columns]
        y = clean_df["quantity_sold"]
        return X, y, clean_df

    def train(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, float]:
        """Trains the Scikit-Learn regressor and evaluates training fit."""
        self.model.fit(X, y)
        predictions = self.model.predict(X)

        mae = mean_absolute_error(y, predictions)
        rmse = float(np.sqrt(mean_squared_error(y, predictions)))
        # Mean Absolute Percentage Error (MAPE)
        mape = float(np.mean(np.abs((y - predictions) / np.maximum(y, 1))) * 100)

        # Calculate residual standard deviation for 90% confidence bands
        residuals = y - predictions
        self.residual_std = float(np.std(residuals))

        metrics = {
            "MAE": round(mae, 2),
            "RMSE": round(rmse, 2),
            "MAPE": round(mape, 2),
            "residual_std": round(self.residual_std, 2),
        }
        return metrics

    def predict_with_confidence(self, X_input: pd.DataFrame) -> np.ndarray:
        """
        Returns predictions along with lower and upper confidence bounds.
        Lower = max(0, y_hat - 1.645 * std)
        Upper = y_hat + 1.645 * std
        """
        predictions = self.model.predict(X_input[self.feature_columns])
        lower_bound = np.maximum(0, predictions - 1.645 * self.residual_std)
        upper_bound = predictions + 1.645 * self.residual_std

        return {
            "predicted": np.round(predictions, 1),
            "lower_bound": np.round(lower_bound, 1),
            "upper_bound": np.round(upper_bound, 1),
        }
