import { NextResponse } from "next/server";
import { z } from "zod";
import { updateAppSettings } from "@/lib/store";

const settingsSchema = z.object({
  minimumWithdrawalPoints: z.number().int().positive(),
  requiredPurchaseUsd: z.number().min(0),
  purchaseConditionEnabled: z.boolean(),
  tokenUsdPrice: z.number().min(0),
  withdrawalLockDays: z.number().int().nonnegative(),
  tokenContractAddress: z.string().optional().default(""),
  quickswapLink: z.string().optional().default(""),
  ownerWallet: z.string().optional().default(""),
  baseRewardUsd: z.number().min(0),
  botActive: z.boolean().optional().default(true),
});

export async function PATCH(request: Request) {
  const body = settingsSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات الإعدادات غير صحيحة." }, { status: 400 });
  }

  const result = await updateAppSettings(body.data);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
