// Fetches JSON. Throws an Error with the server's message if the request fails.
export async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    // response was not JSON
  }
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
}
