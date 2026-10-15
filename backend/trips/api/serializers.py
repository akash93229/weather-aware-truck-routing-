"""Serializers for trips API."""

from rest_framework import serializers


class CoordinateSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lng = serializers.FloatField(min_value=-180.0, max_value=180.0)


class RouteRequestSerializer(serializers.Serializer):
    """
    Validates input coordinates for route generation.
    Supports either nested start/end objects ({lat, lng}) or lists ([lat, lng])
    or top-level start_lat, start_lng, end_lat, end_lng.
    """
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
