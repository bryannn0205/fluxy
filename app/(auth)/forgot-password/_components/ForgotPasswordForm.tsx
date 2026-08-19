"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
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
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth.schema";
import {
  forgotPasswordAction,
  forgotPasswordFormAction,
} from "@/app/(auth)/forgot-password/actions";

export function ForgotPasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setIsSubmitting(true);
    const result = await forgotPasswordAction(values);
    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Se existir uma conta com este e-mail, enviamos um link para redefinir a senha.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      {/* `action` deixa o HTML seguro sozinho: sem ela o envio antes da
          hidratação seria um GET com o e-mail na query. Ver LoginForm. */}
      <form
        action={forgotPasswordFormAction}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" autoFocus placeholder="voce@empresa.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Enviando..." : "Enviar link de recuperação"}
        </Button>
      </form>
    </Form>
  );
}
