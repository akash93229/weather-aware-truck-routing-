export enum RiskLevel {
  LOW = 0,
  MODERATE = 1,
  HIGH = 2,
  SEVERE = 3,
  NO_TRAVEL = 4,
}

export interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface WeatherCondition {
  wind_speed_mph: number;
  wind_gusts_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
}

export interface Checkpoint {
  lat: number;
  lng: number;
  mile_marker: number;
  attributed_miles: number;
  eta_iso: string;
  eta_hour_iso: string;
  weather: WeatherCondition;
  level: RiskLevel;
  level_name: string;
  drivers: string[];
  load_rule: string | null;
  has_forecast: boolean;
}

export interface RouteOption {
  id: string;
  label: string;
  distance_mi: number;
  duration_s: number;
  geometry: [number, number][]; // [lat, lng]
  checkpoints: Checkpoint[];
  summary: {
    total_miles: number;
    miles_by_level: {
      low: number;
      moderate: number;
      high: number;
      severe: number;
      no_travel: number;
    };
    max_level: RiskLevel;
    worst_checkpoint: Checkpoint | null;
    has_no_travel: number;
    rank_no_travel_miles: number;
    rank_severe_miles: number;
    rank_high_miles: number;
    rank_avg_risk: number;
  };
}

export interface Recommendation {
  recommended_route_id: string | null;
  recommended_route: RouteOption | null;
  fastest_route: RouteOption | null;
  explanation: string;
  is_all_blocked: boolean;
}

export interface TripAnalyzeRequest {
  origin: LocationPoint;
  destination: LocationPoint;
  departure_time: string;
  load_weight_lb: number;
  interval_miles: number;
  scenario?: 'live' | 'calm' | 'storm' | 'all_levels';
}

export interface TripAnalyzeResponse {
  routes: RouteOption[];
  recommendation: Recommendation;
  provider_used: string;
  notes: string[];
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  levels: number[]; // 49 hourly risk values (0-48h)
}

export interface HeatmapResponse {
  hours: number;
  departure_time: string;
  points: HeatmapPoint[];
  point_count: number;
}
