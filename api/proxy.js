
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const headers = new Headers();
    // Forward User-Agent from client if available, otherwise use default
    const clientUA = req.headers.get('user-agent');
    headers.set('User-Agent', clientUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Add Referer if needed (extract origin from target)
    try {
        const urlObj = new URL(targetUrl);
        const targetOrigin = urlObj.origin + '/';
        headers.set('Referer', targetOrigin);
        headers.set('Origin', urlObj.origin);
        // headers.set('Host', urlObj.host); // Do not set Host manually, let fetch handle it
    } catch (e) {}

    const response = await fetch(targetUrl, {
      headers: headers,
      method: req.method,
      redirect: 'follow'
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    // Remove CSP headers that might block rendering if we were proxying a full page (not strictly needed for API)
    newHeaders.delete('Content-Security-Policy');
    newHeaders.delete('X-Frame-Options');

    const contentType = (newHeaders.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      newHeaders.set('Cache-Control', 'public, max-age=604800, immutable');
      newHeaders.delete('Pragma');
      newHeaders.delete('Expires');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response(`Proxy error: ${error.message}`, { status: 500 });
  }
}
