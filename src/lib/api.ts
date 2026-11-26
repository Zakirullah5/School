import { handleFirebaseApiRequest } from './firebaseBackend';
import { handleStaticApiRequest } from './staticBackend';

// In-memory Bearer token (never persisted to localStorage/sessionStorage)
let inMemoryToken: string | null = null;
let backendMode: 'unknown' | 'live' | 'firebase' | 'static' = 'unknown';

export function isStaticMode(): boolean {
  return backendMode === 'static';
}

export function isFirebaseMode(): boolean {
  return backendMode === 'firebase';
}

export function setBackendMode(mode: 'live' | 'firebase' | 'static'): void {
  backendMode = mode;
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

let detectPromise: Promise<'live' | 'firebase' | 'static'> | null = null;

export async function detectBackendMode(): Promise<'live' | 'firebase' | 'static'> {
  if (backendMode !== 'unknown') return backendMode;
  if (detectPromise) return detectPromise;

  detectPromise = (async () => {
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      backendMode = 'firebase';
      return 'firebase';
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
      // No Node.js Express backend reachable — route to Firebase Cloud Backend
    } finally {
      window.clearTimeout(timer);
    }
    backendMode = 'firebase';
    return 'firebase';
  })();

  return detectPromise;
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const mode = await detectBackendMode();
  if (mode === 'firebase') {
    return handleFirebaseApiRequest<T>(url, options);
  }
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
  if (mode === 'firebase' || mode === 'static') {
    if (file.type.startsWith('image/')) {
      const compressedUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const maxDim = 256;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not process image.'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not load selected image.'));
        };
        img.src = objectUrl;
      });
      return { url: compressedUrl, originalName: file.name, size: compressedUrl.length };
    }
    if (file.size > 160 * 1024) {
      throw new Error('Attachment size must be under 160 KB in cloud mode.');
    }
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
