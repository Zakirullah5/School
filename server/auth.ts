import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export type UserRole = 'principal' | 'teacher' | 'student' | 'parent';

export interface SessionPayload {
  userId: number;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
}

const SESSION_COOKIE_NAME = 'aea_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// In-memory CSPRNG fallback when SESSION_SECRET env var is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hexHash] = parts;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hexHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.userId !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME];
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  // CSRF check for cookie-authenticated mutations
  const usedBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  if (!usedBearer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    const hasCustomHeader = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host && !hasCustomHeader) {
          res.status(403).json({ error: 'Cross-origin mutation rejected.' });
          return;
        }
      } catch {
        if (!hasCustomHeader) {
          res.status(403).json({ error: 'Invalid request origin.' });
          return;
        }
      }
    }
  }

  req.auth = session;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Access denied for your account role.' });
      return;
    }
    next();
  };
}
