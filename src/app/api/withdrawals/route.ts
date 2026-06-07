import { NextResponse } from "next/server";
import { z } from "zod";
import { createWithdrawal } from "@/lib/store";

const withdrawalSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  walletAddress: z.string().min(3),
});

export async function POST(request: Request) {
  const body = withdrawalSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات طلب السحب غير صحيحة." }, { status: 400 });
  }

  const result = await createWithdrawal(body.data);
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
