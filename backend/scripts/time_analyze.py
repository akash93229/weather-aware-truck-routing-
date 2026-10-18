import requests
import time
from datetime import datetime, timezone, timedelta

url = 'http://127.0.0.1:8000/api/trips/analyze/'
payload = {
    'origin': {'lat': 40.7128, 'lng': -74.0060, 'label': 'New York, NY'},
    'destination': {'lat': 41.8781, 'lng': -87.6298, 'label': 'Chicago, IL'},
    'departure_time': (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    'load_weight_lb': 42000,
    'interval_miles': 25,
    'scenario': 'live',
}

t0 = time.perf_counter()
resp = requests.post(url, json=payload, timeout=60)
elapsed = time.perf_counter() - t0

print(f"Status Code: {resp.status_code}")
print(f"Elapsed Time: {elapsed:.2f} seconds")
if resp.status_code == 200:
    data = resp.json()
    routes = data.get("routes", [])
    print(f"Routes count: {len(routes)}")
    print(f"Provider used: {data.get('provider_used')}")
    print(f"Partial weather: {data.get('partial_weather')}")
    print(f"Weather unavailable: {data.get('weather_unavailable')}")
    print(f"Warnings: {data.get('warnings')}")
    rec = data.get("recommendation", {})
    print(f"Recommendation: {rec}")
    for idx, r in enumerate(routes):
        cps = r.get("checkpoints", [])
        print(f"Route {idx+1} ({r.get('id')}): {r.get('distance_mi'):.1f} mi, {r.get('duration_s')/3600:.1f} hrs, checkpoints: {len(cps)}, max_level: {r.get('summary', {}).get('max_level')}")
else:
    print("Response:", resp.text[:300])
