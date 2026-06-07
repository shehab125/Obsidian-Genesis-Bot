export const ADMIN_COOKIE_NAME = "admin_session";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getAdminSessionValue() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return "";
  }

  return sha256(`admin-dashboard:${password}`);
}

export function isValidAdminPassword(password: string) {
  const configured = process.env.ADMIN_PASSWORD;
  return Boolean(configured && password === configured);
}
