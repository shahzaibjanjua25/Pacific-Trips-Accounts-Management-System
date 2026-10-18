"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type LoadingCtx = {
  isLoading: boolean;
  label: string;
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  begin: (label?: string) => void;
  end: () => void;
};

const Ctx = createContext<LoadingCtx | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState("");
  const labelStack = useRef<string[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ⭐ Auto-clear loading screen when route successfully changes
  useEffect(() => {
    // Whenever the URL changes, we force the loading state off
    setCount(0);
    setLabel("");
    labelStack.current = [];
  }, [pathname, searchParams]);

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