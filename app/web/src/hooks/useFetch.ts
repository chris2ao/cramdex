import { useEffect, useState } from "react";
import { get } from "../api";

export function useFetch<T>(path: string): { data: T | null; error: string } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(null); setError("");
    get<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [path]);
  return { data, error };
}
