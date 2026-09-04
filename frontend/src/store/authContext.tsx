import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, EventInvitation } from '../types/index';
import { authService } from '../services/authService';
import { membershipService } from '../services/membershipService';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once the stored token has been verified against the backend on app load. */
  isAuthReady: boolean;
  
  // Auth actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  
  // Invitation actions
  pendingInvitations: EventInvitation[];
  acceptInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  declineInvitation: (invitationId: string) => void;
  refreshInvitations: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('ep_currentUser');
    return stored ? JSON.parse(stored) : null;
  });
  
  const [pendingInvitations, setPendingInvitations] = useState<EventInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // On app load, don't trust the cached user blindly - verify the token
  // against the backend (it may have expired, or the user may be gone).
  useEffect(() => {
    let cancelled = false;
    authService.refreshSession().then((user) => {
      if (cancelled) return;
      setCurrentUser(user);
      setIsAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load pending invitations when user changes
  useEffect(() => {
    let cancelled = false;
    if (currentUser) {
      membershipService.getPendingInvitationsForEmail(currentUser.email).then((invitations) => {
        if (!cancelled) setPendingInvitations(invitations);
      });
    } else {
      setPendingInvitations([]);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await authService.login({ email, password });
      
      if (result.success && result.user) {
        setCurrentUser(result.user);
        // Load invitations
        const invitations = await membershipService.getPendingInvitationsForEmail(result.user.email);
        setPendingInvitations(invitations);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (name: string, email: string, password: string, confirmPassword: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await authService.signup({ name, email, password, confirmPassword });
      
      if (result.success && result.user) {
        setCurrentUser(result.user);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Clear local state immediately so the UI responds instantly; the
    // backend call to invalidate/log the session happens in the background.
    setCurrentUser(null);
    setPendingInvitations([]);
    void authService.logout();
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await authService.resetPassword(email);
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const acceptInvitation = async (invitationId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    setIsLoading(true);
    try {
      const result = await membershipService.acceptInvitation(invitationId);

      if (result.success) {
        // Remove from pending
        setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } finally {
      setIsLoading(false);
    }
  };

  const declineInvitation = (invitationId: string) => {
    void membershipService.declineInvitation(invitationId);
    setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
  };

  const refreshInvitations = () => {
    if (currentUser) {
      membershipService.getPendingInvitationsForEmail(currentUser.email).then(setPendingInvitations);
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: currentUser !== null,
      isLoading,
      isAuthReady,
      login,
      signup,
      logout,
      resetPassword,
      pendingInvitations,
      acceptInvitation,
      declineInvitation,
      refreshInvitations
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
