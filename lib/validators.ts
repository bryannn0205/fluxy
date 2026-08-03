function hasAllSameDigits(value: string): boolean {
  return value.split("").every((digit) => digit === value[0]);
}

function calculateCheckDigit(digits: string, weights: number[]): number {
  const sum = digits
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (weights[index] ?? 0), 0);

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");

  if (cpf.length !== 11 || hasAllSameDigits(cpf)) return false;

  const firstCheckDigit = calculateCheckDigit(
    cpf.slice(0, 9),
    [10, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const secondCheckDigit = calculateCheckDigit(
    cpf.slice(0, 9) + firstCheckDigit,
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return (
    cpf === cpf.slice(0, 9) + firstCheckDigit.toString() + secondCheckDigit.toString()
  );
}

export function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/\D/g, "");

  if (cnpj.length !== 14 || hasAllSameDigits(cnpj)) return false;

  const firstCheckDigit = calculateCheckDigit(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const secondCheckDigit = calculateCheckDigit(
    cnpj.slice(0, 12) + firstCheckDigit,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return (
    cnpj === cnpj.slice(0, 12) + firstCheckDigit.toString() + secondCheckDigit.toString()
  );
}

// Aceita CPF (11 dígitos) ou CNPJ (14 dígitos) — usado no cadastro de clientes,
// que podem ser pessoa física ou jurídica.
export function isValidDocument(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);

  return false;
}
