import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseCookies, verifySessionToken } from './auth.ts';
import type Database from 'better-sqlite3';

interface ClientMeta {
  userId: number;
  role: string;
}

const clientsByUser = new Map<number, Set<WebSocket>>();

export function setupWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const queryToken = url.searchParams.get('token') || undefined;
    const cookies = parseCookies(req.headers.cookie);
    const token = queryToken || cookies.aea_session;
    const session = verifySessionToken(token);

    if (!session) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const meta: ClientMeta = { userId: session.userId, role: session.role };
    if (!clientsByUser.has(meta.userId)) {
      clientsByUser.set(meta.userId, new Set());
    }
    clientsByUser.get(meta.userId)!.add(ws);

    ws.send(
      JSON.stringify({
        event: 'ws:connected',
        payload: { userId: meta.userId, role: meta.role, timestamp: Date.now() },
      })
    );

    ws.on('close', () => {
      const set = clientsByUser.get(meta.userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clientsByUser.delete(meta.userId);
        }
      }
    });
  });

  return wss;
}

export function pushEventToUser(userId: number, event: string, payload: unknown): void {
  const sockets = clientsByUser.get(userId);
  if (!sockets || sockets.size === 0) return;
  const serialized = JSON.stringify({ event, payload });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

export interface NotificationInput {
  recipientUserId: number;
  type: string;
  title: string;
  message: string;
  linkTab?: string;
  linkMeta?: Record<string, unknown>;
}

export function createAndPushNotification(db: Database.Database, input: NotificationInput): number {
  const metaJson = input.linkMeta ? JSON.stringify(input.linkMeta) : null;
  const stmt = db.prepare(`
    INSERT INTO notifications (recipient_user_id, type, title, message, link_tab, link_meta_json, is_read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  const result = stmt.run(
    input.recipientUserId,
    input.type,
    input.title,
    input.message,
    input.linkTab || null,
    metaJson
  );

  const notificationId = Number(result.lastInsertRowid);
  const created = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(notificationId);

  pushEventToUser(input.recipientUserId, 'notification:new', created);
  return notificationId;
}
