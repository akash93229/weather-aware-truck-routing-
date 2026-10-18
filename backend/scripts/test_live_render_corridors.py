import os
import sys
import time
import json
import requests
from datetime import datetime, timezone

RENDER_BASE = "https://stormlane-backend.onrender.com"
GEOCODE_URL = f"{RENDER_BASE}/api/geocode"
ANALYZE_URL = f"{RENDER_BASE}/api/trips/analyze/"

CORRIDORS = [
    {"name": "Chicago -> Dallas", "orig": "Chicago, IL", "dest": "Dallas, TX"},
    {"name": "Las Vegas -> Chicago", "orig": "Las Vegas, NV", "dest": "Chicago, IL"},
    {"name": "Los Angeles -> New York", "orig": "Los Angeles, CA", "dest": "New York, NY"},
    {"name": "Miami -> Seattle", "orig": "Miami, FL", "dest": "Seattle, WA"},
    {"name": "Houston -> Denver", "orig": "Houston, TX", "dest": "Denver, CO"},
    {"name": "San Francisco -> Dallas", "orig": "San Francisco, CA", "dest": "Dallas, TX"},
    {"name": "Chicago -> Las Vegas", "orig": "Chicago, IL", "dest": "Las Vegas, NV"},
    {"name": "St. Louis -> Chicago", "orig": "St. Louis, MO", "dest": "Chicago, IL"},
    {"name": "Sao Paulo -> Rio de Janeiro", "orig": "Sao Paulo, Brazil", "dest": "Rio de Janeiro, Brazil"},
    {"name": "Delhi -> Mumbai", "orig": "Delhi, India", "dest": "Mumbai, India"},
    {"name": "Bhopal -> Indore", "orig": "Bhopal, India", "dest": "Indore, India"},
    {"name": "London -> Paris", "orig": "London, UK", "dest": "Paris, France"},
    {"name": "Tokyo -> Osaka", "orig": "Tokyo, Japan", "dest": "Osaka, Japan"},
    {"name": "Dubai -> Abu Dhabi", "orig": "Dubai, UAE", "dest": "Abu Dhabi, UAE"},
    {"name": "Prudhoe Bay -> Fairbanks", "orig": "Prudhoe Bay, AK", "dest": "Fairbanks, AK"},
]

def run_tests():
    now_iso = datetime.now(timezone.utc).isoformat()
    results = []

    print(f"Testing 15 live corridors on Render: {RENDER_BASE}")
    print("=" * 130)

    for idx, c in enumerate(CORRIDORS, 1):
        name = c["name"]
        orig_q = c["orig"]
        dest_q = c["dest"]

        # 1. Geocode Origin & Destination
        r_o = requests.get(GEOCODE_URL, params={"q": orig_q}, timeout=15).json()
        r_d = requests.get(GEOCODE_URL, params={"q": dest_q}, timeout=15).json()

        if not r_o or not r_d:
            print(f"[{idx:02d}] {name:<30} | Geocoding failed")
            continue

        orig_pt = {"lat": r_o[0]["lat"], "lng": r_o[0]["lng"], "label": r_o[0].get("label", orig_q)}
        dest_pt = {"lat": r_d[0]["lat"], "lng": r_d[0]["lng"], "label": r_d[0].get("label", dest_q)}

        payload = {
            "origin": orig_pt,
            "destination": dest_pt,
            "departure_time": now_iso,
            "load_weight_lb": 42000,
            "interval_miles": 25,
            "scenario": "live",
        }

        # 2. Stage 1 (Fast progressive routes)
        t0_s1 = time.perf_counter()
        r_s1 = requests.post(f"{ANALYZE_URL}?stage=routes", json=payload, timeout=20)
        t_s1 = time.perf_counter() - t0_s1

        # 3. Full Analysis (Weather enriched)
        t0_full = time.perf_counter()
        r_full = requests.post(ANALYZE_URL, json=payload, timeout=45)
        t_full = time.perf_counter() - t0_full

        if r_full.status_code == 200:
            data = r_full.json()
            routes = data.get("routes", [])
            primary = routes[0] if routes else {}
            dist_mi = primary.get("distance_mi", 0)
            dur_s = primary.get("duration_s", 0)
            dur_h = dur_s / 3600.0 if dur_s else 0
            avg_mph = (dist_mi / dur_h) if dur_h > 0 else 0
            cps = primary.get("checkpoints", [])

            # Check weather fields
            has_wx_fields = True
            for cp in cps:
                wx = cp.get("weather")
                if wx is not None:
                    # check required keys
                    for k in ["wind_mph", "rain_in_hr", "snow_in_hr"]:
                        if k not in wx:
                            has_wx_fields = False
                if "risk" not in cp or "eta" not in cp:
                    has_wx_fields = False

            # Check for illegal raw NaN / undefined in serialized string
            raw_text = r_full.text
            has_nan_or_undef = "NaN" in raw_text or "undefined" in raw_text

            status = "PASS" if len(routes) >= 1 and not has_nan_or_undef and 30 <= avg_mph <= 65 else "CHECK"
            report_line = (
                f"[{idx:02d}] {name:<28} | HTTP {r_full.status_code} | {len(routes)} rts | "
                f"{dist_mi:>7.1f} mi | {dur_h:>5.1f} h | {avg_mph:>4.1f} mph | {len(cps):>3} cps | "
                f"S1: {t_s1:.2f}s | Full: {t_full:.2f}s | {status}"
            )
            print(report_line)

            results.append({
                "num": idx,
                "name": name,
                "status_code": r_full.status_code,
                "num_routes": len(routes),
                "distance_mi": round(dist_mi, 1),
                "duration_h": round(dur_h, 2),
                "avg_mph": round(avg_mph, 1),
                "checkpoints_count": len(cps),
                "stage1_seconds": round(t_s1, 2),
                "full_seconds": round(t_full, 2),
                "has_weather_fields": has_wx_fields,
                "no_nan_or_undef": not has_nan_or_undef,
                "result": status,
            })
        else:
            print(f"[{idx:02d}] {name:<28} | HTTP {r_full.status_code}: {r_full.text[:100]}")
            results.append({
                "num": idx,
                "name": name,
                "status_code": r_full.status_code,
                "result": "FAIL",
                "error": r_full.text[:200],
            })

    with open("live_render_corridors_report.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\nSaved report to live_render_corridors_report.json")

if __name__ == "__main__":
    run_tests()
