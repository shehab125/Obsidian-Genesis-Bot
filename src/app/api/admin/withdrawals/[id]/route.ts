import { NextResponse } from "next/server";
import { z } from "zod";
import { updateWithdrawalStatus } from "@/lib/store";

const statusSchema = z.object({
  status: z.enum(["paid", "rejected"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = statusSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "حالة السحب غير صحيحة." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await updateWithdrawalStatus(id, body.data.status);

  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
