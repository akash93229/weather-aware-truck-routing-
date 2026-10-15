from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from trips.api.serializers import RouteRequestSerializer
from trips.services.ors import (
    OpenRouteServiceClient,
    ORSConfigError,
    ORSRouteNotFoundError,
    ORSRateLimitError,
    ORSUpstreamError,
    ORSValidationError,
    ORSError,
)


@api_view(['GET'])
def health_check(request):
    """Health check endpoint returning system status."""
    return Response({
        'status': 'ok',
        'service': 'weather-aware-truck-routing-api',
    })


@api_view(['POST'])
def generate_route(request):
    """
    POST /api/route/
    Calculates truck route (driving-hgv) between start and end coordinates.
    """
    serializer = RouteRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {
                'error': 'Invalid request parameters.',
                'details': serializer.errors,
                'code': 'invalid_input',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    validated = serializer.validated_data
    ors_client = OpenRouteServiceClient()

    try:
        route_data = ors_client.get_route(
            start_lat=validated['start_lat'],
            start_lng=validated['start_lng'],
            end_lat=validated['end_lat'],
            end_lng=validated['end_lng'],
        )
        return Response(route_data, status=status.HTTP_200_OK)

    except ORSValidationError as exc:
        return Response(
            {'error': str(exc), 'code': 'invalid_coordinates'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except ORSRouteNotFoundError as exc:
        return Response(
            {'error': str(exc), 'code': 'route_not_found'},
            status=status.HTTP_404_NOT_FOUND,
        )
    except ORSRateLimitError as exc:
        return Response(
            {'error': str(exc), 'code': 'rate_limit_exceeded'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    except ORSConfigError as exc:
        return Response(
            {'error': str(exc), 'code': 'service_misconfigured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except ORSUpstreamError as exc:
        return Response(
            {'error': str(exc), 'code': 'upstream_unavailable'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except ORSError as exc:
        return Response(
            {'error': str(exc), 'code': 'routing_error'},
            status=status.HTTP_502_BAD_GATEWAY,
        )
