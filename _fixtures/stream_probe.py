"""Stream a WAV at AssemblyAI the way the browser does, and print what comes back.

This exists because the browser is the one part of the pipeline that cannot be
unit tested, and the failure it hides is silent: send audio at the wrong rate or
the wrong sample width and the socket stays open, the transcripts keep arriving,
and every one of them is confident nonsense.

So: take a 16 kHz mono PCM WAV, chunk it the way `pcm-worklet.js` does (~100 ms),
send it over the same URL `stt.js` builds, and read the Turn messages.

    export ASSEMBLYAI_API_KEY=...
    python _fixtures/stream_probe.py _fixtures/b.wav

Not part of `npm test` — it costs streaming minutes and needs a key.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys
import urllib.request
import wave

import websockets

TOKEN_URL = "https://streaming.assemblyai.com/v3/token?expires_in_seconds=120"
WS_BASE = "wss://streaming.assemblyai.com/v3/ws"
CHUNK_MS = 100


def mint_token() -> str:
    key = os.environ.get("ASSEMBLYAI_API_KEY", "").strip()
    if not key:
        raise SystemExit("ASSEMBLYAI_API_KEY is not set.")
    req = urllib.request.Request(TOKEN_URL, headers={"Authorization": key})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["token"]


def read_pcm(path: pathlib.Path) -> tuple[bytes, int]:
    with wave.open(str(path), "rb") as w:
        assert w.getnchannels() == 1, f"{path.name} is not mono"
        assert w.getsampwidth() == 2, f"{path.name} is not 16-bit"
        return w.readframes(w.getnframes()), w.getframerate()


async def run(path: pathlib.Path, extra: str = "") -> int:
    pcm, rate = read_pcm(path)
    token = mint_token()
    url = (f"{WS_BASE}?sample_rate={rate}&encoding=pcm_s16le&format_turns=true"
           f"{extra}&token={token}")

    bytes_per_chunk = int(rate * 2 * CHUNK_MS / 1000)
    print(f"{path.name}: {len(pcm)} bytes @ {rate} Hz  "
          f"({len(pcm) / (rate * 2):.1f}s, {bytes_per_chunk} B/chunk)")

    finals: list[str] = []

    async with websockets.connect(url, max_size=None) as ws:

        async def send() -> None:
            for i in range(0, len(pcm), bytes_per_chunk):
                await ws.send(pcm[i : i + bytes_per_chunk])
                await asyncio.sleep(CHUNK_MS / 1000)
            # The recogniser needs to hear the end of the sentence before it
            # will call the turn: trailing silence, then Terminate.
            silence = b"\x00" * bytes_per_chunk
            for _ in range(10):
                await ws.send(silence)
                await asyncio.sleep(CHUNK_MS / 1000)
            await ws.send(json.dumps({"type": "Terminate"}))

        async def recv() -> None:
            async for raw in ws:
                msg = json.loads(raw)
                kind = msg.get("type")
                if kind == "Begin":
                    print("  Begin")
                elif kind == "Turn":
                    text = (msg.get("transcript") or "").strip()
                    if not text:
                        continue
                    if msg.get("end_of_turn"):
                        print(f"  FINAL   {text!r}")
                        finals.append(text)
                    else:
                        print(f"  partial {text!r}")
                elif kind == "Termination":
                    print(f"  Termination  audio={msg.get('audio_duration_seconds')}s")
                    return

        await asyncio.gather(send(), recv())

    if not finals:
        print("  🔴 no final transcript came back")
        return 1
    print(f"  → {' | '.join(finals)}")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    if not os.environ.get("ASSEMBLYAI_API_KEY"):
        print("ASSEMBLYAI_API_KEY is not set.")
        return 1
    args = sys.argv[1:]
    extra = ""
    if args and args[0].startswith("--params="):
        extra = args.pop(0).split("=", 1)[1]
        if extra and not extra.startswith("&"):
            extra = "&" + extra
    rc = 0
    for arg in args:
        print(f"[params{extra or ' (defaults)'}]")
        rc |= asyncio.run(run(pathlib.Path(arg), extra))
        print()
    return rc


if __name__ == "__main__":
    sys.exit(main())
