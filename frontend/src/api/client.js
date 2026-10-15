const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

/**
 * Extract clear human-readable error message from backend error responses.
 * Backend formats: { error: { code, message } } or { error: string } or { detail: string }
 */
function extractErrorMessage(data, fallbackStatus) {
  if (!data) {
    return `Request failed with HTTP ${fallbackStatus}`;
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
  return `Request failed with HTTP ${fallbackStatus}`;
}

/**
 * Health check endpoint.
 */
export async function getHealth(signal) {
  const controller = new AbortController();
  const linkedSignal = signal || controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/health/`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: linkedSignal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(data, res.status));
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Backend health check timed out after 8s');
    }
    if (err instanceof TypeError) {
      throw new Error(`Unable to connect to backend server at ${API_BASE_URL}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Geocode query using /api/geocode?q=
 * @param {string} q Search query
 * @param {AbortSignal} [signal] Optional cancellation signal
 * @returns {Promise<Array<{lat: number, lng: number, display_name: string}>>}
 */
export async function getGeocode(q, signal) {
  if (!q || !q.trim()) {
    return [];
  }

  const res = await fetch(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(q.trim())}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
  }

  return data?.results || [];
}

/**
 * Analyze trip routes and weather risks.
 * Handles 30s timeout with an 8s "server waking up" hint callback.
 *
 * @param {object} body Trip request body
 * @param {object} [options]
 * @param {Function} [options.onWakeupHint] Callback when request takes > 8s
 * @param {AbortSignal} [options.signal] External cancellation signal
 * @returns {Promise<object>} Analysis results { routes, recommendation }
 */
export async function analyzeTrip(body, { onWakeupHint, signal } = {}) {
  const controller = new AbortController();

  // If external signal provided, abort controller when external signal aborts
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  // 8 second hint timer
  const wakeupTimer = setTimeout(() => {
    if (onWakeupHint) {
      onWakeupHint('Server is waking up and fetching real-time weather forecasts... please hold on.');
    }
  }, 8000);

  // 30 second hard timeout
  const timeoutTimer = setTimeout(() => {
    controller.abort('TIMEOUT');
  }, 30000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/trips/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(extractErrorMessage(data, res.status));
    }

    return data;
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason === 'TIMEOUT') {
      throw new Error('Analysis timed out after 30 seconds. The server took too long to respond.');
    }
    if (err.name === 'AbortError') {
      throw new Error('Analysis request was cancelled.');
    }
    if (err instanceof TypeError) {
      throw new Error(`Unable to connect to trip analysis service at ${API_BASE_URL}`);
    }
    throw err;
  } finally {
    clearTimeout(wakeupTimer);
    clearTimeout(timeoutTimer);
  }
}
