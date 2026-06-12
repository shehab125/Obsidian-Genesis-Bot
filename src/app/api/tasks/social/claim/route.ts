import { NextResponse } from "next/server";
import { z } from "zod";
import { completeSocialTask } from "@/lib/store";

const claimTaskSchema = z.object({
  userId: z.string().min(1),
  taskId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = claimTaskSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات غير صحيحة." }, { status: 400 });
  }

  const result = await completeSocialTask(body.data.userId, body.data.taskId);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
