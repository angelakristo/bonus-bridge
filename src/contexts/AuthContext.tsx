import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type UserRole = Database["public"]["Enums"]["user_role"];

export type Person = {
  id: string;
  entity_id: string | null;
  first_name: string;
  last_name: string;
};

type AuthContextValue = {
  session: Session | null;
  supabaseUser: User | null;
  person: Person | null;
  roles: UserRole[];
  loading: boolean;
  /** True once the initial session + person + roles resolution has completed. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  devPreviewSignIn: (role: UserRole) => void;
};

type HydratedAuthState = {
  person: Person | null;
  roles: UserRole[];
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const getCurrentPathname = () => (typeof window !== "undefined" ? window.location.pathname : "server");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const devPreviewActiveRef = useRef(false);
  const resolutionIdRef = useRef(0);

  const loadPersonAndRoles = async (userId: string): Promise<HydratedAuthState> => {
    const { data: personData, error: personError } = await supabase
      .from("people")
      .select("id, entity_id, first_name, last_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (personError) {
      console.error("[Auth] Failed to load person:", personError);
      return { person: null, roles: [] };
    }

    if (!personData) {
      return { person: null, roles: [] };
    }

    const { data: rolesData, error: rolesError } = await supabase
      .from("people_roles")
      .select("role")
      .eq("person_id", personData.id);

    if (rolesError) {
      console.error("[Auth] Failed to load roles:", rolesError);
      return { person: personData, roles: [] };
    }

    return {
      person: personData,
      roles: rolesData?.map((record) => record.role) ?? [],
    };
  };

  const resolveSession = async (newSession: Session | null, source: string) => {
    const resolutionId = ++resolutionIdRef.current;

    setLoading(true);
    setReady(false);
    setSession(newSession);
    setSupabaseUser(newSession?.user ?? null);

    if (!newSession?.user) {
      if (resolutionId !== resolutionIdRef.current) return;
      setPerson(null);
      setRoles([]);
      setLoading(false);
      setReady(true);
      console.log("[Auth] Resolved", {
        pathname: getCurrentPathname(),
        userId: null,
        role: null,
        roles: [],
        entity_id: null,
        loading: { authLoading: false, authReady: true },
        redirectTarget: null,
        reason: `auth resolved without session from ${source}`,
      });
      return;
    }

    console.log("[Auth] Resolving session", {
      pathname: getCurrentPathname(),
      userId: newSession.user.id,
      role: null,
      roles: [],
      entity_id: null,
      loading: { authLoading: true, authReady: false },
      redirectTarget: null,
      reason: `hydrating auth state from ${source}`,
    });

    const hydrated = await loadPersonAndRoles(newSession.user.id);

    if (resolutionId !== resolutionIdRef.current) {
      console.log("[Auth] Ignored stale resolution", {
        pathname: getCurrentPathname(),
        userId: newSession.user.id,
        role: hydrated.roles[0] ?? null,
        roles: hydrated.roles,
        entity_id: hydrated.person?.entity_id ?? null,
        loading: { authLoading: true, authReady: false },
        redirectTarget: null,
        reason: `stale auth resolution from ${source}`,
      });
      return;
    }

    setPerson(hydrated.person);
    setRoles(hydrated.roles);
    setLoading(false);
    setReady(true);

    console.log("[Auth] Resolved", {
      pathname: getCurrentPathname(),
      userId: newSession.user.id,
      role: hydrated.roles[0] ?? null,
      roles: hydrated.roles,
      entity_id: hydrated.person?.entity_id ?? null,
      loading: { authLoading: false, authReady: true },
      redirectTarget: null,
      reason: `auth resolved from ${source}`,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (devPreviewActiveRef.current) return;
      setTimeout(() => {
        if (cancelled) return;
        void resolveSession(newSession, `auth event:${event}`);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (cancelled || devPreviewActiveRef.current) return;
      void resolveSession(existingSession, "bootstrap");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    devPreviewActiveRef.current = false;
    setLoading(true);
    setReady(false);
    await supabase.auth.signOut();
    setSession(null);
    setSupabaseUser(null);
    setPerson(null);
    setRoles([]);
    setLoading(false);
    setReady(true);
    console.log("[Auth] Signed out", {
      pathname: getCurrentPathname(),
      userId: null,
      role: null,
      roles: [],
      entity_id: null,
      loading: { authLoading: false, authReady: true },
      redirectTarget: "/login",
      reason: "explicit sign out",
    });
  };

  const devPreviewSignIn = (role: UserRole) => {
    devPreviewActiveRef.current = true;
    const mockUserId = "dev-preview-user";
    const mockSession = {
      access_token: "dev-preview",
      refresh_token: "dev-preview",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: mockUserId, email: `${role}@preview.local` } as User,
    } as unknown as Session;
    resolutionIdRef.current += 1;
    setSession(mockSession);
    setSupabaseUser(mockSession.user);
    setPerson({
      id: "dev-preview-person",
      entity_id: role === "hr_rep" ? null : "dev-preview-entity",
      first_name: "Preview",
      last_name: role.toUpperCase(),
    });
    setRoles([role]);
    setLoading(false);
    setReady(true);
    console.log("[Auth] Dev preview sign-in", {
      pathname: getCurrentPathname(),
      userId: mockUserId,
      role,
      roles: [role],
      entity_id: role === "hr_rep" ? null : "dev-preview-entity",
      loading: { authLoading: false, authReady: true },
      redirectTarget: "/",
      reason: "manual dev preview sign-in",
    });
  };

  return (
    <AuthContext.Provider
      value={{ session, supabaseUser, person, roles, loading, ready, signIn, signOut, devPreviewSignIn }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
