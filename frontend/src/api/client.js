const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

/**
 * Fetch health check from Django backend with timeout and detailed error handling.
 * @returns {Promise<{status: string, service: string}>}
 */
export async function getHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/health/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status} (${response.statusText || 'Error'})`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out after 8 seconds. Backend is not responding.');
    }
    if (error instanceof TypeError) {
      throw new Error(`Network error: Unable to connect to backend at ${API_BASE_URL}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
