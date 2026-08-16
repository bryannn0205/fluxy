import { NavContent } from "@/components/layout/NavContent";
import type { Role } from "@/lib/generated/prisma/client";

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:w-[15.5rem] lg:flex-col">
      <NavContent role={role} />
    </aside>
  );
}
