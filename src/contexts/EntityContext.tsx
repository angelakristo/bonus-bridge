import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type EntityContextValue = {
  entity_id: string | null;
  entity_name: string | null;
  loading: boolean;
  setEntity: (id: string, name: string | null) => void;
};

const EntityContext = createContext<EntityContextValue | undefined>(undefined);

export function EntityProvider({ children }: { children: ReactNode }) {
  const { person, ready: authReady, session } = useAuth();
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  // Start as loading; only become ready after auth resolves AND we've evaluated person.
  const [loading, setLoading] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    // Wait for auth to finish bootstrapping before deciding anything.
    if (!authReady) {
      console.log("[Entity] Waiting for auth to be ready...");
      return;
    }

    // If a manual setEntity was called (e.g., right after registration), don't overwrite it.
    if (manualOverride) {
      setLoading(false);
      return;
    }

    // No session → no entity, resolved.
    if (!session) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
      console.log("[Entity] No session → entity_id=null (resolved)");
      return;
    }

    // Signed in but person row hasn't loaded yet — keep loading.
    if (!person) {
      setLoading(true);
      console.log("[Entity] Auth ready, waiting on person row...");
      return;
    }

    // Person loaded but has no entity link → confirmed null.
    if (!person.entity_id) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
      console.log("[Entity] Person has no entity_id → resolved as null");
      return;
    }

    let cancelled = false;
    setLoading(true);

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
        } else {
          setEntityId(data.id);
          setEntityName(data.name);
        }
        setLoading(false);
        console.log("[Entity] Resolved entity_id:", person.entity_id);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, session, person, manualOverride]);

  const setEntity = (id: string, name: string | null) => {
    setEntityId(id);
    setEntityName(name);
    setLoading(false);
    setManualOverride(true);
    console.log("[Entity] Manual setEntity:", id);
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
