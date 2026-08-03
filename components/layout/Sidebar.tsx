import { NavContent } from "@/components/layout/NavContent";

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r">
      <NavContent />
    </aside>
  );
}
