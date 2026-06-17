import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyUserPurchaseAutomatic } from "@/lib/store";

const purchaseVerificationSchema = z.object({
  userId: z.string().uuid(),
  walletAddress: z.string().min(3),
  contractsCount: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const body = purchaseVerificationSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات المحفظة غير صحيحة." }, { status: 400 });
  }

  const contractsCount = body.data.contractsCount ?? 1;
  const result = await verifyUserPurchaseAutomatic(body.data.userId, body.data.walletAddress, contractsCount);
  return NextResponse.json(result);
}
