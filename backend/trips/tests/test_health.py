import pytest


@pytest.mark.django_db
def test_health_check_endpoint(client):
    """Test that GET /api/health/ returns 200 and expected payload."""
    response = client.get('/api/health/')
    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok',
        'service': 'weather-aware-truck-routing-api',
    }
