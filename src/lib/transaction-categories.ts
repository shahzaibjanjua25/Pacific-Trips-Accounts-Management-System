export const TRANSACTION_CATEGORIES = [
  "Client Receipt", "Revenue", "Supplier Payment", "Hotel Payment",
  "Transport Payment", "Ticketing Payment", "Salary Payment", "Commission Payment",
  "Refund to Client", "Employee Loan", "Office Expense", "Marketing Expense",
  "Bank Transfer", "Asset Purchase", "Owner Drawing", "Personal Expense",
  "General Payment", "Personal/Family Payments", "Other",
];

// Only named accounting categories invoke operational posting rules.
export function transactionCategoryBehavior(category?: string | null) {
  const value = (category ?? "").trim();
  return [...TRANSACTION_CATEGORIES, "Supplier Advance", "Staff Advance", "Drawing", "Owner Personal"]
    .find((name) => name.toLowerCase() === value.toLowerCase()) ?? "";
}

export function isClientReceiptCategory(category?: string | null) {
  return /^(client receipt|revenue)$/i.test((category ?? "").trim());
}

export function isPersonalPaymentCategory(category: string) {
  return ["Personal/Family Payments", "Personal Expense", "Owner Personal"]
    .some((name) => name.toLowerCase() === category.trim().toLowerCase());
}

export function isStandalonePaymentCategory(category: string) {
  return category === "General Payment" || isPersonalPaymentCategory(category);
}
