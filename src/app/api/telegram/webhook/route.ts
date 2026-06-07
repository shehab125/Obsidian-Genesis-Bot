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

  if (message.text === "/start") {
    await sendStartMessage(message.chat.id, message.from?.first_name, new URL(request.url).origin);
  }

  return NextResponse.json({ ok: true });
}

async function sendStartMessage(chatId: number, firstName: string | undefined, requestOrigin: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = `${requestOrigin || process.env.NEXT_PUBLIC_APP_URL}?v=${Date.now()}`;

  if (!botToken || !appUrl) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Welcome${firstName ? ` ${firstName}` : ""}. Open the rewards mini app to start mining OBSD.`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open Rewards App",
              web_app: {
                url: appUrl,
              },
            },
          ],
        ],
      },
    }),
  });
}
