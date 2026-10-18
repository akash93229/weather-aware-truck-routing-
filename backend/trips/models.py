from django.db import models


class TripSearch(models.Model):
    """
    Stores recent trip searches per anonymous client browser ID.
    Capped at 50 entries per client_id with automatic eviction of older searches.
    """
    client_id = models.CharField(max_length=64, db_index=True)
    origin_label = models.CharField(max_length=255)
    origin_lat = models.FloatField()
    origin_lon = models.FloatField()
    dest_label = models.CharField(max_length=255)
    dest_lat = models.FloatField()
    dest_lon = models.FloatField()
    departure_at = models.DateTimeField(null=True, blank=True)
    max_risk_level = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client_id', '-created_at']),
        ]

    def __str__(self):
        return f"{self.origin_label} -> {self.dest_label} ({self.created_at})"
