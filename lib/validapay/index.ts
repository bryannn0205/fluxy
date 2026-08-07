/**
 * Integração com a ValidaPay — superfície pública.
 *
 * A F1 entrega apenas transporte: autenticação OAuth2 client_credentials com
 * cache de token, timeout e tratamento de erro. **Nenhum recurso de negócio.**
 * Cobrança, checkout, produto, assinatura e webhook são fases seguintes.
 *
 * `getAccessToken` fica exposta para a verificação de conectividade; o resto
 * da aplicação deve usar `validaPayRequest`, que já resolve o token.
 */
export { validaPayRequest, type ValidaPayRequestOptions } from "@/lib/validapay/client";
export { getAccessToken, invalidateAccessToken } from "@/lib/validapay/token";
export { isValidaPayConfigured, type ValidaPayEnvironment } from "@/lib/validapay/config";
export {
  ValidaPayAuthError,
  ValidaPayConfigError,
  ValidaPayRequestError,
  ValidaPayTimeoutError,
} from "@/lib/validapay/errors";
