import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from datetime import datetime, timezone
from trips.services.routing.service import get_routes
from trips.services.checkpoints import generate_checkpoints

origin = (40.7128, -74.0060)
destination = (41.8781, -87.6298)
departure_time = datetime.now(timezone.utc)

routes_res = get_routes(origin, destination)
routes = routes_res.get('routes', [])
print(f"Routes fetched: {len(routes)}, provider: {routes_res.get('provider')}")

all_points = []
route_pt_counts = []
for r in routes:
    cps = generate_checkpoints(r.points, float(r.duration_s), departure_time, interval_miles=25.0)
    route_pt_counts.append(len(cps))
    all_points.extend([cp['coordinate'] for cp in cps])

print(f"Points per route: {route_pt_counts}")
print(f"Total points requested (all 3 routes): {len(all_points)}")

rounded_01 = set((round(pt[0], 1), round(pt[1], 1)) for pt in all_points)
print(f"Unique coordinates after dedup (0.1 deg): {len(rounded_01)}")
