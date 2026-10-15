"""Tests for POST /api/route/ endpoint with mocked ORS responses."""

import pytest
from unittest.mock import patch, MagicMock
import requests


@pytest.fixture
def mock_ors_geojson():
    return {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [
                        [8.681495, 49.41461],
                        [8.500000, 49.45000],
                        [8.466039, 49.487459],
                    ],
                },
                'properties': {
                    'summary': {
                        'distance': 19680.5,
                        'duration': 1983.2,
                    }
                },
            }
        ],
    }


@pytest.mark.django_db
class TestRouteEndpoint:

    @patch('trips.services.ors.requests.post')
    def test_route_success(self, mock_post, client, mock_ors_geojson):
        """Test successful route creation returning converted [lat, lng] geometry."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_ors_geojson
        mock_post.return_value = mock_response

        payload = {
            'start': {'lat': 49.41461, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')

        assert response.status_code == 200
        data = response.json()
        assert 'geometry' in data
        assert data['geometry'] == [
            [49.41461, 8.681495],
            [49.45000, 8.500000],
            [49.487459, 8.466039],
        ]
        assert data['distance_km'] == 19.68
        assert data['duration_min'] == 33.05

        # Verify correct coordinates were passed to ORS as [lng, lat]
        mock_post.assert_called_once()
        sent_body = mock_post.call_args[1]['json']
        assert sent_body['coordinates'] == [
            [8.681495, 49.41461],
            [8.466039, 49.487459],
        ]

    def test_route_invalid_input(self, client):
        """Test 400 rejection on invalid latitude out of bounds."""
        payload = {
            'start': {'lat': 120.0, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')
        assert response.status_code == 400
        data = response.json()
        assert data['code'] == 'invalid_input'
        assert 'details' in data

    @patch('trips.services.ors.requests.post')
    def test_route_not_found(self, mock_post, client):
        """Test 404 response when ORS returns 404."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_post.return_value = mock_response

        payload = {
            'start': {'lat': 49.41461, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')
        assert response.status_code == 404
        data = response.json()
        assert data['code'] == 'route_not_found'

    @patch('trips.services.ors.requests.post')
    def test_route_upstream_timeout(self, mock_post, client):
        """Test 503 response when ORS times out."""
        mock_post.side_effect = requests.exceptions.Timeout('Connection timed out')

        payload = {
            'start': {'lat': 49.41461, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')
        assert response.status_code == 503
        data = response.json()
        assert data['code'] == 'upstream_unavailable'

    @patch('trips.services.ors.requests.post')
    def test_route_upstream_500(self, mock_post, client):
        """Test 503 response when ORS returns server error."""
        mock_response = MagicMock()
        mock_response.status_code = 502
        mock_post.return_value = mock_response

        payload = {
            'start': {'lat': 49.41461, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')
        assert response.status_code == 503
        data = response.json()
        assert data['code'] == 'upstream_unavailable'

    @patch('trips.services.ors.requests.post')
    def test_route_rate_limited(self, mock_post, client):
        """Test 429 response when ORS rate limit is reached."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_post.return_value = mock_response

        payload = {
            'start': {'lat': 49.41461, 'lng': 8.681495},
            'end': {'lat': 49.487459, 'lng': 8.466039},
        }
        response = client.post('/api/route/', payload, content_type='application/json')
        assert response.status_code == 429
        data = response.json()
        assert data['code'] == 'rate_limit_exceeded'
