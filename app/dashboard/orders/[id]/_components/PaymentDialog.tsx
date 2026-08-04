"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { PaymentMethod } from "@/lib/generated/prisma/enums";
import { formatCurrency } from "@/lib/formatters";
import {
  refundPaymentSchema,
  registerPaymentSchema,
  type RefundPaymentInput,
  type RegisterPaymentInput,
} from "@/schemas/payment.schema";
import {
  refundPaymentAction,
  registerPaymentAction,
} from "@/app/dashboard/orders/[id]/payments/actions";

const METODOS = Object.values(PaymentMethod);

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PaymentDialogProps {
  orderId: string;
  /** Recebimento ou estorno — muda validação, texto e ação. */
  modo: "PAYMENT" | "REFUND";
  /** Teto do campo: restante a receber, ou valor já recebido no estorno. */
  maximo: number;
  /** Botão que abre o diálogo — o Base UI o clona via `render`. */
  gatilho: React.ReactElement;
}

export function PaymentDialog({ orderId, modo, maximo, gatilho }: PaymentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ehEstorno = modo === "REFUND";

  const form = useForm<RegisterPaymentInput | RefundPaymentInput>({
    resolver: zodResolver(ehEstorno ? refundPaymentSchema : registerPaymentSchema),
    defaultValues: {
      orderId,
      amount: maximo,
      method: "PIX",
      paidAt: hoje(),
      note: "",
      idempotencyKey: "",
    },
  });

  // A chave nasce quando o diálogo abre, não a cada render: é ela que faz
  // clique duplo e retry do navegador virarem um lançamento só. Gerá-la no
  // submit criaria uma nova a cada tentativa, anulando a proteção.
  useEffect(() => {
    if (open) {
      form.reset({
        orderId,
        amount: maximo,
        method: "PIX",
        paidAt: hoje(),
        note: "",
        idempotencyKey: crypto.randomUUID(),
      });
    }
  }, [open, orderId, maximo, form]);

  async function onSubmit(values: RegisterPaymentInput | RefundPaymentInput) {
    setIsSubmitting(true);
    const resultado = ehEstorno
      ? await refundPaymentAction(values)
      : await registerPaymentAction(values);
    setIsSubmitting(false);

    if (resultado.error) {
      toast.error(resultado.error);
      return;
    }

    toast.success(ehEstorno ? "Estorno registrado" : "Pagamento registrado");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={gatilho} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ehEstorno ? "Estornar valor" : "Registrar pagamento"}
          </DialogTitle>
          <DialogDescription>
            {ehEstorno
              ? `Valor recebido disponível para estorno: ${formatCurrency(maximo)}.`
              : `Restante a receber: ${formatCurrency(maximo)}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {METODOS.map((metodo) => (
                        <SelectItem key={metodo} value={metodo}>
                          {PAYMENT_METHOD_LABELS[metodo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paidAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {ehEstorno ? "Motivo do estorno" : "Observação (opcional)"}
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {ehEstorno ? "Estornar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
