import { NextResponse } from "next/server";
import { z } from "zod";
import { createXSubmission } from "@/lib/store";

const submissionSchema = z.object({
  userId: z.string().min(1),
  taskId: z.string().min(1),
  proofUrl: z.string().min(3),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const body = submissionSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "بيانات الإثبات غير صحيحة." }, { status: 400 });
  }

  const result = await createXSubmission(body.data);
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
