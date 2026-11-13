CREATE TABLE IF NOT EXISTS "TransactionCategory" (
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("name")
);
