"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('trips.api.urls')),
]

handler400 = 'trips.api.exceptions.custom_400_view'
handler403 = 'trips.api.exceptions.custom_403_view'
handler404 = 'trips.api.exceptions.custom_404_view'
handler500 = 'trips.api.exceptions.custom_500_view'

