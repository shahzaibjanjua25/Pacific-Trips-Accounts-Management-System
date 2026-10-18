"use client";

import { useRouter } from "next/navigation";
import { useLoading } from "./LoadingProvider";

export function useMutate() {
  const router = useRouter();
  const { run } = useLoading();

  async function mutate<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return run(label, async () => {
      try {
        const result = await fn();
        router.refresh();
        return result;
      } catch (error) {
        throw error; // ensures the `finally` in LoadingProvider catches it and hides the overlay
      }
    });
  }

  return mutate;
}