"""Tests for standardized error handling under DEBUG=False."""

from django.test import SimpleTestCase, override_settings


@override_settings(DEBUG=False)
class TestErrorHandling(SimpleTestCase):
    """
    With DEBUG=False:
    - Unknown URL (404) returns {error: {code, message}} JSON, never HTML.
    - Wrong method (405) returns {error: {code, message}} JSON, never HTML.
    - Malformed JSON (400) returns {error: {code, message}} JSON, never HTML or stack trace.
    """

    def test_unknown_url_returns_json_404(self):
        resp = self.client.get('/api/nonexistent-route-xyz/')
        assert resp.status_code == 404
        assert resp['Content-Type'].startswith('application/json')

        data = resp.json()
        assert 'error' in data
        assert isinstance(data['error'], dict)
        assert data['error']['code'] == 'not_found'
        assert isinstance(data['error']['message'], str)
        assert len(data['error']['message']) > 0

        # Assert no HTML was rendered
        assert b'<html' not in resp.content.lower()
        assert b'<!doctype' not in resp.content.lower()

    def test_root_unknown_url_returns_json_404(self):
        resp = self.client.get('/completely/unknown/path/')
        assert resp.status_code == 404
        assert resp['Content-Type'].startswith('application/json')

        data = resp.json()
        assert 'error' in data
        assert data['error']['code'] == 'not_found'
        assert b'<html' not in resp.content.lower()

    def test_wrong_method_returns_json_405(self):
        # /api/trips/analyze/ only allows POST
        resp = self.client.get('/api/trips/analyze/')
        assert resp.status_code == 405
        assert resp['Content-Type'].startswith('application/json')

        data = resp.json()
        assert 'error' in data
        assert isinstance(data['error'], dict)
        assert data['error']['code'] == 'method_not_allowed'
        assert isinstance(data['error']['message'], str)
        assert 'not allowed' in data['error']['message'].lower()
        assert b'<html' not in resp.content.lower()

    def test_malformed_json_returns_json_400(self):
        # Malformed raw JSON string payload
        malformed_body = '{"origin": {"lat": 41.88, "lng": '
        resp = self.client.post(
            '/api/trips/analyze/',
            data=malformed_body,
            content_type='application/json',
        )
        assert resp.status_code == 400
        assert resp['Content-Type'].startswith('application/json')

        data = resp.json()
        assert 'error' in data
        assert isinstance(data['error'], dict)
        assert data['error']['code'] == 'parse_error'
        assert isinstance(data['error']['message'], str)
        assert len(data['error']['message']) > 0
        assert b'<html' not in resp.content.lower()
        assert b'Traceback' not in resp.content
