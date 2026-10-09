/**
 * Keep related modules in sync (Payables ↔ Hotels ↔ Transport, etc.)
 */
import { prisma } from "./prisma";

/** After creating/updating a Payable, mirror Hotel or Transport rows */
export async function syncFromPayable(payableId: string) {
  const p = await prisma.payable.findUnique({ where: { id: payableId } });
  if (!p) return;

  const cat = (p.category || "").toLowerCase();

  if (cat.includes("hotel") || cat.includes("resort")) {
    const existing = await prisma.hotelBooking.findFirst({
      where: {
        periodId: p.periodId,
        hotelName: p.supplierName,
      },
    });
    if (existing) {
      await prisma.hotelBooking.update({
        where: { id: existing.id },
        data: {
          agreedCost: p.originalAmount,
          amountPaid: p.amountPaid,
          remaining: p.remaining,
          status: p.status === "Paid" ? "Paid" : p.remaining < p.originalAmount ? "Partial" : "Booked",
          notes: p.notes,
        },
      });
    } else {
      await prisma.hotelBooking.create({
        data: {
          periodId: p.periodId,
          hotelName: p.supplierName,
          tripRef: p.relatedTrip,
          agreedCost: p.originalAmount,
          amountPaid: p.amountPaid,
          remaining: p.remaining,
          status: p.remaining <= 0 ? "Paid" : "Booked",
          notes: p.notes || `Synced from Payables`,
        },
      });
    }
  }

  if (cat.includes("transport") || cat.includes("driver")) {
    const existing = await prisma.transportJob.findFirst({
      where: { periodId: p.periodId, driverName: p.supplierName },
    });
    if (existing) {
      await prisma.transportJob.update({
        where: { id: existing.id },
        data: {
          agreedCost: p.originalAmount,
          finalSettlement: p.amountPaid,
          remaining: p.remaining,
          status: p.remaining <= 0 ? "Settled" : "Partial",
        },
      });
    } else {
      await prisma.transportJob.create({
        data: {
          periodId: p.periodId,
          driverName: p.supplierName,
          tripRef: p.relatedTrip,
          agreedCost: p.originalAmount,
          finalSettlement: p.amountPaid,
          remaining: p.remaining,
          status: p.remaining <= 0 ? "Settled" : "Pending",
          notes: `Synced from Payables`,
        },
      });
    }
  }
}

/** After hotel create/update → ensure Payable exists */
export async function syncFromHotel(hotelId: string) {
  const h = await prisma.hotelBooking.findUnique({ where: { id: hotelId } });
  if (!h) return;

  const existing = await prisma.payable.findFirst({
    where: {
      periodId: h.periodId,
      supplierName: h.hotelName,
      category: { contains: "Hotel" },
    },
  });

  if (existing) {
    await prisma.payable.update({
      where: { id: existing.id },
      data: {
        originalAmount: h.agreedCost,
        amountPaid: h.amountPaid,
        remaining: h.remaining,
        status: h.remaining <= 0 ? "Paid" : "Partial",
        relatedTrip: h.tripRef,
      },
    });
  } else if (h.remaining > 0 || h.agreedCost > 0) {
    await prisma.payable.create({
      data: {
        periodId: h.periodId,
        supplierName: h.hotelName,
        category: "Hotel",
        description: h.clientName ? `Hotel for ${h.clientName}` : "Hotel booking",
        originalAmount: h.agreedCost,
        amountPaid: h.amountPaid,
        remaining: h.remaining,
        relatedTrip: h.tripRef,
        status: h.remaining <= 0 ? "Paid" : "Open",
        notes: "Synced from Hotels",
      },
    });
  }
}

export async function syncFromTransport(jobId: string) {
  const t = await prisma.transportJob.findUnique({ where: { id: jobId } });
  if (!t || !t.driverName) return;

  const existing = await prisma.payable.findFirst({
    where: {
      periodId: t.periodId,
      supplierName: t.driverName,
      category: { contains: "Transport" },
    },
  });

  if (existing) {
    await prisma.payable.update({
      where: { id: existing.id },
      data: {
        originalAmount: t.agreedCost,
        amountPaid: t.finalSettlement,
        remaining: t.remaining,
        status: t.remaining <= 0 ? "Paid" : "Partial",
      },
    });
  } else if (t.agreedCost > 0) {
    await prisma.payable.create({
      data: {
        periodId: t.periodId,
        supplierName: t.driverName,
        category: "Transport",
        description: t.vehicle || "Transport",
        originalAmount: t.agreedCost,
        amountPaid: t.finalSettlement,
        remaining: t.remaining,
        relatedTrip: t.tripRef,
        status: t.remaining <= 0 ? "Paid" : "Open",
        notes: "Synced from Transport",
      },
    });
  }
}
