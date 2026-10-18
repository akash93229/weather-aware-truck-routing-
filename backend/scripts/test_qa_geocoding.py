import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from trips.services.geocoding import geocode_address
from trips.services.routing.service import get_routes

test_cities = [
    "Las Vegas", "Chicago", "Los Angeles", "New York", "Miami", "Seattle",
    "Houston", "Denver", "San Francisco", "Dallas", "Phoenix", "Boston",
    "Delhi", "Mumbai", "Bhopal", "Indore", "London", "Paris",
    "Tokyo", "Osaka", "Dubai", "Abu Dhabi",
    "asdfghjkl", "", "São Paulo", "St. Louis", "Deadhorse, AK", "Yellowknife"
]

print("=== GEOCODING TEST ===")
for city in test_cities:
    t0 = time.perf_counter()
    res = geocode_address(city)
    elapsed = time.perf_counter() - t0
    if res:
        print(f"PASS | {city:20s} -> {res[0]['label']} ({res[0]['lat']:.4f}, {res[0]['lng']:.4f}) in {elapsed:.3f}s")
    else:
        print(f"EMPTY| {city:20s} -> No result found in {elapsed:.3f}s")
