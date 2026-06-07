import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleUserFreeze } from "@/lib/store";

const freezeSchema = z.object({
  frozen: z.boolean(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const json = await request.json();
  const body = freezeSchema.safeParse(json);

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات تجميد غير صحيحة." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await toggleUserFreeze(id, body.data.frozen);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
