"""Custom exception handlers for standardized JSON error responses."""

from django.http import JsonResponse
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """DRF custom exception handler ensuring {error: {code, message}} schema."""
    response = exception_handler(exc, context)

    if response is not None:
        if (
            isinstance(response.data, dict)
            and 'error' in response.data
            and isinstance(response.data['error'], dict)
            and 'code' in response.data['error']
        ):
            return response

        code = 'error'
        message = 'An error occurred.'

        if isinstance(response.data, dict):
            if 'detail' in response.data:
                detail = response.data['detail']
                code = getattr(detail, 'code', 'error')
                message = str(detail)
            elif 'error' in response.data:
                err = response.data['error']
                if isinstance(err, str):
                    message = err
                    code = response.data.get('code', 'error')
                elif isinstance(err, dict):
                    code = err.get('code', 'error')
                    message = err.get('message', str(err))
            else:
                code = 'validation_error'
                message = str(response.data)
        elif isinstance(response.data, list):
            message = '; '.join(str(item) for item in response.data)
            code = 'validation_error'
        else:
            message = str(response.data)

        if response.status_code == 404:
            code = 'not_found'
        elif response.status_code == 405:
            code = 'method_not_allowed'
        elif response.status_code == 400 and ('parse' in code.lower() or 'JSON parse error' in message):
            code = 'parse_error'

        response.data = {
            'error': {
                'code': code,
                'message': message,
            }
        }
        return response

    return None


def custom_404_view(request, exception=None):
    """Django handler for HTTP 404 (Not Found)."""
    return JsonResponse(
        {
            'error': {
                'code': 'not_found',
                'message': 'The requested resource was not found.',
            }
        },
        status=404,
    )


def custom_500_view(request):
    """Django handler for HTTP 500 (Internal Server Error)."""
    return JsonResponse(
        {
            'error': {
                'code': 'server_error',
                'message': 'An internal server error occurred.',
            }
        },
        status=500,
    )


def custom_400_view(request, exception=None):
    """Django handler for HTTP 400 (Bad Request)."""
    return JsonResponse(
        {
            'error': {
                'code': 'bad_request',
                'message': 'Bad request.',
            }
        },
        status=400,
    )


def custom_403_view(request, exception=None):
    """Django handler for HTTP 403 (Permission Denied)."""
    return JsonResponse(
        {
            'error': {
                'code': 'permission_denied',
                'message': 'Permission denied.',
            }
        },
        status=403,
    )
