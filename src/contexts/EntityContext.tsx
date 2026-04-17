import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type EntityContextValue = {
  entity_id: string | null;
  entity_name: string | null;
  loading: boolean;
  setEntity: (id: string, name: string | null) => void;
};

const EntityContext = createContext<EntityContextValue | undefined>(undefined);

const getCurrentPathname = () => (typeof window !== "undefined" ? window.location.pathname : "server");

export function EntityProvider({ children }: { children: ReactNode }) {
  const { person, ready: authReady, loading: authLoading, session, roles, supabaseUser } = useAuth();
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  const logEntityState = (redirectTarget: string | null, reason: string, resolvedEntityId?: string | null) => {
    console.log("[Entity]", {
      pathname: getCurrentPathname(),
      userId: supabaseUser?.id ?? session?.user?.id ?? null,
      role: roles[0] ?? null,
      roles,
      entity_id: resolvedEntityId ?? person?.entity_id ?? entityId ?? null,
      loading: { authReady, authLoading, entityLoading: loading },
      redirectTarget,
      reason,
    });
  };

  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (lastUserIdRef.current === currentUserId) return;

    lastUserIdRef.current = currentUserId;
    setManualOverride(false);

    if (!currentUserId) {
      setEntityId(null);
      setEntityName(null);
      logEntityState(null, "cleared entity state because auth user changed to none", null);
      return;
    }

    logEntityState(null, "cleared manual entity override because auth user changed", entityId);
  }, [entityId, roles, session?.user?.id, supabaseUser?.id]);

  useEffect(() => {
    if (!authReady || authLoading) {
      setLoading(true);
      logEntityState(null, "waiting for auth, role, and person resolution before resolving entity");
      return;
    }

    if (!session) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
      logEntityState(null, "resolved entity as null because there is no authenticated session", null);
      return;
    }

    if (manualOverride) {
      setLoading(false);
      logEntityState(null, "keeping manual entity override after successful registration", entityId);
      return;
    }

    if (!person) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
      logEntityState(null, "person/profile resolved as missing so entity stays null", null);
      return;
    }

    if (!person.entity_id) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
      logEntityState(null, "person resolved without entity_id", null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    logEntityState(null, "fetching entity record for resolved entity_id", person.entity_id);

    supabase
      .from("entities")
      .select("id, name")
      .eq("id", person.entity_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error || !data) {
          console.error("[Entity] Failed to load entity:", error);
          setEntityId(person.entity_id);
          setEntityName(null);
          setLoading(false);
          logEntityState(null, "entity lookup failed; keeping resolved entity_id only", person.entity_id);
          return;
        }

        setEntityId(data.id);
        setEntityName(data.name);
        setLoading(false);
        logEntityState(null, "entity resolved from entities table", data.id);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, authLoading, session, person, manualOverride, entityId, roles, supabaseUser?.id]);

  const setEntity = (id: string, name: string | null) => {
    setEntityId(id);
    setEntityName(name);
    setLoading(false);
    setManualOverride(true);
    logEntityState("/org-departments", "manual entity update after successful registration", id);
  };

  return (
    <EntityContext.Provider value={{ entity_id: entityId, entity_name: entityName, loading, setEntity }}>
      {children}
    </EntityContext.Provider>
  );
}

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error("useEntity must be used within an EntityProvider");
  return ctx;
}
