import os
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv()

TOKEN = os.getenv("BOT_TOKEN")
GROUP_LINK = os.getenv("GROUP_LINK")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = (
        "⚠️ Бот временно не работает.\n\n"
        "Пожалуйста, пишите в нашу группу поддержки:\n"
        f"{GROUP_LINK}"
    )

    await update.message.reply_text(message)


def main():
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))

    print("Bot is running...")
    app.run_polling()


if __name__ == "__main__":
    main()
