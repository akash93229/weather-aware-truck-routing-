from django.urls import path
from trips.api.views import health_check, generate_route

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('route/', generate_route, name='generate-route'),
]
