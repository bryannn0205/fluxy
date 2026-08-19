"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { registerSchema, type RegisterInput } from "@/schemas/auth.schema";
import type { PlanIntent } from "@/lib/plan-intent";
import { registerAction, registerFormAction } from "@/app/(auth)/register/actions";

interface RegisterFormProps {
  /** Validada no servidor pela página; revalidada de novo pela action. */
  intent: PlanIntent | null;
}

/**
 * A intenção viaja como argumento separado da action, não como campo do
 * formulário. Não há `<input type="hidden">` de plano: o formulário já entrega
 * um objeto ao Server Action, e misturar a intenção nele a colocaria dentro de
 * `RegisterInput` — exatamente o tipo que não pode conhecê-la.
 */
export function RegisterForm({ intent }: RegisterFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { companyName: "", name: "", email: "", password: "" },
  });

  async function onSubmit(values: RegisterInput) {
    setIsSubmitting(true);

    const result = await registerAction(
      values,
      intent ? { plan: intent.plan, billing: intent.billing } : undefined,
    );

    if (result?.error) {
      if (result.fields) {
        for (const [field, messages] of Object.entries(result.fields)) {
          if (messages?.[0]) {
            form.setError(field as keyof RegisterInput, { message: messages[0] });
          }
        }
      }
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    // Em caso de sucesso, a action redireciona — não há mais o que fazer aqui.
  }

  return (
    <Form {...form}>
      {/* `action` torna o HTML servido seguro sozinho: sem ela o form
          submeteria em GET para a própria URL e levaria a senha na query
          enquanto o React ainda não hidratou. Ver LoginForm. */}
      <form
        action={registerFormAction}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        {intent && (
          <>
            <input type="hidden" name="plan" value={intent.plan} />
            <input type="hidden" name="billing" value={intent.billing} />
          </>
        )}
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da empresa</FormLabel>
              <FormControl>
                <Input autoFocus placeholder="Sorveteria da Ana" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input placeholder="Ana Silva" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" placeholder="ana@empresa.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Criando conta..." : "Criar conta grátis"}
        </Button>
      </form>
    </Form>
  );
}
