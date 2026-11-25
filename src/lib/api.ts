import { handleStaticApiRequest } from './staticBackend';

// In-memory Bearer token (never persisted to localStorage/sessionStorage)
let inMemoryToken: string | null = null;
let backendMode: 'unknown' | 'live' | 'static' = 'unknown';

export function isStaticMode(): boolean {
  return backendMode === 'static';
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function resolveAssetUrl(url: string | null | undefined, fallback?: string): string {
  const chosen = url || fallback || './src/assets/images/avatar_student_male_1795627463854.jpg';
  if (chosen.startsWith('/src/assets/')) {
    return `.${chosen}`;
  }
  return chosen;
}

let detectPromise: Promise<'live' | 'static'> | null = null;

async function detectBackendMode(): Promise<'live' | 'static'> {
  if (backendMode !== 'unknown') return backendMode;
  if (detectPromise) return detectPromise;

  detectPromise = (async () => {
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      backendMode = 'static';
      return 'static';
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch('./api/health', {
        credentials: 'include',
        signal: controller.signal,
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data && data.ok === true) {
          backendMode = 'live';
          return 'live';
        }
      }
    } catch {
      // Fall through to static
    } finally {
      window.clearTimeout(timer);
    }
    backendMode = 'static';
    return 'static';
  })();

  return detectPromise;
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const mode = await detectBackendMode();
  if (mode === 'static') {
    const headers = new Headers(options.headers || {});
    if (inMemoryToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${inMemoryToken}`);
    }
    return handleStaticApiRequest<T>(url, { ...options, headers });
  }

  const normalizedUrl = url.startsWith('/') ? `.${url}` : url;
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(normalizedUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      if (data?.error) errorMessage = data.error;
    }
    throw new Error(errorMessage);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export async function uploadFile(file: File): Promise<{ url: string; originalName: string; size: number }> {
  const mode = await detectBackendMode();
  if (mode === 'static') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
    return { url: dataUrl, originalName: file.name, size: file.size };
  }

  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/upload', {
    method: 'POST',
    body: form,
  });
}
