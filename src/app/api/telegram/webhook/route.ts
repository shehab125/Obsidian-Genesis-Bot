import { NextResponse } from "next/server";

type TelegramMessage = {
  chat?: {
    id: number;
  };
  text?: string;
  from?: {
    first_name?: string;
  };
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;

  if (!message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text ?? "";
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const referrerId = parts.length > 1 ? parts[1].trim() : null;
    await sendStartMessage(
      message.chat.id,
      message.from?.first_name,
      new URL(request.url).origin,
      referrerId
    );
  }

  return NextResponse.json({ ok: true });
}

async function sendStartMessage(
  chatId: number,
  firstName: string | undefined,
  requestOrigin: string,
  referrerId?: string | null
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const baseOrigin = requestOrigin || process.env.NEXT_PUBLIC_APP_URL;
  
  // Construct URL, appending start_param if referrerId exists
  const appUrl = `${baseOrigin}?v=${Date.now()}${referrerId ? `&start_param=${referrerId}` : ""}`;

  if (!botToken || !appUrl) {
    return;
  }

  const greeting = firstName ? `مرحباً ${firstName}!` : "مرحباً بك!";
  const text = `💎 <b>${greeting}</b>\n\n🚀 <b>مرحباً بك في Obsidian Genesis (OBSD)</b>\n\n✅ أكمل المهام البسيطة واكسب رموز OBSD\n⛏️ فعّل عقدة التعدين واجمع المكافآت اليومية\n💰 اسحب أرباحك مباشرة إلى محفظتك اللامركزية\n\nاضغط على الزر أدناه لفتح التطبيق والبدء فوراً 👇`;

  // 1. Send the start message with inline keyboard
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎮 افتح تطبيق المكافآت / Open App",
              web_app: {
                url: appUrl,
              },
            },
          ],
        ],
      },
    }),
  });

  // 2. Programmatically update the bottom-left persistent "Open App" menu button for this chat
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        menu_button: {
          type: "web_app",
          text: "Open App",
          web_app: {
            url: appUrl,
          },
        },
      }),
    });
  } catch (err) {
    console.error("Failed to update chat menu button:", err);
  }
}
