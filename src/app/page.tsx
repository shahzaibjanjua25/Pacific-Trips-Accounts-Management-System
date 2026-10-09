import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";

export default async function Home() {
  const uid = await getSessionUserId();
  redirect(uid ? "/dashboard" : "/login");
}