/**
 * Authentication Context
 * Manages user authentication state, login, logout, and token refresh
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '../lib/api-client';
import {
    authApi,
    clearTokens,
    getAccessToken,
    getRefreshToken,
    getStoredUser,
    refreshTokenIfNeeded,
    setTokens,
} from '../lib/api-client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    confirm_password: string;
    full_name: string;
    role?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = getAccessToken();
      const storedUser = getStoredUser();

      if (token && storedUser) {
        try {
          // Proactively refresh token if expired (avoids 401 error)
          await refreshTokenIfNeeded();

          // Verify token is still valid by fetching current user
          const currentUser = await authApi.getMe();
          setUser(currentUser);
        } catch {
          // Token invalid or refresh failed, clear storage
          clearTokens();
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setTokens(response.access_token, response.refresh_token, response.user, response.expires_in);
    setUser(response.user);
  }, []);

  const register = useCallback(async (data: {
    email: string;
    username: string;
    password: string;
    confirm_password: string;
    full_name: string;
    role?: string;
  }) => {
    const response = await authApi.register(data);
    setTokens(response.access_token, response.refresh_token, response.user, response.expires_in);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore logout errors
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authApi.getMe();
      setUser(currentUser);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
