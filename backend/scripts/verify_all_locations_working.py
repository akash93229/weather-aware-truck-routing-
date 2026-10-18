import sys
import time
import json
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

GEOCODE_URL = "http://127.0.0.1:8000/api/geocode/"
ANALYZE_URL = "http://127.0.0.1:8000/api/trips/analyze/"

dep_iso = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

ALL_CORRIDORS = [
    # 1. Long Routes (USA)
    {"name": "Las Vegas -> Chicago", "orig": "Las Vegas, NV", "dest": "Chicago, IL", "category": "Long Routes (USA)"},
    {"name": "Los Angeles -> New York", "orig": "Los Angeles, CA", "dest": "New York, NY", "category": "Long Routes (USA)"},
    {"name": "Miami -> Seattle", "orig": "Miami, FL", "dest": "Seattle, WA", "category": "Long Routes (USA)"},
    {"name": "Houston -> Denver", "orig": "Houston, TX", "dest": "Denver, CO", "category": "Long Routes (USA)"},
    {"name": "San Francisco -> Dallas", "orig": "San Francisco, CA", "dest": "Dallas, TX", "category": "Long Routes (USA)"},
    {"name": "Phoenix -> Boston", "orig": "Phoenix, AZ", "dest": "Boston, MA", "category": "Long Routes (USA)"},
    
    # 2. International Routes
    {"name": "Delhi -> Mumbai", "orig": "Delhi, India", "dest": "Mumbai, India", "category": "International"},
    {"name": "Bhopal -> Indore", "orig": "Bhopal, India", "dest": "Indore, India", "category": "International"},
    {"name": "London -> Paris", "orig": "London, UK", "dest": "Paris, France", "category": "International"},
    {"name": "Tokyo -> Osaka", "orig": "Tokyo, Japan", "dest": "Osaka, Japan", "category": "International"},
    {"name": "Dubai -> Abu Dhabi", "orig": "Dubai, UAE", "dest": "Abu Dhabi, UAE", "category": "International"},
    
    # 3. New & Replacement Corridors
    {"name": "São Paulo -> Rio de Janeiro", "orig": "São Paulo, Brazil", "dest": "Rio de Janeiro, Brazil", "category": "South America"},
    {"name": "St. Louis -> Chicago", "orig": "St. Louis, MO", "dest": "Chicago, IL", "category": "Regional USA"},
    {"name": "Chicago -> Las Vegas (Reverse)", "orig": "Chicago, IL", "dest": "Las Vegas, NV", "category": "Reverse Corridor"},
    {"name": "Prudhoe Bay -> Fairbanks (Remote)", "orig": "Prudhoe Bay, AK", "dest": "Fairbanks, AK", "category": "Remote Corridor"},
    
    # 4. Ocean Gap Edge Case
    {"name": "Honolulu -> Los Angeles (Ocean Gap)", "orig": "Honolulu, HI", "dest": "Los Angeles, CA", "category": "Ocean Gap", "expected_status": 404},
]

def verify_all():
    print("=" * 140, flush=True)
    print("VERIFYING ALL LOCATIONS AND CORRIDORS END-TO-END", flush=True)
    print("=" * 140, flush=True)

    summary_results = []

    for idx, c in enumerate(ALL_CORRIDORS, 1):
        name = c["name"]
        orig_q = c["orig"]
        dest_q = c["dest"]
        expected_status = c.get("expected_status", 200)

        # Step 1: Test Geocoding for Origin
        r_orig = requests.get(GEOCODE_URL, params={"q": orig_q}, timeout=10)
        orig_items = r_orig.json() if r_orig.status_code == 200 else []
        if not orig_items:
            print(f"[{idx:02d}] {name:<35} | Origin Geocode FAIL for '{orig_q}'", flush=True)
            continue
        orig_pt = orig_items[0]

        # Step 2: Test Geocoding for Destination
        r_dest = requests.get(GEOCODE_URL, params={"q": dest_q}, timeout=10)
        dest_items = r_dest.json() if r_dest.status_code == 200 else []
        if not dest_items:
            print(f"[{idx:02d}] {name:<35} | Destination Geocode FAIL for '{dest_q}'", flush=True)
            continue
        dest_pt = dest_items[0]

        # Step 3: Analyze Route & Weather
        payload = {
            "origin": {"lat": orig_pt["lat"], "lng": orig_pt["lng"], "label": orig_pt.get("label", orig_q)},
            "destination": {"lat": dest_pt["lat"], "lng": dest_pt["lng"], "label": dest_pt.get("label", dest_q)},
            "departure_time": dep_iso,
            "load_weight_lb": 42000,
            "interval_miles": 25,
            "scenario": "live",
        }

        # Stage 1: Progressive Route
        t_stage1_start = time.perf_counter()
        r_fast = requests.post(f"{ANALYZE_URL}?stage=routes", json=payload, timeout=10)
        t_stage1 = time.perf_counter() - t_stage1_start

        if expected_status == 404:
            if r_fast.status_code == 404:
                status = "PASS (Expected HTTP 404 Ocean Gap)"
                details = f"Gracefully rejected impossible ocean route in {t_stage1:.2f}s"
            else:
                status = "FAIL"
                details = f"Expected HTTP 404 but got {r_fast.status_code}"
            print(f"[{idx:02d}] {name:<35} | Stg1: {t_stage1:.2f}s | {status} | {details}", flush=True)
            summary_results.append({
                "num": idx, "name": name, "orig": orig_q, "dest": dest_q,
                "status": status, "miles": 0, "duration": "N/A", "mph": 0,
                "t_stage1": round(t_stage1, 2), "t_full": round(t_stage1, 2),
                "weather": "N/A", "checkpoints": 0,
            })
            continue

        # Stage 2: Enriched Weather
        t_full_start = time.perf_counter()
        r_full = requests.post(ANALYZE_URL, json=payload, timeout=40)
        t_full = time.perf_counter() - t_full_start

        if r_full.status_code == 200:
            data = r_full.json()
            routes = data.get("routes", [])
            primary = routes[0] if routes else {}
            dist_mi = primary.get("distance_mi", 0)
            dur_s = primary.get("duration_s", 0)
            dur_h = dur_s / 3600.0
            dur_str = f"{int(dur_h)}h {int((dur_h % 1) * 60)}m"
            avg_mph = (dist_mi / dur_h) if dur_h > 0 else 0
            cps = primary.get("checkpoints", [])

            # Check weather at start, mid, end
            wx_points = [cp["weather"] for cp in cps if cp.get("weather")]
            temps = [w["temp_f"] for w in wx_points if w.get("temp_f") is not None]
            temp_range = f"{min(temps):.0f}°F - {max(temps):.0f}°F" if temps else "N/A"

            status = "PASS"
            details = f"{dist_mi:.1f} mi, {dur_str}, {avg_mph:.1f} mph | {len(cps)} cps | Temp: {temp_range} | Stg1: {t_stage1:.2f}s | Full: {t_full:.2f}s"
        else:
            status = "FAIL"
            details = f"HTTP {r_full.status_code}: {r_full.text[:80]}"
            dist_mi, dur_str, avg_mph, temp_range, cps = 0, "0", 0, "N/A", []

        print(f"[{idx:02d}] {name:<35} | Stg1: {t_stage1:.2f}s | Full: {t_full:.2f}s | {status} | {details}", flush=True)

        summary_results.append({
            "num": idx,
            "name": name,
            "orig": orig_q,
            "dest": dest_q,
            "status": status,
            "miles": round(dist_mi, 1),
            "duration": dur_str,
            "mph": round(avg_mph, 1),
            "t_stage1": round(t_stage1, 2),
            "t_full": round(t_full, 2),
            "weather": temp_range,
            "checkpoints": len(cps),
        })

    with open("all_locations_verified.json", "w", encoding="utf-8") as f:
        json.dump(summary_results, f, indent=2)

    print("\nALL LOCATIONS VERIFICATION COMPLETE! Saved to all_locations_verified.json", flush=True)

if __name__ == "__main__":
    verify_all()
