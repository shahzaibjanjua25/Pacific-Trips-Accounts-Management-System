CREATE TABLE "ClientReceiptReopening" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "balanceSignature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientReceiptReopening_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientReceiptReopening_periodId_clientName_key"
ON "ClientReceiptReopening"("periodId", "clientName");

ALTER TABLE "ClientReceiptReopening"
ADD CONSTRAINT "ClientReceiptReopening_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE;
