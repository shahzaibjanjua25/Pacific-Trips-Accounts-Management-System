export function isClientReceiptCategory(category?: string | null) {
  return /receipt|revenue/i.test(category ?? "");
}
