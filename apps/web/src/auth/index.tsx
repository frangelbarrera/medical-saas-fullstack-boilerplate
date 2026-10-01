/**
 * Session provider: loads /auth/session, exposes the profile + capabilities
 * and handles expiry. Components gate behaviour on capabilities, never on
 * role strings (ARCH-003).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Capability, SessionProfile } from "@medical/contracts";
import { api } from "../lib/api.js";

interface AuthValue {
  profile: SessionProfile | null;
  loading: boolean;
  can: (capability: Capability) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  profile: null,
  loading: true,
  can: () => false,
  logout: async () => undefined,
  refresh: async () => undefined,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await api.session();
      setProfile(session);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onExpired = () => setProfile(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setProfile(null);
  }, []);

  const can = useCallback(
    (capability: Capability) => Boolean(profile?.capabilities.includes(capability)),
    [profile],
  );

  const value = useMemo(
    () => ({ profile, loading, can, logout, refresh }),
    [profile, loading, can, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useSession = (): AuthValue => useContext(AuthContext);
