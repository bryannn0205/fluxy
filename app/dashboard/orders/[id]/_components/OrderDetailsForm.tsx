"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  updateOrderDetailsSchema,
  type UpdateOrderDetailsInput,
} from "@/schemas/order.schema";
import { ORDER_PRIORITY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { OrderPriority, PaymentMethod } from "@/lib/generated/prisma/client";
import { updateOrderDetailsAction } from "@/app/dashboard/orders/actions";

const PRIORITY_OPTIONS = Object.entries(ORDER_PRIORITY_LABELS) as [
  OrderPriority,
  string,
][];
const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS) as [
  PaymentMethod,
  string,
][];

// z.string().date() espera YYYY-MM-DD puro. toISOString() sempre normaliza
// para UTC — como o servidor grava expectedDeliveryDate a partir da mesma
// string via `new Date("YYYY-MM-DD")` (meia-noite UTC por spec), o
// round-trip fica consistente independente do fuso do navegador ou servidor.
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

interface OrderDetailsFormProps {
  orderId: string;
  priority: OrderPriority;
  expectedDeliveryDate: Date | null;
  paymentMethod: PaymentMethod | null;
}

export function OrderDetailsForm({
  orderId,
  priority,
  expectedDeliveryDate,
  paymentMethod,
}: OrderDetailsFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UpdateOrderDetailsInput>({
    resolver: zodResolver(updateOrderDetailsSchema),
    defaultValues: {
      orderId,
      priority,
      expectedDeliveryDate: toDateInputValue(expectedDeliveryDate),
      paymentMethod: paymentMethod ?? "",
    },
  });

  async function onSubmit(values: UpdateOrderDetailsInput) {
    setIsSubmitting(true);
    const result = await updateOrderDetailsAction(values);
    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Detalhes atualizados");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prioridade</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Prioridade">
                      {(value: string | null) =>
                        value ? ORDER_PRIORITY_LABELS[value as OrderPriority] : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
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
          name="expectedDeliveryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Previsão de entrega{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Forma de pagamento{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione">
                      {(value: string | null) =>
                        value ? PAYMENT_METHOD_LABELS[value as PaymentMethod] : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </Form>
  );
}
