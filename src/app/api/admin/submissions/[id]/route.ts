import { NextResponse } from "next/server";
import { z } from "zod";
import { updateSubmissionStatus } from "@/lib/store";

const statusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = statusSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "حالة المراجعة غير صحيحة." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await updateSubmissionStatus(id, body.data.status);

  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
