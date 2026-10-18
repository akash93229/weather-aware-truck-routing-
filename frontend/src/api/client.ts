import axios from 'axios';
import type {
  TripAnalyzeRequest,
  TripAnalyzeResponse,
  HeatmapResponse,
} from '../types/trip';

export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  ((import.meta as any).env?.PROD
    ? 'https://stormlane-backend.onrender.com'
    : 'http://localhost:8000')
).replace(/\/+$/, '');

export function getClientId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    let id = localStorage.getItem('stormlane-client-id');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('stormlane-client-id', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

// Create configured Axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const url = config.url || '';
  // Attach X-Client-Id ONLY to /api/trips/ endpoints (recent trips), never to health, geocode, weather, or analyze
  const isRecentTripsEndpoint = (url === '/api/trips/' || url.startsWith('/api/trips/?') || /^\/api\/trips\/\d+\/?$/.test(url));
  if (isRecentTripsEndpoint && config.headers) {
    const cid = getClientId();
    if (cid) {
      config.headers['X-Client-Id'] = cid;
    }
  }
  return config;
});

function extractErrorMessage(data: any, fallbackStatus?: number): string {
  if (!data) {
    if (fallbackStatus === 500) return 'Server error occurred. Please try again.';
    if (fallbackStatus === 502 || fallbackStatus === 503 || fallbackStatus === 504) return 'Upstream weather/routing service temporarily unavailable. Please retry.';
    if (fallbackStatus === 404) return 'Resource not found.';
    if (fallbackStatus) return `Request failed with HTTP ${fallbackStatus}`;
    return 'Backend service unavailable. Please check your connection.';
  }
  if (typeof data.error === 'object' && data.error?.message) {
    return data.error.message;
  }
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  return fallbackStatus ? `Request failed with HTTP ${fallbackStatus}` : 'An unexpected error occurred';
}

/**
 * Health check endpoint.
 */
export async function getHealth(signal?: AbortSignal): Promise<{ status: string; service: string }> {
  try {
    const res = await apiClient.get('/api/health/', { signal, timeout: 8000 });
    return res.data;
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new Error('Backend health check timed out after 8s');
      }
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  }
}

/**
 * Geocode location query.
 */
export async function getGeocode(
  query: string,
  signal?: AbortSignal
): Promise<Array<{ lat: number; lng: number; display_name: string }>> {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const res = await apiClient.get('/api/geocode', {
      params: { q: query.trim() },
      signal,
    });
    const data = res.data;
    return Array.isArray(data) ? data : data?.results || [];
  } catch (err: any) {
    if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.name === 'AbortError') {
      return [];
    }
    if (axios.isAxiosError(err)) {
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  }
}

/**
 * Analyze trip routes and weather risks with 30s timeout and wakeup hint support.
 */
export async function analyzeTrip(
  body: TripAnalyzeRequest,
  options?: {
    onWakeupHint?: (hint: string) => void;
    onProgressiveRoutes?: (routesData: TripAnalyzeResponse) => void;
    signal?: AbortSignal;
  }
): Promise<TripAnalyzeResponse> {
  const controller = new AbortController();

  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  // Progressive Stage 1: Return initial commercial route in <2s, then stream weather
  if (options?.onProgressiveRoutes) {
    apiClient
      .post<TripAnalyzeResponse>('/api/trips/analyze?stage=routes', body, {
        signal: controller.signal,
        timeout: 10000,
      })
      .then((fastRes) => {
        if (!controller.signal.aborted && fastRes?.data?.routes?.length) {
          options.onProgressiveRoutes?.(fastRes.data);
        }
      })
      .catch(() => {
        // Ignore fast stage errors and await full analysis
      });
  }

  const wakeupTimer = setTimeout(() => {
    if (options?.onWakeupHint) {
      options.onWakeupHint('Server is computing commercial truck routes and querying real-time weather corridor... please hold on.');
    }
  }, 7500);

  try {
    const res = await apiClient.post<TripAnalyzeResponse>('/api/trips/analyze', body, {
      signal: controller.signal,
      timeout: 30000,
    });
    return res.data;
  } catch (err: any) {
    if (axios.isCancel(err) || controller.signal.aborted) {
      throw new Error('Trip analysis request was cancelled.');
    }
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new Error('Trip analysis timed out after 30 seconds. Upstream routing/weather service took too long to respond.');
      }
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  } finally {
    clearTimeout(wakeupTimer);
  }
}

/**
 * Fetch 0-48h weather risk heatmap points across route corridor.
 */
export async function getHeatmap(
  body: TripAnalyzeRequest,
  signal?: AbortSignal
): Promise<HeatmapResponse> {
  try {
    const res = await apiClient.post<HeatmapResponse>('/api/heatmap', body, {
      signal,
      timeout: 30000,
    });
    return res.data;
  } catch (err: any) {
    if (axios.isCancel(err) || signal?.aborted) {
      throw new Error('Heatmap request was cancelled.');
    }
    if (axios.isAxiosError(err)) {
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  }
}

/**
 * Reverse geocode latitude/longitude to a readable place name.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<{ label: string; lat: number; lng: number }> {
  try {
    const res = await apiClient.get('/api/geocode/reverse/', {
      params: { lat, lon },
      signal,
      timeout: 8000,
    });
    return res.data;
  } catch (err: any) {
    if (axios.isCancel(err) || signal?.aborted) {
      throw new Error('Reverse geocoding request was cancelled.');
    }
    if (axios.isAxiosError(err)) {
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  }
}

/**
 * Fetch structured weather report for origin and optional destination.
 */
export async function getWeatherReport(
  params: { origin_lat: number; origin_lon: number; dest_lat?: number; dest_lon?: number; departure?: string },
  signal?: AbortSignal
): Promise<any> {
  try {
    const res = await apiClient.get('/api/weather/report/', {
      params,
      signal,
      timeout: 10000,
    });
    return res.data;
  } catch (err: any) {
    if (axios.isCancel(err) || signal?.aborted) {
      throw new Error('Weather report request was cancelled.');
    }
    if (axios.isAxiosError(err)) {
      throw new Error(extractErrorMessage(err.response?.data, err.response?.status));
    }
    throw err;
  }
}

/**
 * Get recent trip searches for current client ID.
 */
export async function getRecentTrips(limit = 10, signal?: AbortSignal): Promise<any[]> {
  try {
    const res = await apiClient.get('/api/trips/', {
      params: { limit },
      signal,
      timeout: 8000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/**
 * Save trip search to recent searches (silent fail on client error).
 */
export async function saveRecentTrip(tripData: any, signal?: AbortSignal): Promise<any> {
  try {
    const res = await apiClient.post('/api/trips/', tripData, {
      signal,
      timeout: 8000,
    });
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Delete a single recent trip.
 */
export async function deleteRecentTrip(id: number, signal?: AbortSignal): Promise<boolean> {
  try {
    await apiClient.delete(`/api/trips/${id}/`, {
      signal,
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all recent trips for client.
 */
export async function clearRecentTrips(signal?: AbortSignal): Promise<boolean> {
  try {
    await apiClient.delete('/api/trips/', {
      signal,
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}
