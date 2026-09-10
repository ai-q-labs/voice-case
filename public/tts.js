/**
 * Voice Case — the game master's voice.
 *
 * Web Speech API, so it costs nothing and needs no key. Two things here are
 * not obvious:
 *
 * 1. Chrome silently drops utterances longer than a few hundred characters.
 *    The epilogue is longer than that, so text is split on sentence
 *    boundaries and queued.
 * 2. `speechSynthesis.getVoices()` is empty on first call in Chrome. The voice
 *    list arrives later on a `voiceschanged` event, so voice choice is resolved
 *    lazily rather than at construction.
 */

const MAX_CHUNK = 200;

function splitForSpeech(text) {
  const sentences = String(text).match(/[^.!?]+[.!?]*\s*/g) || [String(text)];
  const out = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > MAX_CHUNK && current) {
      out.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export class Narrator {
  constructor({ onStart, onEnd } = {}) {
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.onStart = onStart || (() => {});
    this.onEnd = onEnd || (() => {});
    this.speaking = false;

    if (this.synth && typeof this.synth.addEventListener === "function") {
      this.synth.addEventListener("voiceschanged", () => this.#pickVoice());
    }
    this.#pickVoice();
  }

  get available() {
    return Boolean(this.synth);
  }

  #pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices() || [];
    if (voices.length === 0) return;
    // A slower, lower English voice suits a narrator reading a crime scene.
    // Order of preference, then anything English, then whatever exists.
    const wanted = [
      "Google UK English Male",
      "Daniel",
      "Microsoft Ryan Online (Natural) - English (United Kingdom)",
      "Google UK English Female",
      "Microsoft Sonia Online (Natural) - English (United Kingdom)",
    ];
    this.voice =
      wanted.map((n) => voices.find((v) => v.name === n)).find(Boolean) ||
      voices.find((v) => /^en[-_]GB/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0];
  }

  /** @returns {Promise<void>} resolves when the last chunk has finished. */
  speak(text) {
    if (!this.synth || !text) return Promise.resolve();
    this.cancel();

    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return Promise.resolve();

    this.speaking = true;
    this.onStart();

    return new Promise((resolve) => {
      let index = 0;
      const next = () => {
        if (index >= chunks.length) {
          this.speaking = false;
          this.onEnd();
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[index]);
        index += 1;
        if (this.voice) u.voice = this.voice;
        u.rate = 0.98;
        u.pitch = 0.95;
        u.onend = next;
        // A dropped utterance must not hang the turn: treat an error as an end.
        u.onerror = next;
        this.synth.speak(u);
      };
      next();
    });
  }

  cancel() {
    if (!this.synth) return;
    this.synth.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.onEnd();
    }
  }
}

export { splitForSpeech };
