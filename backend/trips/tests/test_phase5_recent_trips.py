import pytest
from rest_framework.test import APIClient
from trips.models import TripSearch


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_create_and_list_recent_trips(client):
    headers = {'HTTP_X_CLIENT_ID': 'client-test-123'}

    payload = {
        'origin_label': 'Chicago, IL',
        'origin_lat': 41.8781,
        'origin_lon': -87.6298,
        'dest_label': 'Dallas, TX',
        'dest_lat': 32.7767,
        'dest_lon': -96.7970,
        'max_risk_level': 1,
    }

    response = client.post('/api/trips/', payload, format='json', **headers)
    assert response.status_code == 201
    data = response.json()
    assert data['origin_label'] == 'Chicago, IL'
    assert data['dest_label'] == 'Dallas, TX'
    assert data['max_risk_level'] == 1

    # List trips
    list_res = client.get('/api/trips/', **headers)
    assert list_res.status_code == 200
    trips = list_res.json()
    assert len(trips) == 1
    assert trips[0]['id'] == data['id']


@pytest.mark.django_db
def test_client_id_isolation(client):
    client_a = {'HTTP_X_CLIENT_ID': 'client-aaa'}
    client_b = {'HTTP_X_CLIENT_ID': 'client-bbb'}

    payload_a = {
        'origin_label': 'Indore',
        'origin_lat': 22.7196,
        'origin_lon': 75.8577,
        'dest_label': 'Mumbai',
        'dest_lat': 19.0760,
        'dest_lon': 72.8777,
    }
    client.post('/api/trips/', payload_a, format='json', **client_a)

    payload_b = {
        'origin_label': 'London',
        'origin_lat': 51.5074,
        'origin_lon': -0.1278,
        'dest_label': 'Manchester',
        'dest_lat': 53.4808,
        'dest_lon': -2.2426,
    }
    client.post('/api/trips/', payload_b, format='json', **client_b)

    # Client A should only see Indore -> Mumbai
    res_a = client.get('/api/trips/', **client_a)
    assert res_a.status_code == 200
    assert len(res_a.json()) == 1
    assert res_a.json()[0]['origin_label'] == 'Indore'

    # Client B should only see London -> Manchester
    res_b = client.get('/api/trips/', **client_b)
    assert res_b.status_code == 200
    assert len(res_b.json()) == 1
    assert res_b.json()[0]['origin_label'] == 'London'


@pytest.mark.django_db
def test_delete_and_clear_trips(client):
    headers = {'HTTP_X_CLIENT_ID': 'client-delete-test'}

    p1 = client.post('/api/trips/', {
        'origin_label': 'City A',
        'origin_lat': 10.0,
        'origin_lon': 20.0,
        'dest_label': 'City B',
        'dest_lat': 30.0,
        'dest_lon': 40.0,
    }, format='json', **headers).json()

    p2 = client.post('/api/trips/', {
        'origin_label': 'City C',
        'origin_lat': 11.0,
        'origin_lon': 21.0,
        'dest_label': 'City D',
        'dest_lat': 31.0,
        'dest_lon': 41.0,
    }, format='json', **headers).json()

    # Delete p1
    del_res = client.delete(f"/api/trips/{p1['id']}/", **headers)
    assert del_res.status_code == 200

    # Verify only p2 remains
    list_res = client.get('/api/trips/', **headers)
    assert len(list_res.json()) == 1
    assert list_res.json()[0]['id'] == p2['id']

    # Clear all
    clear_res = client.delete('/api/trips/', **headers)
    assert clear_res.status_code == 200
    assert len(client.get('/api/trips/', **headers).json()) == 0


@pytest.mark.django_db
def test_max_fifty_cap(client):
    headers = {'HTTP_X_CLIENT_ID': 'client-cap-test'}

    for i in range(55):
        client.post('/api/trips/', {
            'origin_label': f'Origin {i}',
            'origin_lat': float(i),
            'origin_lon': 10.0,
            'dest_label': f'Dest {i}',
            'dest_lat': float(i) + 1.0,
            'dest_lon': 20.0,
        }, format='json', **headers)

    count = TripSearch.objects.filter(client_id='client-cap-test').count()
    assert count == 50


def test_reverse_geocode_endpoint(client):
    res = client.get('/api/geocode/reverse/?lat=41.8781&lon=-87.6298')
    assert res.status_code == 200
    data = res.json()
    assert 'label' in data
    assert 'lat' in data
    assert 'lng' in data


def test_weather_report_endpoint(client):
    res = client.get('/api/weather/report/?origin_lat=41.8781&origin_lon=-87.6298')
    assert res.status_code == 200
    data = res.json()
    assert 'origin' in data
    assert 'alerts' in data
