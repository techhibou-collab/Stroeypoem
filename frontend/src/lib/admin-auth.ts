const ADMIN_TOKEN_KEY = 'poetry-hub-admin-token';

export const getAdminToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
};

export const setAdminToken = (token: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
};

export const clearAdminToken = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
};

export const getAdminAuthHeaders = () => {
  const token = getAdminToken();

  return (token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {}) as Record<string, string>;
};
