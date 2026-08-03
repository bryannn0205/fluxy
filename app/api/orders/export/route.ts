import { handleApiError } from "@/lib/api-handler";
import { toCsvFilename } from "@/lib/csv";
import { assertPermission } from "@/lib/permissions";
import { requireCompanyForApi } from "@/lib/session";
import { orderExportFilterSchema } from "@/schemas/order.schema";
import { orderService } from "@/services";

/**
 * Route Handler, não Server Action: o download depende de `Content-Type` e
 * `Content-Disposition`, cabeçalhos que uma Server Action não controla. É a
 * mesma razão que justifica a rota de anexos.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const company = await requireCompanyForApi();

    // Antes de qualquer consulta: o CSV leva a base de clientes e o
    // faturamento inteiro num arquivo. Esconder o botão não fecha a rota —
    // ela responde a um GET direto de quem souber a URL.
    assertPermission(company.role, "orders", "export");

    const { searchParams } = new URL(request.url);
    const filters = orderExportFilterSchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      customerId: searchParams.get("customerId") ?? undefined,
    });

    const rows = orderService.streamOrdersCsv(company.id, filters);
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await rows.next();

          if (done) {
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(value));
        } catch (error) {
          // O status 200 e os cabeçalhos já foram enviados quando o primeiro
          // lote falha, então não há como transformar isto num 500 — só
          // encerrar o corpo. O navegador entrega um arquivo truncado, e é
          // por isso que a linha de cabeçalho vai antes de qualquer consulta:
          // um CSV só com cabeçalho é visivelmente vazio, não silenciosamente
          // incompleto.
          controller.error(error);
        }
      },
      cancel() {
        // Aborta o cursor quando quem baixa desiste no meio, em vez de deixar
        // o gerador varrendo o histórico inteiro para ninguém.
        void rows.return(undefined);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${toCsvFilename("pedidos", new Date())}"`,
        // Planilha com dados de um tenant nunca deve encostar em cache
        // compartilhado.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    return handleApiError(error, { resource: "order_export" });
  }
}
