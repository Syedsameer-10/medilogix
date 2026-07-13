import type { Doctor, RegisterDoctorInput } from '../types/doctor';
import { apiClient } from './apiClient';

interface LoginResponse {
  doctor: Doctor;
  token: string;
}

export async function loginDoctor(gmail: string, password: string) {
  try {
    const response = await apiClient.post<LoginResponse>('/auth/login', { gmail, password });

    return response.data;
  } catch (error) {
    if (typeof error === 'object' && error) {
      const axiosError = error as { code?: string; message?: string; response?: { status?: number } };

      if (axiosError.response?.status === 401) {
        throw new Error('Invalid Gmail or password.', { cause: error });
      }

      if (axiosError.code === 'ECONNABORTED') {
        throw new Error('The server is starting up. Please wait a moment and try again.', { cause: error });
      }

      if (!axiosError.response) {
        throw new Error('Unable to reach the server. Check your internet connection and try again.', { cause: error });
      }
    }

    throw new Error('Login is temporarily unavailable. Please try again.', { cause: error });
  }
}

export async function getCurrentDoctor() {
  const response = await apiClient.get<{ doctor: Doctor }>('/auth/me');

  return response.data.doctor;
}

export async function registerDoctor(values: RegisterDoctorInput) {
  const response = await apiClient.post<{ doctor: Doctor }>('/auth/register', values);

  return response.data.doctor;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await apiClient.post<{ message: string }>('/auth/change-password', {
    currentPassword,
    newPassword,
  });

  return response.data.message;
}
