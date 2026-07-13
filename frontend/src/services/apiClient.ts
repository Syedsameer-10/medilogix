import axios from 'axios';
import { authTokenStorageKey } from './authStorage';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const electronApiBaseUrl = await window.medilogix?.api?.getBaseUrl();

  if (electronApiBaseUrl) {
    config.baseURL = electronApiBaseUrl;
  }

  const token = localStorage.getItem(authTokenStorageKey);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
