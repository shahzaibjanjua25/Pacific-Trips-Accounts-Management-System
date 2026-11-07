import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  buildAccountingWorkbook,
  buildClientDataWorkbook,
  buildSalesTeamWorkbook,
} from "@/lib/export-excel";
import { issueMonthBackupProof, readMonthBackup } from "@/lib/month-backup";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { ensureClientReceiptStorage } from "@/lib/client-receipt-storage";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const periodId = req.nextUrl.searchParams.get("periodId");
    if (!periodId) {
      return NextResponse.json({ error: "periodId required" }, { status: 400 });
    }

    const forDeletion = req.nextUrl.searchParams.get("forDeletion") === "1";
    if (forDeletion) await ensureClientReceiptStorage();
    const result = await prisma.$transaction(async (db) => {
      const period = await db.period.findUnique({ where: { id: periodId } });
      if (!period) return null;
      const backup = forDeletion ? await readMonthBackup(db, periodId) : null;
      const workbooks = await Promise.all([
        buildAccountingWorkbook(periodId, db),
        buildClientDataWorkbook(periodId, db),
        buildSalesTeamWorkbook(periodId, db),
      ]);
      return { period, backup, workbooks };
    }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
    if (!result) return NextResponse.json({ error: "Month not found." }, { status: 404 });

    const { period, backup, workbooks: [accounting, clients, sales] } = result;
    const [buf1, buf2, buf3] = await Promise.all([
      accounting.xlsx.writeBuffer(),
      clients.xlsx.writeBuffer(),
      sales.xlsx.writeBuffer(),
    ]);

    const zip = new JSZip();
    const label = period.label.replace(/\s+/g, "_");
    zip.file(`Pacific_Trips_Complete_Accounting_System_${label}.xlsx`, buf1);
    zip.file(`Client_Data_${label}.xlsx`, buf2);
    zip.file(`Sales_Team_Performance_${label}.xlsx`, buf3);

    if (backup) {
      zip.file("month-records.json", JSON.stringify({ version: 1, ...backup }, null, 2));
    }

    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "private, no-store",
        ...(backup ? { "X-Month-Backup-Proof": issueMonthBackupProof(backup, uid) } : {}),
        "Content-Disposition": `attachment; filename="Pacific_Trips_${label}_Export.zip"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not generate the month backup." }, { status: 500 });
  }
}
