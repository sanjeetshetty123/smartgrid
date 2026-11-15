"""
Standalone Twilio Voice Alert Test - proves Twilio credentials and recipient phone work.
Run:  python test_call.py
"""
import os
import sys

# Ensure UTF-8 output if supported
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    print("[ERROR] 'twilio' library is not installed.")
    print("Run: pip install twilio")
    sys.exit(1)

# ======== Twilio Credentials ========
ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "AC86d18a00ece430acd64bbf0bb66fa96b")
AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "6e16975d0fb2ec5a7476a26272407cfe")
FROM_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "+16318007291")

# Destination number from .env or command line
TO_NUMBER = os.environ.get("TWILIO_TO_PHONE_NUMBER", "") or os.environ.get("ALERT_PHONE_NUMBER", "")
if len(sys.argv) > 1:
    TO_NUMBER = sys.argv[1]

print("=" * 60)
print("[CALL] GRIDMIND TWILIO VOICE ALERT TEST")
print("=" * 60)
print(f"Twilio Account SID : {ACCOUNT_SID[:12]}...")
print(f"Twilio From Number : {FROM_NUMBER}")
print(f"Target To Number   : {TO_NUMBER or '[NOT SET]'}")
print("-" * 60)

if not TO_NUMBER:
    print("\n[WARNING] No destination phone number specified!")
    print("Please set your phone number in .env:")
    print("    TWILIO_TO_PHONE_NUMBER=+91XXXXXXXXXX")
    print("\nOr run this test directly with your phone number:")
    print("    python test_call.py +91XXXXXXXXXX\n")
    sys.exit(1)

# Ensure E.164 format
if not TO_NUMBER.startswith("+"):
    if len(TO_NUMBER) == 10:
        TO_NUMBER = "+91" + TO_NUMBER
    else:
        TO_NUMBER = "+" + TO_NUMBER

print(f"Initiating test voice call to: {TO_NUMBER} ...")

twiml = (
    "<Response>"
    "<Say voice=\"alice\" loop=\"2\">"
    "Hello! This is a test emergency voice alert from your GridMind smart microgrid system. "
    "All electrical parameters and protection loops are operational. "
    "If you can hear this call, your Twilio voice alert configuration is working successfully."
    "</Say>"
    "<Pause length=\"1\"/>"
    "<Say voice=\"alice\">Repeating test alert. GridMind system is online.</Say>"
    "</Response>"
)

try:
    client = TwilioClient(ACCOUNT_SID, AUTH_TOKEN)
    call = client.calls.create(
        twiml=twiml,
        to=TO_NUMBER,
        from_=FROM_NUMBER
    )
    print("\n[SUCCESS] Voice call initiated!")
    print(f"Call SID    : {call.sid}")
    print(f"Status      : {call.status}")
    print("\nYour phone should ring shortly. Answer it to hear the synthesized alert message.")
except Exception as e:
    err_str = str(e)
    print(f"\n[FAILED] Voice call error: {e}")
    if "21608" in err_str:
        print("\nTwilio Trial Account Note (Error 21608):")
        print("In a Twilio trial account, you must verify your destination phone number first:")
        print("1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified")
        print(f"2. Add and verify your phone number: {TO_NUMBER}")
    elif "21211" in err_str:
        print("\nInvalid Phone Number (Error 21211):")
        print("Please verify the number is in international E.164 format (e.g. +91XXXXXXXXXX).")
