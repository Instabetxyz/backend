import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { WsClientMessage, WsEvent } from '../types';

// ─────────────────────────────────────────────────────────
// Connection state
// ─────────────────────────────────────────────────────────

interface WsClient {
  socket: WebSocket;
  userId: string | null;
  subscribedMarkets: Set<string>;
}

// market_id → set of connected clients
const subscriptions = new Map<string, Set<WsClient>>();
// track all clients for broadcast / cleanup
const allClients = new Set<WsClient>();

// ─────────────────────────────────────────────────────────
// Server setup
// ─────────────────────────────────────────────────────────

export function createWsServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/v1/stream/websocket' });

  wss.on('connection', (socket, req) => {
    const client: WsClient = {
      socket,
      userId: parseUserIdFromRequest(req),
      subscribedMarkets: new Set(),
    };
    allClients.add(client);

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsClientMessage;
        handleClientMessage(client, msg);
      } catch {
        sendToClient(client, { type: 'error', message: 'Invalid JSON.' } as never);
      }
    });

    socket.on('close', () => {
      unsubscribeAll(client);
      allClients.delete(client);
    });

    socket.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  console.log('[WS] WebSocket server ready');
  return wss;
}

// ─────────────────────────────────────────────────────────
// Client message handling
// ─────────────────────────────────────────────────────────

function handleClientMessage(client: WsClient, msg: WsClientMessage): void {
  switch (msg.type) {
    case 'subscribe':
      (msg.market_ids ?? []).forEach((id) => subscribe(client, id));
      break;
    case 'unsubscribe':
      (msg.market_ids ?? []).forEach((id) => unsubscribe(client, id));
      break;
    case 'ping':
      sendToClient(client, { type: 'pong' } as never);
      break;
  }
}

function subscribe(client: WsClient, marketId: string): void {
  client.subscribedMarkets.add(marketId);
  if (!subscriptions.has(marketId)) subscriptions.set(marketId, new Set());
  subscriptions.get(marketId)!.add(client);
}

function unsubscribe(client: WsClient, marketId: string): void {
  client.subscribedMarkets.delete(marketId);
  subscriptions.get(marketId)?.delete(client);
}

function unsubscribeAll(client: WsClient): void {
  client.subscribedMarkets.forEach((id) => unsubscribe(client, id));
}

// ─────────────────────────────────────────────────────────
// Event broadcasting (called from services)
// ─────────────────────────────────────────────────────────

/**
 * Broadcast an event to all clients subscribed to the given market.
 */
export function broadcastToMarket(marketId: string, event: WsEvent): void {
  const clients = subscriptions.get(marketId);
  if (!clients) return;
  const payload = JSON.stringify(event);
  clients.forEach((client) => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  });
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function sendToClient(client: WsClient, data: object): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(data));
  }
}

function parseUserIdFromRequest(req: http.IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', 'ws://localhost');
    const token = url.searchParams.get('token');
    if (!token) return null;
    const payload = jwt.verify(token, config.auth.jwtSecret) as { user_id: string };
    return payload.user_id;
  } catch {
    return null;
  }
}