/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCurrentDoctor, loginDoctor } from '../services/auth.service';
import { authTokenStorageKey, doctorStorageKey } from '../services/authStorage';
import type { Doctor } from '../types/doctor';

interface AuthContextValue {
  doctor: Doctor | null;
  isAuthenticated: boolean;
  isCheckingSession: boolean;
  login: (gmail: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredDoctor() {
  const storedDoctor = localStorage.getItem(doctorStorageKey);

  if (!storedDoctor) {
    return null;
  }

  try {
    return JSON.parse(storedDoctor) as Doctor;
  } catch {
    localStorage.removeItem(doctorStorageKey);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [doctor, setDoctor] = useState<Doctor | null>(() => readStoredDoctor());
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(localStorage.getItem(authTokenStorageKey)));

  useEffect(() => {
    if (!localStorage.getItem(authTokenStorageKey)) {
      return;
    }

    void getCurrentDoctor()
      .then((currentDoctor) => {
        setDoctor(currentDoctor);
        localStorage.setItem(doctorStorageKey, JSON.stringify(currentDoctor));
      })
      .catch((error) => {
        if (error instanceof Error && error.message === 'Session expired') {
          localStorage.removeItem(authTokenStorageKey);
          localStorage.removeItem(doctorStorageKey);
          setDoctor(null);
        }
      })
      .finally(() => setIsCheckingSession(false));
  }, []);

  const login = useCallback(async (gmail: string, password: string) => {
    const response = await loginDoctor(gmail, password);

    localStorage.setItem(authTokenStorageKey, response.token);
    localStorage.setItem(doctorStorageKey, JSON.stringify(response.doctor));
    setDoctor(response.doctor);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(authTokenStorageKey);
    localStorage.removeItem(doctorStorageKey);
    setDoctor(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      doctor,
      isAuthenticated: Boolean(doctor && localStorage.getItem(authTokenStorageKey)),
      isCheckingSession,
      login,
      logout,
    }),
    [doctor, isCheckingSession, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
