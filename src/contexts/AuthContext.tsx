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
  /** Signs in as a canonical demo persona. Requires seed data in Supabase. */
  devPreviewSignIn: (role: UserRole) => Promise<{ error: Error | null }>;
};

/** Email addresses for the four canonical demo personas. Password: Demo2025! */
const DEMO_EMAILS: Record<UserRole, string> = {
  ceo:      "sofia@northwindtech.demo",
  hr_rep:   "marcus@northwindtech.demo",
  manager:  "priya@northwindtech.demo",
  employee: "aisha@northwindtech.demo",
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
      setTimeout(() => {
        if (cancelled) return;
        void resolveSession(newSession, `auth event:${event}`);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (cancelled) return;
      void resolveSession(existingSession, "bootstrap");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
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

  /**
   * Signs in as a canonical demo persona via real Supabase auth.
   * Requires the seed data (supabase/seed.sql) to have been applied.
   * Password for all demo accounts: Demo2025!
   */
  const devPreviewSignIn = async (role: UserRole): Promise<{ error: Error | null }> => {
    const email = DEMO_EMAILS[role];
    console.log("[Auth] Dev preview sign-in →", { role, email });
    return signIn(email, "Demo2025!");
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
