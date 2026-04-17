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
  const { person } = useAuth();
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!person?.entity_id) {
      setEntityId(null);
      setEntityName(null);
      setLoading(false);
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
          console.error("Failed to load entity:", error);
          setEntityId(person.entity_id);
          setEntityName(null);
        } else {
          setEntityId(data.id);
          setEntityName(data.name);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [person?.entity_id]);

  const setEntity = (id: string, name: string | null) => {
    setEntityId(id);
    setEntityName(name);
    setLoading(false);
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
