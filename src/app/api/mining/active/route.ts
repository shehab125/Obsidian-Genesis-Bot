import { NextResponse } from "next/server";
import { getUserActiveMiningSession } from "@/lib/store";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ ok: false, message: "Missing userId." }, { status: 400 });
  }

  const session = await getUserActiveMiningSession(userId);
  
  // Also query the last started session's time
  const supabase = getSupabaseServerClient();
  let lastSessionStart: string | null = null;
  if (supabase) {
    const { data: last } = await supabase
      .from("mining_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) lastSessionStart = last.started_at;
  }

  return NextResponse.json({ ok: true, session, lastSessionStart });
}
