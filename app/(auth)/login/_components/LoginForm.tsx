"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { loginSchema, type LoginInput } from "@/schemas/auth.schema";
import type { PlanIntent } from "@/lib/plan-intent";
import { loginAction } from "@/app/(auth)/login/actions";

interface LoginFormProps {
  /** Validada no servidor pela página; revalidada de novo pela action. */
  intent: PlanIntent | null;
}

/** Altura, respiro para o ícone e cor de fundo comuns aos dois campos. */
const CLASSES_DO_CAMPO =
  "h-12 rounded-xl border-border bg-[var(--auth-field)] pl-11 text-sm placeholder:text-muted-foreground/70";

export function LoginForm({ intent }: LoginFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setIsSubmitting(true);

    const result = await loginAction(
      values,
      intent ? { plan: intent.plan, billing: intent.billing } : undefined,
    );

    if (result.error) {
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              {/* O `div` de posicionamento fica FORA do FormControl, e não em
                  volta dele. O FormControl repassa `id`, `aria-invalid` e
                  `aria-describedby` para o SEU filho direto: com o `div` no
                  meio, quem recebia o `id` era o `div`, o `htmlFor` do label
                  apontava para ele e o campo ficava sem rótulo acessível. */}
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <FormControl>
                  <Input
                    type="email"
                    autoFocus
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                    className={CLASSES_DO_CAMPO}
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-3">
                <FormLabel>Senha</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-sm text-[var(--auth-lavender)] underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <FormControl>
                  <Input
                    type={senhaVisivel ? "text" : "password"}
                    autoComplete="current-password"
                    className={`${CLASSES_DO_CAMPO} pr-14`}
                    {...field}
                  />
                </FormControl>
                {/* `type="button"`: dentro de um form, o padrão é `submit`, e
                    alternar a visibilidade enviaria o formulário. */}
                <button
                  type="button"
                  onClick={() => setSenhaVisivel((visivel) => !visivel)}
                  aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={senhaVisivel}
                  // `size-11` são os 44px de alvo de toque recomendados, e
                  // ainda cabem dentro do campo de 48px.
                  className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {senhaVisivel ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-xl text-sm font-semibold shadow-[0_10px_30px_-10px] shadow-primary/70 transition-shadow duration-200 hover:shadow-primary/90"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </Form>
  );
}
