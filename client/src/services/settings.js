import api from './api';

let cached = null;

// Cached getter so every page shows the same currency from garage settings
export const getSettings = async () => {
  if (cached) return cached;
  try {
    const res = await api.get('/settings');
    cached = res.data.data;
  } catch {
    cached = { currency: 'AED' };
  }
  return cached;
};

export const getCurrency = async () => {
  const s = await getSettings();
  return s?.currency || 'AED';
};
