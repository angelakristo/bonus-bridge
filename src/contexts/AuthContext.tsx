import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type UserRole = Database["public"]["Enums"]["user_role"];

export type Person = {
  id: string;
  entity_id: string;
  first_name: string;
  last_name: string;
};

type AuthContextValue = {
  session: Session | null;
  supabaseUser: User | null;
  person: Person | null;
  roles: UserRole[];
  loading: boolean;
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

  const loadPersonAndRoles = async (userId: string) => {
    const { data: personData, error: personError } = await supabase
      .from("people")
      .select("id, entity_id, first_name, last_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (personError || !personData) {
      console.error("Failed to load person:", personError);
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
      console.error("Failed to load roles:", rolesError);
      setRoles([]);
      return;
    }

    setRoles(rolesData?.map((r) => r.role) ?? []);
  };

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setSupabaseUser(newSession?.user ?? null);

      if (event === "SIGNED_OUT" || !newSession?.user) {
        setPerson(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      // Defer Supabase calls to avoid deadlock inside the callback
      setTimeout(() => {
        loadPersonAndRoles(newSession.user.id).finally(() => setLoading(false));
      }, 0);
    });

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setSupabaseUser(existingSession?.user ?? null);

      if (!existingSession?.user) {
        setLoading(false);
        return;
      }

      loadPersonAndRoles(existingSession.user.id).finally(() => setLoading(false));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setSupabaseUser(null);
    setPerson(null);
    setRoles([]);
  };

  const devPreviewSignIn = (role: UserRole) => {
    // Dev-only: injects an in-memory mock session so protected screens render.
    // No Supabase writes; queries depending on a real auth user will return empty.
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
      entity_id: "dev-preview-entity",
      first_name: "Preview",
      last_name: role.toUpperCase(),
    });
    setRoles([role]);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{ session, supabaseUser, person, roles, loading, signIn, signOut, devPreviewSignIn }}
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
