#!/usr/bin/env bash
# Records 5 s from the default mic in LUBB's audio format (16 kHz mono 16-bit), shows the level, plays it back.
set -e
OUT=$(mktemp --suffix=.wav)
echo "🎙  Recording 5 seconds — speak now..."
timeout 5 pw-record --rate 16000 --channels 1 --format s16 "$OUT" || true
python3 - "$OUT" <<'PY'
import sys, wave, array, math
w = wave.open(sys.argv[1]); s = array.array("h", w.readframes(w.getnframes()))
if not s: sys.exit("No audio captured — is the mic selected?")
peak = max(abs(x) for x in s) / 32768
rms = math.sqrt(sum(x * x for x in s) / len(s)) / 32768
db = 20 * math.log10(rms) if rms else -120
bar = "█" * int(max(0, db + 60) / 2)
print(f"Length {len(s)/w.getframerate():.1f}s · peak {peak:.0%} · level {db:.0f} dBFS  {bar}")
print("✅ Mic works" if db > -45 else "⚠️  Very quiet — move closer or check the mic isn't muted")
PY
echo "🔊 Playing it back..."
pw-play "$OUT"
rm -f "$OUT"
