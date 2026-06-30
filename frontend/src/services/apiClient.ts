import axios from 'axios';
import { authTokenStorageKey } from './authStorage';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://medilogix-1.onrender.com/api';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem(authTokenStorageKey);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
