"use client";

import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/lib/constants";

interface UserMenuProps {
  name: string;
  email: string;
  image: string | null;
  /** Nome da empresa da sessão. Some abaixo de `sm` para não espremer a barra. */
  companyName: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function UserMenu({ name, email, image, companyName }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:pr-2.5">
        <Avatar className="size-9 ring-1 ring-primary/30">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="bg-primary/15 text-[var(--panel-lavender)]">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        {/* Some no celular: o nome espremeria a barra sem acrescentar nada que
            o menu aberto não mostre. */}
        <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
          <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
            Bem-vindo,
          </span>
          <span className="max-w-[10rem] truncate text-sm font-semibold">
            {companyName}
          </span>
        </span>
        <ChevronDown
          className="hidden size-4 shrink-0 text-muted-foreground sm:block"
          aria-hidden="true"
        />
        <span className="sr-only">Menu do usuário</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs font-normal text-muted-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={ROUTES.SETTINGS} />}>
          <Settings className="size-4" aria-hidden="true" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut({ redirectTo: "/login" })}>
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
