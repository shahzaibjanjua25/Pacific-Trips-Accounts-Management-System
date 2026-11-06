"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type LoadingContext = {
  isLoading: boolean;
  label: string;
  run: <T>(label: string, action: () => Promise<T>) => Promise<T>;
};

const Context = createContext<LoadingContext | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const sequence = useRef(0);
  const [operations, setOperations] = useState<{ id: number; label: string }[]>([]);

  const run = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    const id = ++sequence.current;
    setOperations((active) => [...active, { id, label }]);
    try {
      return await action();
    } finally {
      setOperations((active) => active.filter((operation) => operation.id !== id));
    }
  }, []);

  return (
    <Context.Provider value={{
      isLoading: operations.length > 0,
      label: operations.at(-1)?.label ?? "",
      run,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useLoading() {
  const context = useContext(Context);
  if (!context) throw new Error("useLoading requires LoadingProvider");
  return context;
}
