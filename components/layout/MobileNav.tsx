"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavContent } from "@/components/layout/NavContent";
import type { Role } from "@/lib/generated/prisma/client";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          // `size-11` sobrepõe os 32px do tamanho "icon": é o controle
          // principal de navegação no celular, e 44px é o alvo de toque que
          // Apple e Material recomendam para o dedo.
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <div onClick={() => setOpen(false)}>
          <NavContent role={role} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
