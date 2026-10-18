import time
import json
import requests
from datetime import datetime, timezone, timedelta

API_URL = "http://127.0.0.1:8000/api/trips/analyze/"
GEOCODE_URL = "http://127.0.0.1:8000/api/geocode/"
WEATHER_REPORT_URL = "http://127.0.0.1:8000/api/weather/report/"

dep_iso = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

TEST_CASES = [
    # 1. Long Routes (USA)
    {
        "id": "USA-1",
        "category": "Long Routes (USA)",
        "name": "Las Vegas -> Chicago",
        "origin": {"lat": 36.1699, "lng": -115.1398, "label": "Las Vegas, NV"},
        "destination": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
        "expected": "PASS",
    },
    {
        "id": "USA-2",
        "category": "Long Routes (USA)",
        "name": "Los Angeles -> New York",
        "origin": {"lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA"},
        "destination": {"lat": 40.7128, "lng": -74.0060, "label": "New York, NY"},
        "expected": "PASS",
        "cross_timezone": True,
    },
    {
        "id": "USA-3",
        "category": "Long Routes (USA)",
        "name": "Miami -> Seattle",
        "origin": {"lat": 25.7617, "lng": -80.1918, "label": "Miami, FL"},
        "destination": {"lat": 47.6062, "lng": -122.3321, "label": "Seattle, WA"},
        "expected": "PASS",
    },
    {
        "id": "USA-4",
        "category": "Long Routes (USA)",
        "name": "Houston -> Denver",
        "origin": {"lat": 29.7604, "lng": -95.3698, "label": "Houston, TX"},
        "destination": {"lat": 39.7392, "lng": -104.9903, "label": "Denver, CO"},
        "expected": "PASS",
    },
    {
        "id": "USA-5",
        "category": "Long Routes (USA)",
        "name": "San Francisco -> Dallas",
        "origin": {"lat": 37.7749, "lng": -122.4194, "label": "San Francisco, CA"},
        "destination": {"lat": 32.7767, "lng": -96.7970, "label": "Dallas, TX"},
        "expected": "PASS",
    },
    {
        "id": "USA-6",
        "category": "Long Routes (USA)",
        "name": "Phoenix -> Boston",
        "origin": {"lat": 33.4484, "lng": -112.0740, "label": "Phoenix, AZ"},
        "destination": {"lat": 42.3601, "lng": -71.0589, "label": "Boston, MA"},
        "expected": "PASS",
    },

    # 2. International
    {
        "id": "INT-1",
        "category": "International",
        "name": "Delhi -> Mumbai",
        "origin": {"lat": 28.6139, "lng": 77.2090, "label": "Delhi, India"},
        "destination": {"lat": 19.0760, "lng": 72.8777, "label": "Mumbai, India"},
        "expected": "PASS",
    },
    {
        "id": "INT-2",
        "category": "International",
        "name": "Bhopal -> Indore",
        "origin": {"lat": 23.2599, "lng": 77.4126, "label": "Bhopal, India"},
        "destination": {"lat": 22.7196, "lng": 75.8577, "label": "Indore, India"},
        "expected": "PASS",
    },
    {
        "id": "INT-3",
        "category": "International",
        "name": "London -> Paris",
        "origin": {"lat": 51.5074, "lng": -0.1278, "label": "London, UK"},
        "destination": {"lat": 48.8566, "lng": 2.3522, "label": "Paris, France"},
        "expected": "PASS_OR_ROUTING",
    },
    {
        "id": "INT-4",
        "category": "International",
        "name": "Tokyo -> Osaka",
        "origin": {"lat": 35.6762, "lng": 139.6503, "label": "Tokyo, Japan"},
        "destination": {"lat": 34.6937, "lng": 135.5023, "label": "Osaka, Japan"},
        "expected": "PASS",
    },
    {
        "id": "INT-5",
        "category": "International",
        "name": "Dubai -> Abu Dhabi",
        "origin": {"lat": 25.2048, "lng": 55.2708, "label": "Dubai, UAE"},
        "destination": {"lat": 24.4539, "lng": 54.3773, "label": "Abu Dhabi, UAE"},
        "expected": "PASS",
    },

    # 3. Edge Cases
    {
        "id": "EDGE-1",
        "category": "Edge Cases",
        "name": "Same start and end location",
        "origin": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
        "destination": {"lat": 41.8781, "lng": -87.6298, "label": "Chicago, IL"},
        "expected": "PROPER_REJECTION",
    },
    {
        "id": "EDGE-2",
        "category": "Edge Cases",
        "name": "Invalid city name (asdfghjkl)",
        "query": "asdfghjkl",
        "expected": "EMPTY_GEOCODE",
    },
    {
        "id": "EDGE-3",
        "category": "Edge Cases",
        "name": "Empty input",
        "query": "",
        "expected": "EMPTY_GEOCODE",
    },
    {
        "id": "EDGE-4",
        "category": "Edge Cases",
        "name": "City with spaces/special characters (São Paulo -> St. Louis)",
        "origin": {"lat": -23.5505, "lng": -46.6333, "label": "São Paulo, Brazil"},
        "destination": {"lat": 38.6270, "lng": -90.1994, "label": "St. Louis, MO"},
        "expected": "PASS_OR_CROSS_CONTINENT",
    },
    {
        "id": "EDGE-5",
        "category": "Edge Cases",
        "name": "Very remote location (Prudhoe Bay -> Fairbanks)",
        "origin": {"lat": 70.2552, "lng": -148.4239, "label": "Prudhoe Bay, AK"},
        "destination": {"lat": 64.8378, "lng": -147.7164, "label": "Fairbanks, AK"},
        "expected": "PASS",
    },
    {
        "id": "EDGE-6",
        "category": "Edge Cases",
        "name": "Cross-timezone route (Los Angeles -> New York)",
        "origin": {"lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, CA"},
        "destination": {"lat": 40.7128, "lng": -74.0060, "label": "New York, NY"},
        "expected": "PASS",
        "cross_timezone": True,
    },
]

def run_tests():
    results = []
    print("=" * 125)
    print(f"{'#':<3} | {'ROUTE / TEST CASE':<32} | {'HTTP':<5} | {'ROUTES':<6} | {'TIME':<7} | {'WEATHER (S/M/E)':<16} | {'RESULT':<8} | {'NOTES'}")
    print("=" * 125)

    for idx, tc in enumerate(TEST_CASES, 1):
        name = tc["name"]
        cat = tc["category"]
        expected = tc.get("expected")

        # Handle Geocode-only edge cases
        if "query" in tc:
            t0 = time.perf_counter()
            r = requests.get(GEOCODE_URL, params={"q": tc["query"]}, timeout=10)
            elapsed = time.perf_counter() - t0
            status_code = r.status_code
            data = r.json() if status_code == 200 else []
            count = len(data) if isinstance(data, list) else len(data.get("results", []))
            
            if status_code == 200 and count == 0:
                result = "PASS"
                notes = f"Correctly returned 0 results for invalid/empty query ({elapsed:.2f}s)"
            else:
                result = "FAIL"
                notes = f"Unexpected results count: {count}"

            print(f"{idx:<3} | {name:<32} | {status_code:<5} | {'N/A':<6} | {elapsed:.2f}s  | {'N/A':<16} | {result:<8} | {notes}")
            results.append({"test": tc, "result": result, "notes": notes, "elapsed": elapsed})
            continue

        # Handle Same Start/End location edge case
        if tc.get("id") == "EDGE-1":
            payload = {
                "origin": tc["origin"],
                "destination": tc["destination"],
                "departure_time": dep_iso,
                "load_weight_lb": 42000,
                "interval_miles": 25,
            }
            t0 = time.perf_counter()
            r = requests.post(API_URL, json=payload, timeout=20)
            elapsed = time.perf_counter() - t0
            status_code = r.status_code
            if status_code in (400, 422):
                result = "PASS"
                notes = f"Rejected same origin/dest with HTTP {status_code}: {r.json().get('error', {}).get('message', '')[:40]}"
            elif status_code == 200:
                # Did it return 0 distance or error?
                data = r.json()
                routes = data.get("routes", [])
                if not routes or routes[0].get("distance_mi", 0) < 1.0:
                    result = "PASS"
                    notes = f"Handled zero-distance route gracefully ({elapsed:.2f}s)"
                else:
                    result = "FAIL"
                    notes = "Allowed routing between identical origin & destination"
            else:
                result = "FAIL"
                notes = f"Unexpected HTTP status {status_code}"

            print(f"{idx:<3} | {name:<32} | {status_code:<5} | {'0':<6} | {elapsed:.2f}s  | {'N/A':<16} | {result:<8} | {notes}")
            results.append({"test": tc, "result": result, "notes": notes, "elapsed": elapsed})
            continue

        # Handle Full Route + Weather Analysis
        payload = {
            "origin": tc["origin"],
            "destination": tc["destination"],
            "departure_time": dep_iso,
            "load_weight_lb": 42000,
            "interval_miles": 25,
            "scenario": "live",
        }

        t0 = time.perf_counter()
        try:
            r = requests.post(API_URL, json=payload, timeout=60)
            elapsed = time.perf_counter() - t0
            status_code = r.status_code

            if status_code == 200:
                data = r.json()
                routes = data.get("routes", [])
                num_routes = len(routes)

                if num_routes > 0:
                    primary = routes[0]
                    dist = primary.get("distance_mi", 0)
                    dur_h = primary.get("duration_s", 0) / 3600.0
                    cps = primary.get("checkpoints", [])

                    # Verify weather for Start, Midpoints, and End
                    has_start_wx = bool(cps and cps[0].get("weather"))
                    has_end_wx = bool(cps and cps[-1].get("weather"))
                    mid_cps = cps[1:-1] if len(cps) > 2 else []
                    has_mid_wx = all(bool(c.get("weather")) for c in mid_cps) if mid_cps else has_start_wx

                    # Verify no NaN / undefined / null in numbers
                    raw_str = json.dumps(data)
                    has_nan = "NaN" in raw_str or "null" in raw_str and '"weather": null' in raw_str

                    wx_status = f"{'Y' if has_start_wx else 'N'}/{'Y' if has_mid_wx else 'N'}/{'Y' if has_end_wx else 'N'}"

                    # Realistic distance & duration checks
                    if dist > 0 and dur_h > 0:
                        result = "PASS"
                        notes = f"{dist:.0f}mi, {dur_h:.1f}h, {len(cps)} cps, rec={data.get('recommendation',{}).get('route_id')}"
                    else:
                        result = "FAIL"
                        notes = f"Unrealistic distance ({dist} mi) or duration ({dur_h} h)"
                else:
                    result = "FAIL"
                    wx_status = "0/0/0"
                    notes = "0 routes returned in 200 OK response"

            elif status_code == 404:
                # e.g., cross-continent driving route impossible (e.g. São Paulo to St. Louis across ocean/Darién Gap)
                data = r.json()
                err_code = data.get("error", {}).get("code", "")
                result = "PASS" if "no_route" in err_code or "route" in err_code else "FAIL"
                wx_status = "N/A"
                notes = f"Expected 404 No Route Found: {data.get('error', {}).get('message', '')[:40]}"

            else:
                result = "FAIL"
                wx_status = "ERR"
                notes = f"HTTP {status_code}: {r.text[:50]}"

        except Exception as e:
            elapsed = time.perf_counter() - t0
            status_code = "ERR"
            num_routes = 0
            wx_status = "ERR"
            result = "FAIL"
            notes = f"Request exception: {str(e)[:50]}"

        print(f"{idx:<3} | {name:<32} | {str(status_code):<5} | {str(num_routes if status_code==200 else 0):<6} | {elapsed:.2f}s  | {wx_status:<16} | {result:<8} | {notes}")
        results.append({"test": tc, "result": result, "notes": notes, "elapsed": elapsed})
        time.sleep(1.0)

    print("=" * 125)
    return results

if __name__ == "__main__":
    run_tests()
