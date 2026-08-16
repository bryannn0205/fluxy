import { NavContent } from "@/components/layout/NavContent";
import type { Role } from "@/lib/generated/prisma/client";

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r">
      <NavContent role={role} />
    </aside>
  );
}
