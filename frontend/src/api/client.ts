import axios from 'axios';
import type {
  TripAnalyzeRequest,
  TripAnalyzeResponse,
  HeatmapResponse,
  LocationPoint,
} from '../types/trip';

export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

// Create configured Axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

function extractErrorMessage(data: any, fallbackStatus?: number): string {
  if (!data) {
    return fallbackStatus ? `Request failed with HTTP ${fallbackStatus}` : 'Request failed';
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
