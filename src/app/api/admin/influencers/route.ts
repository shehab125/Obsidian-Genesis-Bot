import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase";

const createInfluencerSchema = z.object({
  code: z.string().min(2).regex(/^[a-zA-Z0-9_-]+$/, "الكود يجب أن يحتوي على أحرف وأرقام وشرطات فقط وبدون مسافات"),
  name: z.string().min(2),
  telegramId: z.string().min(3),
  commissionUsd: z.number().min(0.01),
});

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database not connected" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("influencer_links")
    .select("*, app_users(display_name, username)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, influencers: data });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database not connected" }, { status: 500 });
  }

  const body = createInfluencerSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ ok: false, message: body.error.issues[0].message }, { status: 400 });
  }

  const { code, name, telegramId, commissionUsd } = body.data;

  // Resolve user_id from telegramId
  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        message: "لم يتم العثور على مستخدم تليجرام بهذا المعرّف (Telegram ID). يجب أن يقوم المؤثر بفتح البوت أولاً ليتم تسجيله في النظام.",
      },
      { status: 422 }
    );
  }

  const { error } = await supabase.from("influencer_links").insert({
    code: code.trim().toLowerCase(),
    name: name.trim(),
    user_id: user.id,
    commission_usd: commissionUsd,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, message: "كود الإحالة هذا مستخدم بالفعل لمؤثر آخر. يرجى اختيار كود آخر." },
        { status: 422 }
      );
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true, message: "تم إنشاء رابط المؤثر بنجاح!" }, { status: 201 });
}
