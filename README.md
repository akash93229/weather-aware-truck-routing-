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
Ensure your `ORS_API_KEY` is set in `backend\.env` (obtained from OpenRouteService / HeiGIT).

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

### Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/health/" -Method Get
```

### Truck Routing (POST /api/route/)
Calculates a truck route using the OpenRouteService `driving-hgv` profile:
```powershell
$body = @{
  start = @{ lat = 49.41461; lng = 8.681495 }
  end = @{ lat = 49.487459; lng = 8.466039 }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/route/" -Method Post -Body $body -ContentType "application/json"
```

**Response Format:**
```json
{
  "geometry": [[49.4146, 8.6815], "..."],
  "distance_km": 19.68,
  "duration_min": 33.05
}
```

## 5. Running Tests

Run backend unit and integration tests (mocked ORS calls):
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
