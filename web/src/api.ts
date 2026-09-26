let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "X-CSRF-Token": csrf,
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  if (data.csrf) setCsrf(data.csrf);
  return data as T;
}

export const post = <T>(path: string, data: unknown = {}, key?: string) =>
  api<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
    headers: key ? { "Idempotency-Key": key } : {},
  });
