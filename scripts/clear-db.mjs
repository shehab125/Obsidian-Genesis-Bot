import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function clearDatabase() {
  console.log("⏳ Starting database clear operation...");

  try {
    // 1. Break self-referential foreign keys by setting referred_by to null
    console.log("1. Setting referred_by references to null...");
    const { error: updateError } = await supabase
      .from("app_users")
      .update({ referred_by: null })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // select all records

    if (updateError) {
      console.warn("⚠️ Warning setting referred_by to null (might be empty):", updateError.message);
    }

    // 2. Delete all users (this cascades and deletes all sessions, completions, verification requests, etc.)
    console.log("2. Deleting all users from app_users (with CASCADE)...");
    const { data: deleteData, error: deleteError } = await supabase
      .from("app_users")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) {
      throw deleteError;
    }

    console.log("✅ Database cleared successfully! All user accounts, balances, mining sessions, and purchase requests have been reset.");
  } catch (error) {
    console.error("❌ Failed to clear database:", error);
    process.exit(1);
  }
}

clearDatabase();
