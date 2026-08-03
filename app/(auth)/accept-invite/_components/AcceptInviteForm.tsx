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
import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
} from "@/schemas/team.schema";
import { acceptInvitationAction } from "@/app/(auth)/accept-invite/actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AcceptInvitationInput>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { token, name: "", password: "" },
  });

  async function onSubmit(values: AcceptInvitationInput) {
    setIsSubmitting(true);

    const result = await acceptInvitationAction(values);

    if (result?.error) {
      if (result.fields) {
        for (const [field, messages] of Object.entries(result.fields)) {
          if (messages?.[0]) {
            form.setError(field as keyof AcceptInvitationInput, { message: messages[0] });
          }
        }
      }
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    // Em caso de sucesso, a action já autentica e redireciona — não há mais
    // o que fazer aqui (ver comentário equivalente em RegisterForm.tsx).
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input autoFocus placeholder="Ana Silva" {...field} />
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
              <FormLabel>Crie uma senha</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Criando conta..." : "Aceitar convite"}
        </Button>
      </form>
    </Form>
  );
}
