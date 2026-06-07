import { NextResponse } from "next/server";
import { z } from "zod";
import { createPurchaseVerification } from "@/lib/store";

const purchaseVerificationSchema = z.object({
  userId: z.string().min(1),
  walletAddress: z.string().min(3),
  proofUrl: z.string().min(3),
});

export async function POST(request: Request) {
  const body = purchaseVerificationSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "Invalid purchase proof data." }, { status: 400 });
  }

  const result = await createPurchaseVerification(body.data);
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
