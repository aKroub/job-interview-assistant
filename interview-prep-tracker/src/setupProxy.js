/**
 * Custom proxy configuration for the CRA dev server.
 *
 * Replaces the simple `"proxy"` field in package.json so that
 * Server-Sent Events (SSE) responses are streamed in real time
 * instead of being buffered by http-proxy-middleware.
 *
 * CRA auto-detects this file at `src/setupProxy.js` — no import needed.
 *
 * @see https://create-react-app.dev/docs/proxying-api-requests-in-development/#configuring-the-proxy-manually
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,

      /**
       * Called for every proxied response.  For SSE endpoints
       * (`text/event-stream`) we must disable response buffering
       * so events are flushed to the browser immediately.
       */
      onProxyRes(proxyRes, _req, _res) {
        const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/event-stream')) {
          // Prevent http-proxy from using a decompression transform
          // (gzip/br) which introduces its own buffering.
          proxyRes.headers['content-encoding'] = 'identity';
        }
      },
    }),
  );
};
