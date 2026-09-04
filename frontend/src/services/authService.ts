import { User } from '../types/index';
import { api, ApiError } from './api';

interface SignupData {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

const CURRENT_USER_KEY = 'ep_currentUser';
const AUTH_TOKEN_KEY = 'ep_authToken';

class AuthService {
  private currentUser: User | null = null;

  constructor() {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
      } catch {
        this.currentUser = null;
      }
    }
  }

  private persistSession(user: User, token: string) {
    this.currentUser = user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }

  private clearSession() {
    this.currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  async signup(data: SignupData): Promise<AuthResult> {
    try {
      const result = await api.post<AuthResponse>('/auth/register', data);
      this.persistSession(result.user, result.token);
      return { success: true, user: result.user, token: result.token };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async login(data: LoginData): Promise<AuthResult> {
    try {
      const result = await api.post<AuthResponse>('/auth/login', data);
      this.persistSession(result.user, result.token);
      return { success: true, user: result.user, token: result.token };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the network call fails, still clear the local session.
    } finally {
      this.clearSession();
    }
  }

  /**
   * Re-validates the stored token against the backend and refreshes the
   * cached user. Call this on app load instead of trusting localStorage
   * blindly (the token may have expired or the user may have been deleted).
   */
  async refreshSession(): Promise<User | null> {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      this.currentUser = null;
      return null;
    }
    try {
      const result = await api.get<{ user: User }>('/auth/me');
      this.currentUser = result.user;
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(result.user));
      return result.user;
    } catch {
      this.clearSession();
      return null;
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    // Not implemented on the backend yet (needs an email provider).
    // Kept as a stub so the ForgotPassword screen doesn't crash.
    void email;
    return {
      success: false,
      error: 'Password reset is not implemented yet. Coming in a later backend milestone.',
    };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null && !!localStorage.getItem(AUTH_TOKEN_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export const authService = new AuthService();
