import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

const ALLOWED = ["name", "role", "basicSalary", "phone", "isActive"] as const;

function pickEmployee(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) out[k] = body[k];
  }
  if (typeof out.name === "string") out.name = out.name.trim();
  if (typeof out.role === "string") {
    const r = out.role.trim();
    out.role = r === "" ? null : r;
  }
  if (typeof out.phone === "string") {
    const p = out.phone.trim();
    out.phone = p === "" ? null : p;
  }
  if (typeof out.basicSalary === "string") {
    out.basicSalary = parseFloat(out.basicSalary) || 0;
  }
  if ("isActive" in out && out.isActive === undefined) out.isActive = true;
  return out;
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.employee.findMany({
    where: periodId ? {} : {},
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data = pickEmployee(body);
    if (!data.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    // Default role to Sales if not provided, so new salespeople don't fall
    // into Other Staff by accident.
    if (data.role == null) data.role = "Sales";
    if (data.isActive == null) data.isActive = true;
    const row = await prisma.employee.create({ data: data as never });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[employees:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const id = body.id as string;
    const data = pickEmployee(body);
    delete (data as Record<string, unknown>).id;
    const row = await prisma.employee.update({
      where: { id },
      data: data as never,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[employees:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[employees:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}