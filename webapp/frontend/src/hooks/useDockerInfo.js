import { useEffect, useState, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/**
 * Hook that fetches container info from the REST API
 * and refreshes it on an interval.
 *
 * @param {number} [intervalMs=30000] - Refresh interval in ms.
 * @returns {{ name: string, status: string, image: string, startedAt: string, loading: boolean, error: string|null, refetch: () => void }}
 */
export function useDockerInfo(intervalMs = 30000) {
  const [info, setInfo] = useState({
    name: "",
    status: "",
    image: "",
    startedAt: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/docker/info`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInfo(data);
      setError(null);
    } catch (err) {
      console.error("[useDockerInfo]", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    const id = setInterval(fetchInfo, intervalMs);
    return () => clearInterval(id);
  }, [fetchInfo, intervalMs]);

  return { ...info, loading, error, refetch: fetchInfo };
}

export default useDockerInfo;
