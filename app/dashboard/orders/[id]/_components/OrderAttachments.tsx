"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_CATEGORY_LABELS,
} from "@/lib/constants";
import type { AttachmentCategory } from "@/lib/generated/prisma/client";
import { deleteOrderAttachmentAction } from "@/app/dashboard/orders/actions";

const CATEGORY_OPTIONS = Object.entries(ATTACHMENT_CATEGORY_LABELS) as [
  AttachmentCategory,
  string,
][];

export interface AttachmentItem {
  id: string;
  category: AttachmentCategory;
  fileName: string;
  sizeBytes: number;
  uploadedBy: { name: string };
}

interface OrderAttachmentsProps {
  orderId: string;
  attachments: AttachmentItem[];
  isUploadAvailable: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderAttachments({
  orderId,
  attachments,
  isUploadAvailable,
}: OrderAttachmentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<AttachmentCategory>("OUTRO");
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const response = await fetch(`/api/orders/${orderId}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(body?.message ?? "Falha ao enviar arquivo");
        return;
      }

      toast.success("Arquivo enviado");
      router.refresh();
    } catch {
      toast.error("Falha ao enviar arquivo");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(attachmentId: string) {
    const result = await deleteOrderAttachmentAction(orderId, attachmentId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Anexo removido");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anexo ainda.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
            >
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{attachment.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {ATTACHMENT_CATEGORY_LABELS[attachment.category]} ·{" "}
                  {formatFileSize(attachment.sizeBytes)} · {attachment.uploadedBy.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover ${attachment.fileName}`}
                onClick={() => setDeletingId(attachment.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isUploadAvailable ? (
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as AttachmentCategory)}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Categoria">
                {(value: string | null) =>
                  value ? ATTACHMENT_CATEGORY_LABELS[value as AttachmentCategory] : null
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {isUploading ? "Enviando..." : "Enviar arquivo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
            onChange={(event) => void handleFileChange(event)}
          />
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Upload de arquivos indisponível no momento.
        </p>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Remover anexo?"
        description="Esta ação não pode ser desfeita."
        onConfirm={async () => {
          if (deletingId) await handleDelete(deletingId);
        }}
      />
    </div>
  );
}
