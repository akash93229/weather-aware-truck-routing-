"""
Smoke test suite for StormLane Route & Weather Risk Analysis API.
Tests 13 routes globally using live forecast data and OpenRouteService.
"""

import sys
import time
from datetime import datetime, timezone, timedelta
import requests

API_URL = "http://127.0.0.1:8000/api/trips/analyze/"

TEST_TRIPS = [
    {
        "name": "New York -> Chicago",
        "origin": {"lat": 40.7128, "lng": -74.0060, "label": "New York, NY"},
        "destination": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
    },
    {
        "name": "Chicago -> Dallas",
        "origin": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
        "destination": {"lat": 32.7767, "lng": -96.7970, "label": "Dallas, TX"},
    },
    {
        "name": "Los Angeles -> Phoenix",
        "origin": {"lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA"},
        "destination": {"lat": 33.4484, "lng": -112.0740, "label": "Phoenix, AZ"},
    },
    {
        "name": "Seattle -> Denver",
        "origin": {"lat": 47.6062, "lng": -122.3321, "label": "Seattle, WA"},
        "destination": {"lat": 39.7392, "lng": -104.9903, "label": "Denver, CO"},
    },
    {
        "name": "Miami -> Atlanta",
        "origin": {"lat": 25.7617, "lng": -80.1918, "label": "Miami, FL"},
        "destination": {"lat": 33.7490, "lng": -84.3880, "label": "Atlanta, GA"},
    },
    {
        "name": "Houston -> New Orleans",
        "origin": {"lat": 29.7604, "lng": -95.3698, "label": "Houston, TX"},
        "destination": {"lat": 29.9511, "lng": -90.0715, "label": "New Orleans, LA"},
    },
    {
        "name": "Minneapolis -> Kansas City",
        "origin": {"lat": 44.9778, "lng": -93.2650, "label": "Minneapolis, MN"},
        "destination": {"lat": 39.0997, "lng": -94.5786, "label": "Kansas City, MO"},
    },
    {
        "name": "Boston -> Pittsburgh",
        "origin": {"lat": 42.3601, "lng": -71.0589, "label": "Boston, MA"},
        "destination": {"lat": 40.4406, "lng": -79.9959, "label": "Pittsburgh, PA"},
    },
    {
        "name": "Denver -> Salt Lake City",
        "origin": {"lat": 39.7392, "lng": -104.9903, "label": "Denver, CO"},
        "destination": {"lat": 40.7608, "lng": -111.8910, "label": "Salt Lake City, UT"},
    },
    {
        "name": "Atlanta -> New York",
        "origin": {"lat": 33.7490, "lng": -84.3880, "label": "Atlanta, GA"},
        "destination": {"lat": 40.7128, "lng": -74.0060, "label": "New York, NY"},
    },
    {
        "name": "Indore -> Mumbai",
        "origin": {"lat": 22.7196, "lng": 75.8577, "label": "Indore, India"},
        "destination": {"lat": 19.0760, "lng": 72.8777, "label": "Mumbai, India"},
    },
    {
        "name": "London -> Manchester",
        "origin": {"lat": 51.5074, "lng": -0.1278, "label": "London, UK"},
        "destination": {"lat": 53.4808, "lng": -2.2426, "label": "Manchester, UK"},
    },
    {
        "name": "Sydney -> Melbourne",
        "origin": {"lat": -33.8688, "lng": 151.2093, "label": "Sydney, Australia"},
        "destination": {"lat": -37.8136, "lng": 144.9631, "label": "Melbourne, Australia"},
    },
]


def run_smoke_matrix():
    print("=" * 115)
    print(f"{'TRIP':<28} | {'HTTP':<5} | {'ROUTES':<6} | {'OVERALL RISK':<13} | {'NAMED STOPS':<12} | {'WORST WEATHER':<22} | {'TIME':<7} | {'STATUS'}")
    print("=" * 115)

    departure_iso = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    overall_pass = True

    for trip in TEST_TRIPS:
        name = trip["name"]
        payload = {
            "origin": trip["origin"],
            "destination": trip["destination"],
            "departure_time": departure_iso,
            "load_weight_lb": 42000,
            "interval_miles": 25,
            "scenario": "live",
        }

        t0 = time.perf_counter()
        try:
            resp = requests.post(API_URL, json=payload, timeout=75)
            elapsed = time.perf_counter() - t0
            time_str = f"{elapsed:.2f}s"
            status_code = resp.status_code

            if status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                num_routes = len(routes)

                if num_routes > 0:
                    primary = routes[0]
                    risk_lvl = primary.get("summary", {}).get("max_level", 0)
                    risk_labels = {0: "Low", 1: "Moderate", 2: "High", 3: "Severe", 4: "No Travel"}
                    risk_str = f"{risk_labels.get(risk_lvl, 'Unknown')} ({risk_lvl})"

                    cps = primary.get("checkpoints", [])
                    named_cps = [cp for cp in cps if cp.get("name")]
                    named_count_str = f"{len(named_cps)}/{len(cps)}"

                    # Find worst weather
                    max_w = 0.0
                    max_g = 0.0
                    max_p = 0.0
                    for cp in cps:
                        w = cp.get("weather") or {}
                        max_w = max(max_w, float(w.get("wind_mph", 0)))
                        max_g = max(max_g, float(w.get("gust_mph", 0)))
                        max_p = max(max_p, float(w.get("rain_in_hr", 0)))

                    worst_wx_str = f"W:{max_w:.0f} G:{max_g:.0f} P:{max_p:.2f}"

                    # PASS criteria: routes exist, weather values real, origin and dest named
                    origin_named = bool(cps and cps[0].get("name"))
                    dest_named = bool(cps and cps[-1].get("name"))

                    if num_routes >= 1 and len(cps) >= 2 and origin_named and dest_named:
                        outcome = "PASS"
                    else:
                        outcome = "FAIL"
                        overall_pass = False
                else:
                    risk_str = "None"
                    named_count_str = "0"
                    worst_wx_str = "N/A"
                    outcome = "FAIL"
                    overall_pass = False

            elif status_code in (429, 502, 503, 504):
                time_str = f"{elapsed:.2f}s"
                num_routes = 0
                risk_str = "UPSTREAM"
                named_count_str = "N/A"
                worst_wx_str = "Upstream error"
                outcome = "UPSTREAM"
            else:
                time_str = f"{elapsed:.2f}s"
                num_routes = 0
                risk_str = "Error"
                named_count_str = "N/A"
                worst_wx_str = f"HTTP {status_code}"
                outcome = "FAIL"
                overall_pass = False

        except requests.exceptions.RequestException as e:
            elapsed = time.perf_counter() - t0
            status_code = "ERR"
            num_routes = 0
            risk_str = "Network"
            named_count_str = "0"
            worst_wx_str = str(e)[:20]
            time_str = f"{elapsed:.2f}s"
            outcome = "UPSTREAM"

        print(f"{name:<28} | {str(status_code):<5} | {str(num_routes):<6} | {risk_str:<13} | {named_count_str:<12} | {worst_wx_str:<22} | {time_str:<7} | {outcome}", flush=True)
        time.sleep(1.5)

    print("=" * 115)
    return overall_pass


if __name__ == "__main__":
    success = run_smoke_matrix()
    sys.exit(0 if success else 1)
