// Shared helpers for the content + media functions.
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

/** Host-only writes: the request must carry the ADMIN_PASSWORD (set in Netlify → Site configuration → Environment variables). */
export function checkAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return json({ error: 'ADMIN_PASSWORD is not set on this Netlify site yet.' }, 503);
  if (req.headers.get('x-admin-key') !== expected) return json({ error: 'Wrong host password.' }, 401);
  return null;
}
