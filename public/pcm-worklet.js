/**
 * Float32 microphone frames in, 16-bit little-endian PCM out.
 *
 * AssemblyAI's streaming endpoint takes mono signed 16-bit PCM at whatever
 * sample rate you declare on the query string, so there is no resampling here:
 * the page reads `AudioContext.sampleRate` and declares that. Resampling in a
 * worklet is where a lot of streaming demos quietly lose their consonants.
 *
 * Frames arrive 128 samples at a time. That is far too small to put on a
 * socket, so they are accumulated into ~100 ms blocks first.
 */

const TARGET_MS = 100;

class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = Math.round((sampleRate * TARGET_MS) / 1000);
    this.buffer = new Int16Array(this.blockSize);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      // Clamp before scaling: a sample above 1.0 wraps to a loud click if the
      // conversion is left to the Int16Array store.
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.filled += 1;

      if (this.filled === this.blockSize) {
        const out = new Int16Array(this.buffer);
        this.port.postMessage(out.buffer, [out.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);
