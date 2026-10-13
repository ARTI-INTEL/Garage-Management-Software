import axios from 'axios';

const api = axios.create({
  // Set VITE_API_URL at build time for production, e.g.
  // VITE_API_URL=https://api.yourdomain.com (no trailing slash)
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`,
});

// Add a request interceptor to add the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Expired/revoked token handling: without this a user whose 8h JWT expired
// would sit in the app getting silent failures. Clear the dead session and
// send them back to /login. Deliberately skips /auth/login itself (a wrong
// password is a 401 too — that must stay a normal form error) and does
// nothing when there is no stored token to expire.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isLoginAttempt = url.includes('/auth/login');

    if (status === 401 && !isLoginAttempt && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;

