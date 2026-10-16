# Weather-Aware Truck Routing Application

A commercial truck routing and weather hazard intelligence platform built with **React + TypeScript** and **Python + Django REST Framework**. It helps dispatchers and commercial drivers select the safest route balancing real-time weather risk, truck load weight constraints, and travel time.

---

## 1. Architecture Overview

### Frontend Architecture
- **Framework & Language**: React, TypeScript, Vite
- **UI Components & Icons**: Material UI (`@mui/material`), Vanilla CSS Glassmorphism design tokens
- **Data Fetching & State**: TanStack Query (`@tanstack/react-query`) with Axios / Fetch API client
- **Interactive Mapping**: MapLibre GL JS via `react-map-gl`, free CARTO Dark Matter basemap
- **Risk Visualization**:
  - Multi-route GeoJSON line layers with active/recommended highlights
  - Checkpoint circle layer with color-blind-friendly risk grading (Emerald, Sky Blue, Yellow, Orange, Crimson)
  - 0-48h corridor heatmap layer with zero-network `requestAnimationFrame` local frame scrubbing
  - Recharts interactive route hazard elevation and sustained wind profile chart (`RiskProfileChart.tsx`)

### Backend Architecture
- **Framework**: Python 3.12+, Django 5+, Django REST Framework
- **API Documentation**: OpenAPI 3.0 specification & Swagger UI generated via `drf-spectacular`
- **Routing Engine**:
  - **Primary**: HERE Routing API v8 (`trips/services/routing/here.py`) with commercial truck transport mode, flexible polyline decoding (`flexpolyline`), and 3 route alternatives
  - **Fallback**: Open Source Routing Machine (`trips/services/routing/osrm.py`) with a calibrated 1.15x duration multiplier for commercial truck travel estimation
  - **Lateral Corridor Expansion**: Sideways via-point generation (±30, ±45 miles) when fewer than 3 distinct routes are returned
- **Weather Integration**: Open-Meteo forecast API (`trips/services/weather/open_meteo.py`) with hourly sustained wind (10m), wind gusts, rain rate (in/hr), snow rate (in/hr), coordinate batching, and 30-minute in-memory caching
- **Testing & Quality**: pytest, pytest-django, Ruff linting (0 errors)
- **Deployment**: Gunicorn WSGI server, WhiteNoise static asset compression, Render and Vercel deployment configurations

---

## 2. Weather Risk Engine & Load Constraints

### Base Weather Risk Thresholds
The risk level at each checkpoint is calculated on a 0 to 4 scale using lower-bound inclusive, upper-bound exclusive intervals:

| Level | Classification | Sustained Wind (mph) | Rain Rate (in/hr) | Snow Rate (in/hr) |
| :---: | :--- | :--- | :--- | :--- |
| **0** | **Low** | `< 25` | `< 0.10` | `< 0.5` |
| **1** | **Moderate** | `25.0 – 34.99` | `0.10 – 0.24` | `0.5 – 0.99` |
| **2** | **High** | `35.0 – 44.99` | `0.25 – 0.49` | `1.0 – 1.99` |
| **3** | **Severe** | `45.0 – 54.99` | `0.50 – 1.00` *(inclusive)* | `2.0 – 3.0` *(inclusive)* |
| **4** | **No Travel** | `≥ 55.0` | `> 1.00` | `> 3.0` |

### Commercial Load-Dependent Wind Overrides
Truck load rules can escalate risk, but never decrease risk:
1. **Wind ≥ 55 mph**: Triggers **No Travel (4)** for all truck load weights.
2. **Wind 45 – 54.99 mph and Load > 30,000 lbs**: Escalates to **No Travel (4)** due to severe high-profile rollover hazard.
3. **Wind 35 – 44.99 mph and Load > 40,000 lbs**: Escalates to at least **Severe (3)** due to crosswind instability.

The final checkpoint risk is evaluated as:
$$\text{Risk}_{\text{checkpoint}} = \max(\text{Wind}_{\text{adjusted}}, \text{Rain}, \text{Snow})$$

---

## 3. Route Recommendation Ranking Engine

Routes are summarized using distance-weighted checkpoint ownership: each checkpoint covers the stretch halfway to its adjacent checkpoints. Routes are ranked using a deterministic tuple comparison:

1. **Unblocked First**: Routes without No-Travel miles rank ahead of blocked routes.
2. **Fewer Severe Miles**: Routes with fewer Severe weather miles are preferred.
3. **Fewer High Miles**: Routes with fewer High risk miles are preferred.
4. **Lower Average Risk**: Mile-weighted average risk score (0 to 4).
5. **Shorter Travel Duration**: Fastest travel time in seconds.

### Recommendation Output & Explanations:
- If all generated routes contain No-Travel sections:  
  **`"No safe route at this departure time."`**
- Otherwise, a plain-English comparative rationale is returned:  
  *Example*: `"Alternative 1 avoids 41 miles of Severe weather compared with the fastest route and adds 35 minutes of travel time."`

---

## 4. API Specification & Documentation

When the backend is running, browse the interactive Swagger documentation:
- **Swagger UI**: `http://localhost:8000/api/docs/`
- **OpenAPI 3.0 Schema**: `http://localhost:8000/api/schema/`

### Key Endpoints:
1. `GET /api/health/` — Health check endpoint returning `{"status": "ok"}`.
2. `GET /api/geocode/?q={address}` — Debounced geocoding search for origin/destination (cached 24h).
3. `POST /api/trips/analyze/` — Multi-route commercial truck routing and time-aware weather risk evaluation.
4. `POST /api/heatmap/` — 0 to 48 hour corridor weather risk matrix (49 hourly frames) covering routes and lateral corridor offsets.

---

## 5. Local Setup & Execution

### Prerequisites
- Python 3.12+
- Node.js 18+ and npm

### Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py collectstatic --noinput
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

### Frontend Setup
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

---

## 6. Automated Testing & Verification

### Run Backend Tests (pytest)
```powershell
cd backend
.\.venv\Scripts\pytest
```
*Result*: 87 passed tests verifying all weather thresholds, load weight overrides, checkpoint intervals, route rankings, HERE provider decoding, and API responses.

### Run Backend Linting (Ruff)
```powershell
cd backend
.\.venv\Scripts\ruff check .
```
*Result*: All checks passed (0 errors).

### Run Frontend Tests & Build
```powershell
cd frontend
npm test
npm run build
```
*Result*: All unit tests pass, and production Vite bundle compiles cleanly with TypeScript.

---

## 7. Deployment Configuration

- **Render Full-Stack Deployment**: Configured via [render.yaml](file:///c:/Users/S%20K/Desktop/Weather/weather-aware-truck-routing-/render.yaml) with web services for Django (Gunicorn + WhiteNoise) and static site for React Vite.
- **Vercel Frontend Deployment**: Configured via [vercel.json](file:///c:/Users/S%20K/Desktop/Weather/weather-aware-truck-routing-/frontend/vercel.json) with client-side SPA rewrites.
- **Heroku / Container**: Configured via [backend/Procfile](file:///c:/Users/S%20K/Desktop/Weather/weather-aware-truck-routing-/backend/Procfile).
