import { createContext, useContext, useState, type ReactNode } from "react";

type YearContextValue = {
  selected_year: number;
  setSelectedYear: (year: number) => void;
};

const YearContext = createContext<YearContextValue | undefined>(undefined);

export function YearProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  return (
    <YearContext.Provider value={{ selected_year: selectedYear, setSelectedYear }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error("useYear must be used within a YearProvider");
  return ctx;
}
