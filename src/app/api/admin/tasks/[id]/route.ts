import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTask } from "@/lib/store";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  reward: z.number().int().positive(),
  targetUrl: z.string().url(),
  proofRequired: z.boolean(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = taskSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات المهمة غير صحيحة." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await updateTask({ id, ...body.data });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
