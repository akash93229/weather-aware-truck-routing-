"""Base models and interface for routing providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Tuple, Optional


@dataclass
class Route:
    """Represents a computed route between two or more points."""
    id: str
    label: str
    points: List[Tuple[float, float]]  # List of (latitude, longitude)
    distance_mi: float
    duration_s: float


class RoutingError(Exception):
    """Base exception for routing services."""
    pass


class RoutingUnavailable(RoutingError):
    """Raised when routing provider fails, times out, or returns 5xx."""
    pass


class NoRouteFound(RoutingError):
    """Raised when no route exists between points (404 or empty routes)."""
    pass


class RoutingProvider(ABC):
    """Abstract interface for route calculation providers."""

    @abstractmethod
    def calculate_routes(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        load_weight_lb: Optional[float] = None,
        via_points: Optional[List[Tuple[float, float]]] = None,
        max_alternatives: int = 2,
    ) -> List[Route]:
        """
        Calculate truck routes between origin and destination.
        Returns a list of Route objects.
        """
        pass
