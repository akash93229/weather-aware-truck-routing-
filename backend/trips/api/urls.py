from django.urls import re_path
from trips.api.views import (
    health_check,
    generate_route,
    geocode_view,
    analyze_trip_view,
    heatmap_view,
)

urlpatterns = [
    re_path(r'^health/?$', health_check, name='health-check'),
    re_path(r'^route/?$', generate_route, name='generate-route'),
    re_path(r'^geocode/?$', geocode_view, name='geocode'),
    re_path(r'^trips/analyze/?$', analyze_trip_view, name='analyze-trip'),
    re_path(r'^heatmap/?$', heatmap_view, name='heatmap'),
]
