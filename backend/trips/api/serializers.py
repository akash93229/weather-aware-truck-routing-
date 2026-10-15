"""Serializers for trips API and trip analysis."""

from datetime import datetime, timezone, timedelta
from rest_framework import serializers


class CoordinateSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lng = serializers.FloatField(min_value=-180.0, max_value=180.0)


class LocationSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lng = serializers.FloatField(min_value=-180.0, max_value=180.0)
    label = serializers.CharField(required=False, allow_blank=True, default='')


class RouteRequestSerializer(serializers.Serializer):
    """Legacy serializer for ORS POST /api/route/."""
    start = serializers.JSONField(required=False)
    end = serializers.JSONField(required=False)
    start_lat = serializers.FloatField(required=False, min_value=-90.0, max_value=90.0)
    start_lng = serializers.FloatField(required=False, min_value=-180.0, max_value=180.0)
    end_lat = serializers.FloatField(required=False, min_value=-90.0, max_value=90.0)
    end_lng = serializers.FloatField(required=False, min_value=-180.0, max_value=180.0)

    def _parse_coordinate(self, field_name, value):
        if isinstance(value, dict):
            ser = CoordinateSerializer(data=value)
            ser.is_valid(raise_exception=True)
            return ser.validated_data['lat'], ser.validated_data['lng']
        elif isinstance(value, (list, tuple)) and len(value) == 2:
            ser = CoordinateSerializer(data={'lat': value[0], 'lng': value[1]})
            ser.is_valid(raise_exception=True)
            return ser.validated_data['lat'], ser.validated_data['lng']
        raise serializers.ValidationError({field_name: 'Must be an object with lat/lng or a [lat, lng] array.'})

    def validate(self, attrs):
        start_val = attrs.get('start')
        end_val = attrs.get('end')

        if start_val is not None and end_val is not None:
            s_lat, s_lng = self._parse_coordinate('start', start_val)
            e_lat, e_lng = self._parse_coordinate('end', end_val)
        elif all(k in attrs for k in ('start_lat', 'start_lng', 'end_lat', 'end_lng')):
            s_lat, s_lng = attrs['start_lat'], attrs['start_lng']
            e_lat, e_lng = attrs['end_lat'], attrs['end_lng']
        else:
            raise serializers.ValidationError(
                'Provide either start and end objects ({lat, lng}) or start_lat, start_lng, end_lat, end_lng fields.'
            )

        return {
            'start_lat': s_lat,
            'start_lng': s_lng,
            'end_lat': e_lat,
            'end_lng': e_lng,
        }


class TripAnalyzeSerializer(serializers.Serializer):
    """
    Validates input for POST /api/trips/analyze.
    """
    origin = LocationSerializer()
    destination = LocationSerializer()
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.FloatField(min_value=1.0, max_value=80000.0)
    interval_miles = serializers.ChoiceField(choices=[10, 25, 50], default=25)
    scenario = serializers.ChoiceField(
        choices=['live', 'calm', 'storm', 'all_levels'],
        default='live',
        required=False,
    )

    def validate_departure_time(self, value):
        if value.tzinfo is None:
            dt = value.replace(tzinfo=timezone.utc)
        else:
            dt = value.astimezone(timezone.utc)

        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=16)

        # Allow slight grace for past requests within 2 hours
        if dt < now - timedelta(hours=2):
            raise serializers.ValidationError('Departure time cannot be in the past.')
        if dt > horizon:
            raise serializers.ValidationError('Departure time must be within the 16-day forecast window.')

        return dt

    def validate(self, attrs):
        orig = attrs['origin']
        dest = attrs['destination']

        if abs(orig['lat'] - dest['lat']) < 1e-4 and abs(orig['lng'] - dest['lng']) < 1e-4:
            raise serializers.ValidationError('Origin and destination cannot be the same location.')

        return attrs
