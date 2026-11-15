import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../../lib/firebase';

export interface UserProfileData {
  id: number;
  uid: string;
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivitySummary {
  analysesCount: number;
  simulationsCount: number;
  betsCount: number;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfileData | null;
  activity: ActivitySummary | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncProfileWithBackend = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/users/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Falha ao sincronizar perfil com o banco de dados.');
      }
      const data = await response.json();
      setProfile(data.profile ?? null);
      setActivity(data.activitySummary ?? null);
      setAuthError(null);
    } catch (err) {
      console.error('Profile sync error:', err);
      setAuthError(err instanceof Error ? err.message : 'Erro ao sincronizar perfil.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          await syncProfileWithBackend(token);
        } catch (err) {
          console.error('Failed to get ID token:', err);
          setAuthError('Não foi possível obter o token de autenticação.');
        }
      } else {
        setIdToken(null);
        setProfile(null);
        setActivity(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncProfileWithBackend]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
      await syncProfileWithBackend(token);
    } catch (err) {
      console.error('Sign-in failed:', err);
      setAuthError(
        err instanceof Error ? err.message : 'Falha ao autenticar com o Google.'
      );
    }
  }, [syncProfileWithBackend]);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setIdToken(null);
    setProfile(null);
    setActivity(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken(true);
    setIdToken(token);
    await syncProfileWithBackend(token);
  }, [firebaseUser, syncProfileWithBackend]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        activity,
        idToken,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return ctx;
}
