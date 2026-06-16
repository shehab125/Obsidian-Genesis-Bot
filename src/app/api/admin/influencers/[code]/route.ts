import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function DELETE(request: Request, context: { params: Promise<{ code: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database not connected" }, { status: 500 });
  }

  const { code } = await context.params;
  const { error } = await supabase
    .from("influencer_links")
    .delete()
    .eq("code", code);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true, message: "تم حذف رابط المؤثر بنجاح." });
}
