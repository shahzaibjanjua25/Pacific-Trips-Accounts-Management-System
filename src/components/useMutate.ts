"use client";

import { useRouter } from "next/navigation";
import { useLoading } from "./LoadingProvider";

/**
 * Standard pattern for CRUD:
 *   await mutate("Saving client…", () => fetch(...));
 * This shows the overlay during the fetch AND during router.refresh().
 */
export function useMutate() {
  const router = useRouter();
  const { run } = useLoading();

  async function mutate<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return run(label, async () => {
      const result = await fn();
      router.refresh();
      return result;
    });
  }

  return mutate;
}