const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function idempotencyKey() {
  return crypto.randomUUID();
}

async function request(path, { method = "POST", body, idempotent = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idempotent) headers["Idempotency-Key"] = idempotencyKey();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });

  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export const storePackage = (payload) =>
  request("/api/v1/packages/store", { body: payload, idempotent: true });

export const getQuote = (payload) =>
  request("/api/v1/packages/retrieve/quote", { body: payload });

export const confirmPickup = (payload) =>
  request("/api/v1/packages/retrieve/confirm", { body: payload, idempotent: true });