import { useState, useEffect, useRef, useCallback } from 'react';
import { getHeatmap } from '../api/client';

/**
 * Custom React hook to fetch corridor weather heatmap in the background
 * after trip routes have been successfully computed.
 *
 * @param {object|null} tripParams The parameters sent to /api/trips/analyze
 * @param {boolean} isTripReady Whether /api/trips/analyze has completed successfully
 * @returns {{
 *   heatmapData: {start_time: string, hours: number, points: Array<{lat: number, lng: number, levels: number[]}>}|null,
 *   isLoadingHeatmap: boolean,
 *   heatmapError: string|null,
 *   retryHeatmap: () => void
 * }}
 */
export function useHeatmap(tripParams, isTripReady) {
  const [heatmapData, setHeatmapData] = useState(null);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [heatmapError, setHeatmapError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const abortControllerRef = useRef(null);

  const retryHeatmap = useCallback(() => {
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!isTripReady || !tripParams) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Asynchronous execution so that routes render first and UI is never blocked
    const timer = setTimeout(async () => {
      setIsLoadingHeatmap(true);
      setHeatmapError(null);

      try {
        const data = await getHeatmap(tripParams, controller.signal);
        if (!controller.signal.aborted) {
          setHeatmapData(data);
          setIsLoadingHeatmap(false);
        }
      } catch (err) {
        if (!controller.signal.aborted && err.name !== 'AbortError') {
          setHeatmapError(err.message || 'Failed to load weather heatmap.');
          setIsLoadingHeatmap(false);
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tripParams, isTripReady, retryTrigger]);

  const activeData = isTripReady && tripParams ? heatmapData : null;

  return {
    heatmapData: activeData,
    isLoadingHeatmap,
    heatmapError,
    retryHeatmap,
  };
}
