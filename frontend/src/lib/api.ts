const DEFAULT_API_BASE_URL = 'http://localhost:5000';

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

export const getApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

type FetchJsonOptions<T> = Omit<RequestInit, 'cache'> & {
  cache?: RequestCache;
  fallback?: T;
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function fetchApiJson<T>(path: string, options: FetchJsonOptions<T> = {}): Promise<T> {
  const { fallback, timeoutMs = 5000, cache = 'no-store', ...init } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getApiUrl(path), {
      ...init,
      cache,
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;

      try {
        const errorData = (await response.json()) as { error?: string; message?: string };
        message = errorData.error || errorData.message || message;
      } catch {
        // Ignore body parse errors and use the default HTTP status message.
      }

      throw new ApiError(response.status, message);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (fallback !== undefined) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`API request to ${path} failed: ${reason}`);
      return fallback;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type Poem = {
  id: number;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  pdf_file_url: string | null;
  music_file_url: string | null;
  price: number | string;
  free_pages: number;
  created_at: string;
};

export type PoemPage = {
  id: number;
  poem_id: number;
  page_number: number;
  content: string;
  content_url: string;
  content_text?: string | null;
  created_at: string;
};

export type PoemReadResponse = {
  pages: PoemPage[];
  isPurchased: boolean;
  hasMorePages: boolean;
};

export type PaymentDisplay = {
  qr_image_url: string | null;
  upi_id: string | null;
};

export type PaymentSubmission = {
  id: number;
  poem_id: number;
  poem_title: string;
  user_name: string;
  upi_ref_id: string;
  screenshot_url: string | null;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
};

export type AdminLoginResponse = {
  message: string;
  token: string;
  admin: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type UserAuthResponse = {
  message: string;
  token: string;
  user: AuthUser;
};
