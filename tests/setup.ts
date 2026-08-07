import "dotenv/config";
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// A limpeza automática do Testing Library só se registra quando `afterEach` é
// global (ver o `typeof afterEach === 'function'` no pacote), e esta suíte
// importa os utilitários explicitamente — `globals` está desligado de
// propósito. Sem isto, cada `render()` acumula um container novo em
// document.body e as buscas por `screen` passam a encontrar várias cópias do
// mesmo elemento a partir do segundo teste do arquivo.
afterEach(cleanup);
