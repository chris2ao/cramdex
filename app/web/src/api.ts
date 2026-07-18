export async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail).catch(() => res.statusText);
    throw new Error(typeof detail === "string" ? detail : res.statusText);
  }
  return res.json() as Promise<T>;
}
