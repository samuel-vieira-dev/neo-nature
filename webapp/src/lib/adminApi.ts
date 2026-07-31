export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  // An expired/absent ADMIN session sends the admin back to the admin login —
  // never to the customer /login.
  if ((res.status === 401 || res.status === 403) && typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/admin-login")) window.location.href = "/admin-login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}
