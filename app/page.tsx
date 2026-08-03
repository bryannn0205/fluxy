import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";

export default async function RootPage() {
  const session = await auth();
  redirect(session ? ROUTES.DASHBOARD : ROUTES.LOGIN);
}
