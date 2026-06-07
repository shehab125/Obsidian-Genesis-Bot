import { NextResponse } from "next/server";
import { z } from "zod";
import { updateAppSettings } from "@/lib/store";

const settingsSchema = z.object({
  minimumWithdrawalPoints: z.number().int().positive(),
  requiredPurchaseUsd: z.number().min(0),
  purchaseConditionEnabled: z.boolean(),
  tokenUsdPrice: z.number().min(0),
  withdrawalLockDays: z.number().int().nonnegative(),
});

export async function PATCH(request: Request) {
  const body = settingsSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات الإعدادات غير صحيحة." }, { status: 400 });
  }

  const result = await updateAppSettings(body.data);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
