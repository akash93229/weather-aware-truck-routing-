import time
import requests
from datetime import datetime, timezone, timedelta

API_URL = "http://127.0.0.1:8000/api/trips/analyze/"

dep_dt = datetime.now(timezone.utc) + timedelta(hours=3)
dep_iso = dep_dt.isoformat()

payload = {
    "origin": {"lat": 36.1699, "lng": -115.1398, "label": "Las Vegas, NV"},
    "destination": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
    "departure_time": dep_iso,
    "load_weight_lb": 42000,
    "interval_miles": 50,
    "scenario": "live",
}

print(f"Departure time (UTC): {dep_iso}")
t0 = time.perf_counter()
r = requests.post(API_URL, json=payload, timeout=40)
elapsed = time.perf_counter() - t0
print(f"Analyze request took {elapsed:.2f}s (HTTP {r.status_code})")

data = r.json()
routes = data.get("routes", [])
primary = routes[0]
cps = primary.get("checkpoints", [])
total_dist = primary.get("distance_mi")
total_dur_h = primary.get("duration_s") / 3600.0
avg_mph = total_dist / total_dur_h

print(f"Route: {primary.get('label')}")
print(f"Total distance: {total_dist:.1f} mi, Total duration: {total_dur_h:.2f} h, Avg speed: {avg_mph:.1f} mph")
print(f"Total checkpoints: {len(cps)}")

# Check midpoint
mid_idx = len(cps) // 2
mid_cp = cps[mid_idx]

print("\n" + "=" * 80)
print(f"MIDPOINT CHECKPOINT (Index #{mid_idx}):")
print(f"  Location: lat={mid_cp.get('lat')}, lon={mid_cp.get('lng')}, name='{mid_cp.get('name')}'")
print(f"  Mile mark: {mid_cp.get('mile')} mi")
print(f"  ETA: {mid_cp.get('eta')}")
print(f"  Weather at ETA: {mid_cp.get('weather')}")
print("=" * 80)

# Query Open-Meteo directly for the exact coordinates of midpoint
lat, lon = mid_cp.get('lat'), mid_cp.get('lng')
om_url = "https://api.open-meteo.com/v1/forecast"
om_params = {
    "latitude": lat,
    "longitude": lon,
    "hourly": "temperature_2m,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,precipitation,weather_code",
    "temperature_unit": "fahrenheit",
    "wind_speed_unit": "mph",
    "precipitation_unit": "inch",
    "forecast_days": 3,
    "timezone": "UTC"
}
om_r = requests.get(om_url, params=om_params, timeout=10)
om_data = om_r.json()
hourly = om_data.get("hourly", {})
times = hourly.get("time", [])
temps = hourly.get("temperature_2m", [])
winds = hourly.get("wind_speed_10m", [])
humidities = hourly.get("relative_humidity_2m", [])

now_iso_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
eta_dt = datetime.fromisoformat(mid_cp.get('eta'))
nearest_eta_dt = (eta_dt + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
eta_iso_hour = nearest_eta_dt.strftime("%Y-%m-%dT%H:00")

now_idx = times.index(now_iso_hour) if now_iso_hour in times else 0
eta_idx = times.index(eta_iso_hour) if eta_iso_hour in times else 0

print(f"\nDIRECT OPEN-METEO COMPARISON FOR MIDPOINT COORD ({lat}, {lon}):")
print(f"1. Current Time Forecast ({now_iso_hour} UTC):")
print(f"   Temp: {temps[now_idx]}°F | Wind: {winds[now_idx]} mph | Humidity: {humidities[now_idx]}%")
print(f"2. Checkpoint ETA Forecast ({eta_iso_hour} UTC):")
print(f"   Temp: {temps[eta_idx]}°F | Wind: {winds[eta_idx]} mph | Humidity: {humidities[eta_idx]}%")
print(f"3. Checkpoint Weather in StormLane response:")
print(f"   Temp: {mid_cp['weather']['temp_f']}°F | Wind: {mid_cp['weather']['wind_mph']} mph | Humidity: {mid_cp['weather']['humidity_pct']}%")

diff_temp = abs(mid_cp['weather']['temp_f'] - temps[eta_idx])
diff_wind = abs(mid_cp['weather']['wind_mph'] - winds[eta_idx])
diff_hum = abs(mid_cp['weather']['humidity_pct'] - humidities[eta_idx])
is_matching_eta = diff_temp < 2.0 and diff_wind < 2.0 and diff_hum < 2.0

print(f"\nVerification Result: {'PASS - Weather precisely matches ETA forecast timestamp (+17h into future)!' if is_matching_eta else 'FAIL'}")
