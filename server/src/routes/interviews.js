import { Router } from 'express';

/**
 * Creates the interviews router for SSE suggestions and dismiss endpoint.
 *
 * The polling loop ONLY runs while at least one SSE client is connected.
 * When the last client disconnects, polling stops. This means the system
 * is completely idle until the frontend actually subscribes.
 *
 * @param {Object} deps
 * @param {{ detect: Function }} deps.detector - interview detector service
 * @param {{ addDismissed: Function }} deps.tokenStore - for persisting dismissals
 * @param {number} deps.pollIntervalMs - how often to poll (from config)
 * @returns {import('express').Router}
 */
export function createInterviewsRouter({ detector, tokenStore, pollIntervalMs }) {
  const router = Router();

  /** Set of active SSE response objects. */
  const clients = new Set();

  /** Handle to the polling interval (null when not running). */
  let pollHandle = null;

  /**
   * Broadcasts an SSE event to all connected clients.
   *
   * @param {string} event - the SSE event name
   * @param {*} data - the data payload (will be JSON-serialised)
   */
  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  /**
   * Runs a single detection cycle and broadcasts any new suggestions.
   */
  async function pollOnce() {
    try {
      const suggestions = await detector.detect();
      if (suggestions.length > 0) {
        broadcast('suggestions', suggestions);
      }
    } catch (err) {
      // Broadcast the error so the frontend can show a status message
      broadcast('error', { message: err.message });
    }
  }

  /**
   * Starts the polling loop if not already running.
   */
  function startPolling() {
    if (pollHandle) return;
    // Run once immediately, then on interval
    pollOnce();
    pollHandle = setInterval(pollOnce, pollIntervalMs);
  }

  /**
   * Stops the polling loop if no clients remain.
   */
  function stopPollingIfEmpty() {
    if (clients.size === 0 && pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  /**
   * GET /api/interviews/suggestions
   *
   * SSE endpoint. When a client connects:
   * 1. Adds the client to the active set
   * 2. Starts polling if this is the first client
   * 3. Sends heartbeats every 30s to keep the connection alive
   * 4. On disconnect: removes client, stops polling if last client
   */
  router.get('/suggestions', (req, res) => {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

    // Register client
    clients.add(res);

    // Start polling if this is the first client
    startPolling();

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30_000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      stopPollingIfEmpty();
    });
  });

  /**
   * POST /api/interviews/dismiss
   * Body: { suggestionId: string }
   *
   * Persists a dismissed suggestion so it won't be shown again.
   */
  router.post('/dismiss', (req, res) => {
    const { suggestionId } = req.body;

    if (!suggestionId || typeof suggestionId !== 'string') {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    tokenStore.addDismissed(suggestionId);
    res.json({ dismissed: true });
  });

  /**
   * POST /api/interviews/scan
   *
   * Manual trigger for a single scan cycle. Returns suggestions directly
   * instead of via SSE. Useful for testing and for the frontend to get
   * immediate results without waiting for the next poll.
   */
  router.post('/scan', async (_req, res) => {
    try {
      const suggestions = await detector.detect();
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
