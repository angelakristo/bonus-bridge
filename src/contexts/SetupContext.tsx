import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";

type SetupContextValue = {
  isSetupComplete: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SetupContext = createContext<SetupContextValue | undefined>(undefined);

export function SetupProvider({ children }: { children: ReactNode }) {
  const { roles } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();

  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshCountRef = useRef(0);

  const isSetupUser = roles.includes("ceo") || roles.includes("hr_rep");

  const load = useCallback(async () => {
    if (!isSetupUser) {
      setIsSetupComplete(true);
      setLoading(false);
      return;
    }

    if (entityLoading) {
      setLoading(true);
      return;
    }

    if (!entity_id) {
      setIsSetupComplete(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("setup_progress")
      .select("status")
      .eq("entity_id", entity_id)
      .eq("step_key", "assign_bonus_schemes")
      .maybeSingle();

    setIsSetupComplete(data?.status === "complete");
    setLoading(false);
  }, [entity_id, entityLoading, isSetupUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback((): Promise<void> => {
    refreshCountRef.current += 1;
    return load();
  }, [load]);

  return (
    <SetupContext.Provider value={{ isSetupComplete, loading, refresh }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetupStatus() {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetupStatus must be used within a SetupProvider");
  return ctx;
}
