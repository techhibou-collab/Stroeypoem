import type { AuthUser } from '@/lib/api';

const USER_TOKEN_KEY = 'poetry-hub-user-token';
const USER_PROFILE_KEY = 'poetry-hub-user-profile';

export const getUserToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(USER_TOKEN_KEY) || '';
};

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(USER_PROFILE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AuthUser;
  } catch {
    window.localStorage.removeItem(USER_PROFILE_KEY);
    return null;
  }
};

export const setUserSession = (token: string, user: AuthUser) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(USER_TOKEN_KEY, token);
  window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
};

export const clearUserSession = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(USER_TOKEN_KEY);
  window.localStorage.removeItem(USER_PROFILE_KEY);
};

export const getUserAuthHeaders = () => {
  const token = getUserToken();

  return (token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {}) as Record<string, string>;
};
