// Auth.js v5 declara Session/User/JWT em @auth/core, não em "next-auth"
// diretamente — o augmentation precisa mirar o módulo onde a interface é
// de fato declarada, senão o merge de tipos não acontece silenciosamente.
import type { Role } from "@/lib/generated/prisma/client";
import type { DefaultSession } from "@auth/core/types";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    companyId: string;
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    companyId: string;
    role: Role;
  }
}
