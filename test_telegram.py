"""Standalone Telegram test - proves token + chat ID work before wiring into backend.
Run:  python test_telegram.py
"""
import os
import urllib.parse
import urllib.request

# ======== set these as environment variables ========
TOKEN = os.environ.get("TELEGRAM_TOKEN", "PASTE_YOUR_TOKEN_HERE")      # from @BotFather, like 7123456789:AAH...
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "PASTE_YOUR_CHAT_ID_HERE")           # from @userinfobot, like 123456789
# ======================================================

msg = "Hello from GridMind! If you can read this, Telegram works."
url = (f"https://api.telegram.org/bot{TOKEN}/sendMessage?"
       f"chat_id={CHAT_ID}&text=" + urllib.parse.quote(msg))

try:
    resp = urllib.request.urlopen(url, timeout=10)
    print("Telegram says:", resp.read().decode()[:200])
    print("\nSUCCESS - check your phone!")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print("FAILED:", e.code, body)
    if "chat not found" in body:
        print("-> You have NOT pressed START in your bot's chat. Open the bot in Telegram, press START, run again.")
    elif "Unauthorized" in body or e.code == 401:
        print("-> Your TOKEN is wrong. Re-copy it from @BotFather (full string, no spaces).")
except Exception as e:
    print("FAILED:", e)
    print("-> Check laptop internet connection.")
