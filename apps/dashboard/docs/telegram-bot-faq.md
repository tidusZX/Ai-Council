# Get Archived — Telegram Bot

Your AI Council assistant. Send reels, log thoughts, caption photos, update the Command Centre.

## commands

**`/start`** or **`/help`** — show this message.

**`/help <category>`** — e.g. `/help inspiration`, `/help yap`.

## inspiration

Send any Instagram Reel, TikTok, or YouTube Short URL and the bot will:
1. Save it to your Inspiration Log
2. Analyse it with Claude (hook, structure, pacing, why it works)
3. Send you a summary within ~90 seconds

View your full log: https://ai-council-tan.vercel.app/inspiration

## yap

Log a raw thought or idea to your Notion Yap Log.

`/yap <your thought>`

e.g. `/yap why do singaporean brands still use stock photos`

Claude will structure it into title, type, topics, angle, hook ideas, and formats — then create a Notion page.

## photos

Send any photo and the bot will write 2-3 Instagram caption options using Claude vision in your brand voice.

Write users only. Include a note/context as the photo caption if you want to guide the direction.

## cc

Update your Command Centre from Telegram.

`/cc <natural language update>`

e.g. `/cc task follow up with Grain Traders Monday priority high`
e.g. `/cc mark done confirm rate card for Jigger`

Claude structures it and creates/updates the task in your Command Centre.

## captions

Send any caption draft (20+ characters, no URL) and Ember will sharpen it in your voice.

## general

Any other message gets a direct Claude reply — ask questions, brainstorm, think out loud.

## access

**Write users** can use all features.
**Read users** receive an echo of their message prefixed with `[read]`.
