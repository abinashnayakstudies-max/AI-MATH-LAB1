# AI Math Lab — V1 Generalized MVT Explorer

An interactive Mathematics + AI + Engineering laboratory. V1 explores the Mean Value Theorem using numerical root finding, a trained PyTorch model, and hybrid verification inside a Three.js 3D visualization.

## Project structure

```text
ai-math-lab/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── models/
│       └── mvt_model_v4.pt
└── frontend/
    ├── package.json
    ├── index.html
    └── src/
        ├── main.jsx
        └── style.css
```

## Backend

From `backend`:

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
python -m uvicorn app:app --reload
```

On Windows PowerShell, activate with:

```powershell
.venv\Scripts\Activate.ps1
```

Health check:

`http://127.0.0.1:8000/health`

The response should report:

```json
{"status":"ok","service":"AI Math Lab","model_available":true}
```

## Frontend

From `frontend`:

```bash
npm install
npm run dev
```

The frontend uses Three.js for the MVT scene and the MIT-licensed ThreeUI Community package for selected UI/visual components.

ThreeUI Community:
https://github.com/MengTo/threeui

Package:
https://www.npmjs.com/package/@designcodeio/threeui

## Current V1 flow

1. User enters `f(x)`, `a`, and `b`.
2. FastAPI parses the expression and computes `f'(x)`.
3. Numerical root finding detects MVT points.
4. The V4 PyTorch model predicts a candidate `c`.
5. The prediction is checked against the MVT residual.
6. If needed, the hybrid layer refines the prediction to a numerical MVT point.
7. The frontend renders the curve, secant, tangent, and MVT point in an interactive 3D scene.

## Note

The backend expression parser is intended for this local educational/research project. If the application is deployed publicly, replace unrestricted `sympify` input with a strict allow-list parser.
