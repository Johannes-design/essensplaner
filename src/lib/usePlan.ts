"use client";
import { useSearchParams } from "next/navigation";
import { useStored } from "./store";

/** Aktueller Plan: ?plan=ID oder der neueste. */
export function useCurrentPlan() {
  const [plans, setPlans] = useStored("plans");
  const params = useSearchParams();
  const id = params.get("plan");
  const plan = plans === undefined ? undefined : (id && plans.find((p) => p.id === id)) || plans[0] || null;
  return { plan, plans, setPlans };
}
