import { createContext, useContext, useState, type ReactNode } from "react";

const MASTER_EMAIL = "sp@tc.mk";
const MASTER_PASSWORD = "bosilovo";
const SESSION_KEY = "bb_master_session";

type MasterAuthContextValue = {
  isMaster: boolean;
  masterSignIn: (email: string, password: string) => boolean;
  masterSignOut: () => void;
};

const MasterAuthContext = createContext<MasterAuthContextValue | undefined>(undefined);

export function MasterAuthProvider({ children }: { children: ReactNode }) {
  const [isMaster, setIsMaster] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });

  const masterSignIn = (email: string, password: string): boolean => {
    if (email === MASTER_EMAIL && password === MASTER_PASSWORD) {
      try { sessionStorage.setItem(SESSION_KEY, "true"); } catch {  }
      setIsMaster(true);
      return true;
    }
    return false;
  };

  const masterSignOut = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {  }
    setIsMaster(false);
  };

  return (
    <MasterAuthContext.Provider value={{ isMaster, masterSignIn, masterSignOut }}>
      {children}
    </MasterAuthContext.Provider>
  );
}

export function useMasterAuth() {
  const ctx = useContext(MasterAuthContext);
  if (!ctx) throw new Error("useMasterAuth must be used within a MasterAuthProvider");
  return ctx;
}
