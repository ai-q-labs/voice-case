/**
 * Voice Case — AssemblyAI Universal-Streaming client.
 *
 * Endpoint and message shapes are from the API reference, read 2026-09-10:
 *   token  GET https://streaming.assemblyai.com/v3/token?expires_in_seconds=<1..600>
 *          Authorization: <api key>          -> { token, expires_in_seconds }
 *   socket wss://streaming.assemblyai.com/v3/ws?sample_rate=<n>&token=<t>
 *          server sends { type: "Begin" | "Turn" | "Termination" }
 *          a Turn with end_of_turn true is a final
 *          client closes with { type: "Terminate" }
 *
 * The API key never reaches this file. The page asks its own origin for a
 * temporary token, which AssemblyAI documents as single use — so a token is
 * fetched per session, not per page load.
 */

const WS_BASE = "wss://streaming.assemblyai.com/v3/ws";

/**
 * Two parameters here were not guesses. Both were measured on 2026-09-10 by
 * streaming synthesised speech at the live endpoint (`_fixtures/stream_probe.py`).
 *
 * `language_codes=en` — the default model does **native code-switching**, and
 * without this it switched to Japanese mid-sentence and returned the English
 * phrase transcribed as katakana. It does not error. It does not warn. It just
 * hands back fluent nonsense, and every downstream layer accepts it.
 *
 * ⚠️ The obvious fix — `speech_model=universal-streaming-english` — is worse:
 * it pins the language but is measurably less accurate on this vocabulary
 * ("search the ledger" came back as "Search is a rich"). Keep the pro model and
 * pin the language instead.
 *
 * `keyterms_prompt` — the cast list, which is exactly the set of words the
 * intent resolver needs and the recogniser has never heard. With it, "Tobias",
 * "oleander" and "authorship" all survive; without it, "Tobias" comes back as
 * "to be". It must be a **JSON array** — a comma- or space-separated list is
 * rejected with close code 3006 and no explanation.
 */
const KEYTERMS = [
  "Tobias", "Vale", "Desmond", "Iris", "Marguerite", "Oyelaran", "Kwan", "Renn",
  "oleander", "ledger", "thermostat", "syringe", "orchid", "keyring",
  "authorship", "Finch", "Halloway", "Aldermoor", "glasshouse",
];

export class Listener {
  /**
   * @param {object} opts
   * @param {string} opts.tokenUrl        same-origin endpoint that mints a token
   * @param {(text:string)=>void} opts.onFinal     a completed turn
   * @param {(text:string)=>void} [opts.onPartial] the turn so far
   * @param {(state:string, detail?:any)=>void} [opts.onState]
   */
  constructor({ tokenUrl = "/api/token", onFinal, onPartial, onState } = {}) {
    this.tokenUrl = tokenUrl;
    this.onFinal = onFinal || (() => {});
    this.onPartial = onPartial || (() => {});
    this.onState = onState || (() => {});

    this.ws = null;
    this.audio = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.muted = false;
    this.running = false;
  }

  get isRunning() {
    return this.running;
  }

  /** Stop sending audio without tearing the socket down — used while the game master is speaking. */
  mute() {
    this.muted = true;
  }

  unmute() {
    this.muted = false;
  }

  async start() {
    if (this.running) return;
    this.onState("connecting");

    const token = await this.#mintToken();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audio = new AudioContext();
    await this.audio.audioWorklet.addModule("./pcm-worklet.js");

    // Declare the rate we actually have rather than forcing 16 kHz on the
    // context: Safari ignores the constructor hint and would then be sending
    // 48 kHz audio labelled as 16 kHz, which sounds like a chipmunk to the
    // recogniser and transcribes as nonsense.
    const rate = Math.round(this.audio.sampleRate);
    const params = new URLSearchParams({
      sample_rate: String(rate),
      encoding: "pcm_s16le",
      format_turns: "true",
      language_codes: "en",
      keyterms_prompt: JSON.stringify(KEYTERMS),
      token,
    });
    const url = `${WS_BASE}?${params}`;

    await this.#openSocket(url);

    this.source = this.audio.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.audio, "pcm-worklet");
    this.node.port.onmessage = (e) => {
      if (this.muted) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(e.data);
    };
    this.source.connect(this.node);
    // Not connected to destination: we do not want to hear ourselves.

    this.running = true;
    this.onState("listening");
  }

  async stop() {
    this.running = false;
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "Terminate" }));
      }
    } catch {
      /* the socket was already gone */
    }
    try {
      this.node?.disconnect();
      this.source?.disconnect();
      await this.audio?.close();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ws = null;
    this.audio = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.onState("stopped");
  }

  async #mintToken() {
    const res = await fetch(this.tokenUrl, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Could not get a listening token (${res.status}). ${body.slice(0, 200)}`,
      );
    }
    const data = await res.json();
    if (!data.token) throw new Error("The token endpoint returned no token.");
    return data.token;
  }

  #openSocket(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      let opened = false;

      const fail = (msg) => {
        if (!opened) reject(new Error(msg));
      };

      ws.onopen = () => {
        opened = true;
        this.ws = ws;
        resolve();
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "Turn") {
          const text = (msg.transcript || "").trim();
          if (!text) return;
          if (msg.end_of_turn) this.onFinal(text);
          else this.onPartial(text);
        } else if (msg.type === "Begin") {
          this.onState("open", { id: msg.id });
        } else if (msg.type === "Termination") {
          this.onState("terminated", msg);
        } else if (msg.error) {
          this.onState("error", msg.error);
        }
      };

      ws.onerror = () => fail("The connection to the transcriber failed.");
      ws.onclose = (e) => {
        // 1000 is a clean close; anything else during setup is a real failure,
        // and the close code carries the reason AssemblyAI rejected us.
        if (!opened) fail(`The transcriber closed the connection (${e.code}).`);
        else if (this.running) this.onState("closed", { code: e.code, reason: e.reason });
      };
    });
  }
}
