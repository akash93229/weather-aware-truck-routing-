# Weather-Aware Truck Routing

A React + Django web application that helps truck drivers select the safest route balancing weather risk, load weight constraints, and travel time.

## 1. Environment Configuration

### Backend (.env)
Copy the example file and configure environment variables:
```powershell
Copy-Item backend\.env.example backend\.env
```
Generate and populate a secure Django secret key in `backend\.env`:
```powershell
python -c "import secrets; from pathlib import Path; p = Path('backend/.env'); p.write_text(p.read_text().replace('change-me', secrets.token_urlsafe(50)))"
```
Ensure your API keys are configured in `backend\.env`:
- `TOMTOM_API_KEY`: for multi-route commercial truck routing and geocoding
- `ORS_API_KEY`: for OpenRouteService routing (optional legacy route endpoint)

### Frontend (.env)
Copy the frontend environment template:
```powershell
Copy-Item frontend\.env.example frontend\.env
```

## 2. Backend Setup and Run

Create a virtual environment, install dependencies, and start the development server:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver
```

## 3. Frontend Setup and Run

Install dependencies and start the Vite development server:
```powershell
cd frontend
npm install
npm run dev
```

## 4. API Endpoints and Testing

### Health Check (GET /api/health/)
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/health/" -Method Get
```

### Geocoding (GET /api/geocode/?q=)
Search for addresses or cities (minimum 3 characters, cached for 24 hours):
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/geocode/?q=Chicago" -Method Get | ConvertTo-Json
```

### Trip Weather Risk Analysis (POST /api/trips/analyze/)
Generates up to 3 distinct commercial truck routes (TomTom with OSRM fallback), queries hourly weather along the trip corridor at each checkpoint ETA, evaluates weather risk + load weight rules, and recommends the safest path:
```powershell
$dep = (Get-Date).ToUniversalTime().AddHours(2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$body = @{
    origin = @{ lat = 41.8781; lng = -87.6298; label = "Chicago, IL" }
    destination = @{ lat = 32.7767; lng = -96.7970; label = "Dallas, TX" }
    departure_time = $dep
    load_weight_lb = 42000
    interval_miles = 25
    scenario = "live" # options: "live", "storm", "calm"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:8000/api/trips/analyze/" -Method Post -Body $body -ContentType "application/json"
```

**Response Format:**
```json
{
  "recommendation": {
    "route_id": "route_1",
    "reasons": ["Recommended route (route_1) is the fastest option and safest path with 0.0 Severe miles and 0.00 average risk."]
  },
  "warnings": [],
  "routes": [
    {
      "id": "route_1",
      "label": "Fastest",
      "distance_mi": 973.14,
      "duration_s": 51091.0,
      "geometry": [[-87.62978, 41.8781], "..."],
      "recommended": true,
      "summary": {
        "miles_by_level": { "low": 973.14, "moderate": 0, "high": 0, "severe": 0, "no_travel": 0 },
        "avg_risk": 0.0,
        "max_level": 0,
        "blocked": false
      },
      "checkpoints": [ ... ]
    }
  ]
}
```

### Legacy Single Route (POST /api/route/)
Calculates a truck route using the OpenRouteService `driving-hgv` profile:
```powershell
$body = @{
  start = @{ lat = 49.41461; lng = 8.681495 }
  end = @{ lat = 49.487459; lng = 8.466039 }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/route/" -Method Post -Body $body -ContentType "application/json"
```

## 5. Running Tests

Run backend unit and integration tests (all mocked, no real network required):
```powershell
cd backend
.\.venv\Scripts\pytest.exe
```
Run frontend linting and production build verification:
```powershell
cd frontend
npm run lint
npm run build
```
