from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def health_check(request):
    """Health check endpoint returning system status."""
    return Response({
        'status': 'ok',
        'service': 'weather-aware-truck-routing-api',
    })
