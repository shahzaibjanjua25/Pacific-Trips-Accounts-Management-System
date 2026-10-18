"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type LoadingCtx = {
  /** true if any operation is in flight */
  isLoading: boolean;
  /** current label shown to user (e.g. "Saving transaction…") */
  label: string;
  /** wrap any async function; shows overlay + returns result */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  /** manual increment/decrement */
  begin: (label?: string) => void;
  end: () => void;
};

const Ctx = createContext<LoadingCtx | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState("");
  const labelStack = useRef<string[]>([]);

  const begin = useCallback((l?: string) => {
    setCount((c) => c + 1);
    if (l) {
      labelStack.current.push(l);
      setLabel(l);
    }
  }, []);

  const end = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
    labelStack.current.pop();
    setLabel(labelStack.current[labelStack.current.length - 1] ?? "");
  }, []);

  const run = useCallback(
    async <T,>(l: string, fn: () => Promise<T>): Promise<T> => {
      begin(l);
      try {
        return await fn();
      } finally {
        end();
      }
    },
    [begin, end]
  );

  const value = useMemo(
    () => ({ isLoading: count > 0, label, run, begin, end }),
    [count, label, run, begin, end]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLoading() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      isLoading: false,
      label: "",
      run: async <T,>(_: string, fn: () => Promise<T>) => fn(),
      begin: () => {},
      end: () => {},
    } as LoadingCtx;
  }
  return ctx;
}