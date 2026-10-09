import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  buildAccountingWorkbook,
  buildClientDataWorkbook,
  buildSalesTeamWorkbook,
} from "@/lib/export-excel";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const periodId = req.nextUrl.searchParams.get("periodId");
    if (!periodId) {
      return NextResponse.json({ error: "periodId required" }, { status: 400 });
    }

    const period = await prisma.period.findUnique({ where: { id: periodId } });
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const [accounting, clients, sales] = await Promise.all([
      buildAccountingWorkbook(periodId),
      buildClientDataWorkbook(periodId),
      buildSalesTeamWorkbook(periodId),
    ]);

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

    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Pacific_Trips_${label}_Export.zip"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
