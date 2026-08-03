import { handleApiError } from "@/lib/api-handler";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "@/lib/constants";
import { ExternalServiceError, NotFoundError, ValidationError } from "@/lib/errors";
import { matchesFileSignature } from "@/lib/file-signature";
import { isR2Configured, uploadFile } from "@/lib/r2";
import { requireCompanyForApi } from "@/lib/session";
import {
  orderAttachmentService,
  orderService,
  subscriptionGateService,
} from "@/services";
import { createOrderAttachmentSchema } from "@/schemas/order.schema";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const { id: orderId } = await params;

  try {
    // Variante que lança 401 em vez de redirecionar: quem chama esta rota
    // espera JSON, não uma página de login.
    const company = await requireCompanyForApi();

    if (!isR2Configured()) {
      throw new ExternalServiceError(
        "cloudflare-r2",
        new Error("Upload de arquivos indisponível: R2 não configurado"),
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = formData.get("category");

    const validation = createOrderAttachmentSchema.safeParse({ category });
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    if (!(file instanceof File)) {
      throw new ValidationError({ file: ["Arquivo é obrigatório"] });
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new ValidationError({
        file: [
          `Arquivo excede o tamanho máximo de ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB`,
        ],
      });
    }

    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
      )
    ) {
      throw new ValidationError({ file: ["Tipo de arquivo não permitido"] });
    }

    // Valida plano ativo e posse do pedido ANTES de subir para o R2: sem essa
    // checagem, um orderId inexistente ou de outra empresa ainda assim
    // resultaria em upload bem-sucedido seguido de falha ao persistir o
    // registro — deixando um arquivo órfão no bucket, sem nenhum registro
    // no banco que permita limpá-lo depois.
    subscriptionGateService.assertCanWrite(company);

    const order = await orderService.findById(orderId, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // O MIME type acima é só o que o navegador declarou — confere os bytes
    // reais contra a assinatura esperada antes de aceitar o upload.
    if (!matchesFileSignature(buffer, file.type)) {
      throw new ValidationError({
        file: ["O conteúdo do arquivo não corresponde ao tipo declarado"],
      });
    }

    const fileKey = `${company.id}/orders/${orderId}/${Date.now()}-${sanitizeFileName(file.name)}`;

    await uploadFile(fileKey, buffer, file.type);

    const attachment = await orderAttachmentService.create(
      {
        orderId,
        uploadedById: company.userId,
        category: validation.data.category,
        fileName: file.name,
        fileKey,
        mimeType: file.type,
        sizeBytes: file.size,
      },
      company,
      company.userId,
    );

    return Response.json({ data: attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { resource: "order_attachment", resourceId: orderId });
  }
}
