from django.urls import re_path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)
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
    re_path(r'^schema/?$', SpectacularAPIView.as_view(), name='schema'),
    re_path(r'^docs/?$', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
