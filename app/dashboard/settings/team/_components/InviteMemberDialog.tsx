"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { inviteMemberSchema, type InviteMemberInput } from "@/schemas/team.schema";
import { ROLE_LABELS } from "@/lib/constants";
import { inviteMemberAction } from "@/app/dashboard/settings/team/actions";

// OWNER fora da lista: conceder posse é sensível demais para caber num convite
// por e-mail. Só depois, via alteração de papel, e só por quem já é OWNER.
const INVITABLE_ROLES: InviteMemberInput["role"][] = [
  "ADMIN",
  "MANAGER",
  "OPERATOR",
  "FINANCE",
  "VIEWER",
];

export function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "OPERATOR" },
  });

  async function onSubmit(values: InviteMemberInput) {
    setIsSubmitting(true);
    const result = await inviteMemberAction(values);
    setIsSubmitting(false);

    if (result.error) {
      if (result.fields) {
        for (const [field, messages] of Object.entries(result.fields)) {
          if (messages?.[0]) {
            form.setError(field as keyof InviteMemberInput, { message: messages[0] });
          }
        }
      }
      toast.error(result.error);
      return;
    }

    toast.success("Convite enviado");
    setOpen(false);
    form.reset({ email: "", role: "OPERATOR" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <UserPlus className="size-4" aria-hidden="true" />
            Convidar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar para a equipe</DialogTitle>
          <DialogDescription>
            Enviamos um link por e-mail para a pessoa criar sua conta.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoFocus
                      placeholder="pessoa@empresa.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Papel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Papel">
                          {(value: string | null) =>
                            value ? ROLE_LABELS[value as InviteMemberInput["role"]] : null
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {isSubmitting ? "Enviando..." : "Enviar convite"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
