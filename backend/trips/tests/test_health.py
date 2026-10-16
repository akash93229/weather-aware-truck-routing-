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


@pytest.mark.django_db
def test_openapi_schema_endpoint(client):
    """Test that GET /api/schema/ returns OpenAPI specification."""
    response = client.get('/api/schema/')
    assert response.status_code == 200
    assert 'openapi' in response.content.decode('utf-8')


@pytest.mark.django_db
def test_swagger_docs_endpoint(client):
    """Test that GET /api/docs/ returns Swagger UI."""
    response = client.get('/api/docs/')
    assert response.status_code == 200
    assert 'swagger-ui' in response.content.decode('utf-8').lower()
