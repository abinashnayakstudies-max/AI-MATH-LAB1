from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sympy as sp
import numpy as np
import torch
import torch.nn as nn
from scipy.optimize import brentq
import os

x = sp.Symbol("x")

app = FastAPI(title="AI Math Lab API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MVTModelV4(nn.Module):
    def __init__(self):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(102, 128), nn.ReLU(),
            nn.Linear(128, 64), nn.ReLU(),
            nn.Linear(64, 32), nn.ReLU(),
            nn.Linear(32, 1), nn.Sigmoid()
        )
    def forward(self, x):
        return self.network(x)

model = MVTModelV4()
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "mvt_model_v4.pt")
MODEL_AVAILABLE = False

if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
    model.eval()
    MODEL_AVAILABLE = True

class MVTRequest(BaseModel):
    expression: str = Field(..., min_length=1)
    a: float
    b: float

def find_mvt_points(expr, derivative, a, b, grid_size=300):
    f = sp.lambdify(x, expr, "numpy")
    df = sp.lambdify(x, derivative, "numpy")
    secant_slope = float((f(b) - f(a)) / (b - a))

    def equation(z):
        return float(df(z) - secant_slope)

    grid = np.linspace(a, b, grid_size)
    values = np.asarray([equation(z) for z in grid], dtype=float)
    roots = []

    for i in range(len(grid) - 1):
        y1, y2 = values[i], values[i + 1]
        if not np.isfinite(y1) or not np.isfinite(y2):
            continue
        if abs(y1) < 1e-10:
            roots.append(float(grid[i]))
        elif y1 * y2 < 0:
            try:
                root = brentq(equation, grid[i], grid[i + 1])
                if a < root < b:
                    roots.append(float(root))
            except Exception:
                pass

    unique_roots = []
    for r in roots:
        if not any(abs(r - u) < 1e-6 for u in unique_roots):
            unique_roots.append(r)
    return unique_roots, secant_slope, f, df

def create_v4_features(expr, derivative, a, b):
    f = sp.lambdify(x, expr, "numpy")
    df = sp.lambdify(x, derivative, "numpy")
    x_grid = np.linspace(a, b, 50)
    f_values = np.asarray(f(x_grid), dtype=float)
    df_values = np.asarray(df(x_grid), dtype=float)

    if not np.all(np.isfinite(f_values)):
        raise ValueError("Function produced invalid values.")
    if not np.all(np.isfinite(df_values)):
        raise ValueError("Derivative produced invalid values.")

    f_std = np.std(f_values)
    df_std = np.std(df_values)
    if f_std < 1e-10 or df_std < 1e-10:
        raise ValueError("Function variation is too small.")

    f_values = (f_values - np.mean(f_values)) / f_std
    df_values = (df_values - np.mean(df_values)) / df_std

    features = np.concatenate([f_values, df_values, [a, b]])
    if len(features) != 102:
        raise ValueError(f"Expected 102 features, got {len(features)}")
    return features

def predict_ml_c(expr, derivative, a, b):
    if not MODEL_AVAILABLE:
        raise RuntimeError("mvt_model_v4.pt was not found.")
    features = create_v4_features(expr, derivative, a, b)
    tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        relative_c = model(tensor).item()
    c_ml = a + relative_c * (b - a)
    return c_ml, relative_c

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "AI Math Lab",
        "model_available": MODEL_AVAILABLE
    }

@app.post("/mvt")
def calculate_mvt(req: MVTRequest):
    if req.a >= req.b:
        return {"error": "a must be smaller than b."}

    try:
        expression_string = req.expression.replace("^", "**")
        expr = sp.sympify(expression_string)
        derivative = sp.diff(expr, x)

        points, secant_slope, f, df = find_mvt_points(expr, derivative, req.a, req.b)
        if len(points) == 0:
            return {"error": "No MVT point was found numerically."}

        midpoint = (req.a + req.b) / 2
        canonical_c = min(points, key=lambda c: abs(c - midpoint))
        numerical_residual = abs(float(df(canonical_c) - secant_slope))

        # Curve samples for the frontend's 3D visualization.
        plot_x = np.linspace(req.a, req.b, 121)
        plot_y = np.asarray(f(plot_x), dtype=float)
        plot_points = [
            {"x": float(px), "y": float(py)}
            for px, py in zip(plot_x, plot_y)
            if np.isfinite(py)
        ]

        ml_available = False
        ml_c = ml_relative_c = ml_residual = None
        if MODEL_AVAILABLE:
            try:
                ml_c, ml_relative_c = predict_ml_c(expr, derivative, req.a, req.b)
                ml_residual = abs(float(df(ml_c) - secant_slope))
                ml_available = True
            except Exception as e:
                print("ML prediction error:", e)

        hybrid_c = hybrid_residual = None
        if ml_available:
            if ml_residual <= 1e-3:
                hybrid_c, hybrid_residual = ml_c, ml_residual
            else:
                hybrid_c = min(points, key=lambda c: abs(c - ml_c))
                hybrid_residual = abs(float(df(hybrid_c) - secant_slope))

        return {
            "expression": str(expr),
            "derivative": str(derivative),
            "a": req.a,
            "b": req.b,
            "secant_slope": secant_slope,
            "mvt_points": points,
            "canonical_c": canonical_c,
            "numerical_residual": numerical_residual,
            "ml_available": ml_available,
            "ml_c": ml_c,
            "ml_relative_c": ml_relative_c,
            "ml_residual": ml_residual,
            "hybrid_c": hybrid_c,
            "hybrid_residual": hybrid_residual,
            "plot_points": plot_points,
            "valid": req.a < canonical_c < req.b
        }
    except Exception as e:
        return {"error": f"Could not process expression: {e}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
