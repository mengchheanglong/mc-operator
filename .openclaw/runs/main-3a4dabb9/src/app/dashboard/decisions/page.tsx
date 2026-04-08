import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  redirect("/dashboard/docs?tag=decision");
}
