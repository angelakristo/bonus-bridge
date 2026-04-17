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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const devPreviewActiveRef = useRef(false);

  const loadPersonAndRoles = async (userId: string) => {
    const { data: personData, error: personError } = await supabase
      .from("people")
      .select("id, entity_id, first_name, last_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (personError || !personData) {
      if (personError) console.error("[Auth] Failed to load person:", personError);
      setPerson(null);
      setRoles([]);
      return;
    }

    setPerson(personData);

    const { data: rolesData, error: rolesError } = await supabase
      .from("people_roles")
      .select("role")
      .eq("person_id", personData.id);

    if (rolesError) {
      console.error("[Auth] Failed to load roles:", rolesError);
      setRoles([]);
      return;
    }

    setRoles(rolesData?.map((r) => r.role) ?? []);
  };

  const resolveSession = async (newSession: Session | null) => {
    setSession(newSession);
    setSupabaseUser(newSession?.user ?? null);

    if (!newSession?.user) {
      setPerson(null);
      setRoles([]);
      console.log("[Auth] No session — user signed out or not signed in.");
      return;
    }

    console.log("[Auth] Resolving session for user:", newSession.user.id);
    await loadPersonAndRoles(newSession.user.id);
  };

  useEffect(() => {
    let cancelled = false;

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (devPreviewActiveRef.current) return; // ignore real auth events while dev preview is active
      // Defer Supabase calls to avoid deadlock inside the callback
      setTimeout(() => {
        if (cancelled) return;
        resolveSession(newSession).finally(() => {
          if (cancelled) return;
          setLoading(false);
          setReady(true);
          console.log("[Auth] Ready (event:", event, ")");
        });
      }, 0);
    });

    // THEN check existing session (single source of bootstrap completion)
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (cancelled || devPreviewActiveRef.current) return;
      resolveSession(existingSession).finally(() => {
        if (cancelled) return;
        setLoading(false);
        setReady(true);
        console.log("[Auth] Ready (bootstrap)");
      });
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
    await supabase.auth.signOut();
    setSession(null);
    setSupabaseUser(null);
    setPerson(null);
    setRoles([]);
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
    console.log("[Auth] Dev preview sign-in as", role);
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
