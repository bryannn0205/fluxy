import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verificarStatusCheckoutAction = vi.fn();

vi.mock("@/app/dashboard/settings/billing/actions", () => ({
  verificarStatusCheckoutAction: (id: string) => verificarStatusCheckoutAction(id),
}));

import { CheckoutStatusPoller } from "@/app/dashboard/settings/billing/checkout/_components/CheckoutStatusPoller";
import { PixPayment } from "@/app/dashboard/settings/billing/checkout/_components/PixPayment";

function resposta(status: string) {
  return { data: { checkoutId: "chk_1", chargeId: "cha_1", status, pix: null } };
}

/**
 * Avança o relógio falso até a condição valer, cedendo o laço de eventos real
 * entre as rodadas.
 *
 * `advanceTimersByTimeAsync` sozinho não basta: o agendador do React usa
 * `MessageChannel`, que os timers falsos não controlam, então a re-renderização
 * que encadeia a próxima consulta só acontece num tick real.
 */
async function avancarAte(condicao: () => boolean, tetoMs = 90_000, passoMs = 500) {
  for (let decorrido = 0; decorrido < tetoMs && !condicao(); decorrido += passoMs) {
    await vi.advanceTimersByTimeAsync(passoMs);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  verificarStatusCheckoutAction.mockReset();
  verificarStatusCheckoutAction.mockResolvedValue(resposta("PENDING"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CheckoutStatusPoller", () => {
  it("não consulta enquanto inativo", async () => {
    render(<CheckoutStatusPoller checkoutId="chk_1" ativo={false} onEstado={vi.fn()} />);

    await vi.advanceTimersByTimeAsync(30_000);

    // Fora de PENDING não há o que acompanhar — consultar seria gastar
    // requisição para confirmar algo já decidido.
    expect(verificarStatusCheckoutAction).not.toHaveBeenCalled();
  });

  it("não consulta imediatamente — espera o primeiro intervalo", async () => {
    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />);

    // A tela acabou de receber a cobrança; ninguém pagou em 1,9 s.
    await vi.advanceTimersByTimeAsync(1900);
    expect(verificarStatusCheckoutAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(verificarStatusCheckoutAction).toHaveBeenCalledTimes(1);
  });

  it("espaça progressivamente as tentativas", async () => {
    const instantes: number[] = [];
    verificarStatusCheckoutAction.mockImplementation(async () => {
      instantes.push(Date.now());
      return resposta("PENDING");
    });

    const inicio = Date.now();
    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />);

    await avancarAte(() => instantes.length >= 3);
    expect(instantes.length).toBeGreaterThanOrEqual(3);

    const intervalos = [
      instantes[0]! - inicio,
      instantes[1]! - instantes[0]!,
      instantes[2]! - instantes[1]!,
    ];

    // Cada espera é maior que a anterior: quem já pagou tem resposta rápida,
    // e uma aba esquecida aberta não consulta a cada dois segundos por horas.
    expect(intervalos[1]).toBeGreaterThan(intervalos[0]!);
    expect(intervalos[2]).toBeGreaterThan(intervalos[1]!);
  });

  it("um único timer vivo por vez", async () => {
    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />);

    // Contagem de timers pendentes é a prova direta: com agendamentos
    // paralelos ela cresceria a cada rodada. Encadeado, nunca passa de um.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);

    for (const _ of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(11_000);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    }
  });

  it("informa COMPLETED ao chamador", async () => {
    verificarStatusCheckoutAction.mockResolvedValue(resposta("COMPLETED"));
    const aoEstado = vi.fn();

    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={aoEstado} />);
    await vi.advanceTimersByTimeAsync(2100);

    await waitFor(() => expect(aoEstado).toHaveBeenCalledWith("COMPLETED"));
  });

  it("informa FAILED ao chamador", async () => {
    verificarStatusCheckoutAction.mockResolvedValue(resposta("FAILED"));
    const aoEstado = vi.fn();

    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={aoEstado} />);
    await vi.advanceTimersByTimeAsync(2100);

    await waitFor(() => expect(aoEstado).toHaveBeenCalledWith("FAILED"));
  });

  it("para de consultar quando deixa de estar ativo", async () => {
    const { rerender } = render(
      <CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />,
    );

    await vi.advanceTimersByTimeAsync(2100);
    const antes = verificarStatusCheckoutAction.mock.calls.length;

    // É assim que o painel encerra o acompanhamento ao receber COMPLETED.
    rerender(
      <CheckoutStatusPoller checkoutId="chk_1" ativo={false} onEstado={vi.fn()} />,
    );
    await vi.advanceTimersByTimeAsync(30_000);

    expect(verificarStatusCheckoutAction).toHaveBeenCalledTimes(antes);
  });

  it("desmontar cancela o timer pendente", async () => {
    const { unmount } = render(
      <CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />,
    );

    unmount();
    await vi.advanceTimersByTimeAsync(30_000);

    // Sem o clearTimeout, a consulta dispararia depois da tela sumir.
    expect(verificarStatusCheckoutAction).not.toHaveBeenCalled();
  });

  it("erro transitório não encerra o acompanhamento nem cria checkout novo", async () => {
    verificarStatusCheckoutAction
      .mockResolvedValueOnce({ error: "Serviço indisponível" })
      .mockResolvedValue(resposta("PENDING"));

    render(<CheckoutStatusPoller checkoutId="chk_1" ativo onEstado={vi.fn()} />);

    await avancarAte(() => verificarStatusCheckoutAction.mock.calls.length >= 1);
    expect(verificarStatusCheckoutAction).toHaveBeenCalledTimes(1);

    // Reagenda mesmo após erro — não encerra o acompanhamento.
    await avancarAte(() => verificarStatusCheckoutAction.mock.calls.length >= 2);
    expect(verificarStatusCheckoutAction.mock.calls.length).toBeGreaterThan(1);

    // E sempre sobre o MESMO id: erro transitório nunca abre outra tentativa.
    for (const [id] of verificarStatusCheckoutAction.mock.calls) {
      expect(id).toBe("chk_1");
    }
  });
});

describe("PixPayment", () => {
  const EMV = "emv-sintetico-de-teste-0001";

  it("renderiza o código recebido, sem buscá-lo em lugar nenhum", () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);

    render(<PixPayment emv={EMV} qrCodeImage={null} />);

    expect(screen.getByLabelText("Código copia e cola")).toHaveValue(EMV);
    // O componente NÃO fala com a ValidaPay: o código chega pronto do servidor.
    expect(fetchFalso).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("copia exatamente o valor recebido", async () => {
    // `userEvent.setup()` instala o próprio stub de área de transferência —
    // substituir `navigator` inteiro por um duplo quebraria o resto do que ele
    // precisa. Lê-se de volta o que foi escrito, que é a prova real.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PixPayment emv={EMV} qrCodeImage={null} />);

    await usuario.click(screen.getByRole("button", { name: /copiar código pix/i }));

    await expect(navigator.clipboard.readText()).resolves.toBe(EMV);
    // Confirmação em TEXTO, não só troca de ícone.
    expect(await screen.findByText("Código copiado")).toBeInTheDocument();
  });

  it("clipboard negado não quebra a tela nem expõe o código no erro", async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PixPayment emv={EMV} qrCodeImage={null} />);

    const negado = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("permissão negada"));

    await usuario.click(screen.getByRole("button", { name: /copiar código pix/i }));

    // O código continua visível e selecionável — a saída manual permanece.
    expect(screen.getByLabelText("Código copia e cola")).toHaveValue(EMV);
    expect(screen.queryByText("Código copiado")).not.toBeInTheDocument();

    negado.mockRestore();
  });

  it("sem imagem de QR, oferece alternativa textual", () => {
    render(<PixPayment emv={EMV} qrCodeImage={null} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Use o código copia e cola")).toBeInTheDocument();
  });

  it("com imagem de QR, o alt aponta a alternativa acessível", () => {
    render(<PixPayment emv={EMV} qrCodeImage="data:image/png;base64,iVBORw0KGgo=" />);

    // Quem usa leitor de tela não consegue ler um QR: o alt precisa dizer
    // para onde ir, não descrever quadradinhos.
    expect(screen.getByRole("img", { name: /copia e cola/i })).toBeInTheDocument();
  });
});
