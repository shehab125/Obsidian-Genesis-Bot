import { NextResponse } from "next/server";
import { z } from "zod";
import { bypassReferralTask } from "@/lib/store";

const bypassTaskSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = bypassTaskSchema.safeParse(json);

    if (!body.success) {
      return NextResponse.json({ ok: false, message: "بيانات غير صحيحة." }, { status: 400 });
    }

    const result = await bypassReferralTask(body.data.userId, body.data.taskId);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("Referral bypass failed:", err);
    return NextResponse.json({ ok: false, message: "حدث خطأ أثناء معالجة الطلب." }, { status: 500 });
  }
}
