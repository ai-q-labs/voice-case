# Voice Case — *The Glasshouse, 03:40*

**A murder mystery you play by talking. The game master narrates the whole
case, and does not know who did it.**

Built for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/) on
[lablab.ai](https://lablab.ai/). MIT licensed.

---

## The problem this is actually solving

We publish printable murder-mystery scenarios — eleven of them, in five
languages, across eight storefronts. We know why people buy one and never play
it, because they tell us: **they cannot get the table together.**

A scenario needs three to eight players *plus* a host, and the host is the
person who reads the answers first and therefore never gets to play. That is
one person who has to volunteer to be excluded. Most groups never find them.

So: let an AI be the host.

Which sounds trivial until you try it.

> **The moment you put the scenario in the context window, the model knows who
> did it.**

And then it narrates the crime scene knowing. It plays the suspects knowing. It
decides what your search of the potting bench turns up, knowing. It will hedge,
it will foreshadow, it will subtly steer, and — reliably, in our testing — if
you ask it a leading enough question it will simply tell you.

You cannot prompt your way out of this. "Do not reveal the murderer" fails for
the same reason "do not think of an elephant" fails. **The information is
there.**

## The answer: don't give it the document

```
  your voice
      │
      ▼  AssemblyAI Universal-Streaming        wss://streaming.assemblyai.com/v3/ws
  transcript
      │
      ▼  intent.js — mechanical, no model      "ask toby about the letter"
  engine call                                   → ask("tobias", "letter")
      │
      ▼  engine.js — can mark, cannot look up
  a line of narration
      │
      ▼  speechSynthesis
  the game master speaks
```

The culprit, the method, the motive, the hints and the ending live in
**`server/solution.js`**, which is not under the static root and is never sent
to the browser. The page can reach exactly one thing in that file:

```
POST /api/verdict   { culprit, method, motive }
                 →  { correct, parts: {culprit, method, motive}, hint, epilogue }
```

A guess goes out. A mark comes back. On a miss you get three booleans and a
nudge — never the value you got wrong.

**Open devtools and look.** The answer is not obfuscated in the bundle. It is
absent from it.

To be explicit, since this is a public repository: `server/solution.js` is right
there in the tree and you are welcome to read it. The claim is about what the
*running page* receives, and about what the *narrating layer* can reach — a
model handed this codebase minus one file can run the table honestly, and that
is the property worth having. If you want to play unspoiled, don't open that
file.

## Why the intent layer is rule-based

This is the part people push back on, so: it is not about cost.

If the transcript goes to an LLM that also holds the case file, you are back
where you started — the thing choosing your words has read the ending. Keeping
`intent.js` mechanical is what makes the seal mean anything.

The cost of that choice is that it has to survive real speech-to-text, so it
carries an alias table (what players say), a bounded edit distance (what the
recogniser hears instead), and one rule that does most of the work: **a bare
noun is a search**, because in play most utterances are.

```js
resolve("the ledger")                 // → { kind: "examine", object: "ledger" }
resolve("ask toby about the letter")  // → { kind: "ask", suspect: "tobias", topic: "letter" }
resolve("ask Iris about Tobias")      // → a question for Iris, not Tobias
resolve("um, so, could you just look at the letter please")
                                      // → { kind: "examine", object: "letter" }
```

Commands get one edit of slack; names get two. That asymmetry is load-bearing:
names come back mangled and we want to accept "Tobius", but two edits makes
"start" indistinguishable from "restart", which is the exact pair a player hits
on their second game.

## The seal, checked by CI rather than asserted in a README

`test/seal.test.mjs` is the argument, not the prose above:

| Test | What would break it |
|---|---|
| nothing served to the browser contains the answer | someone puts `solution:` back in the case file |
| the culprit is not distinguishable from the others in the bundle | the answer leaks as a *frequency* tell, with no giveaway word |
| no sequence of engine calls returns the answer | every method, called exhaustively, then grepped |
| a wrong accusation never returns the value you got wrong | someone makes the miss message "more helpful" |

And `test/playable.test.mjs` asks the other question, which sealing does not
answer: **can it be solved?** It plays the case the way a first-time player
would — sweep the room, then spend questions on the openings the room actually
opened — and asserts the chain closes on all three parts **with four questions
to spare**. It also asserts the reverse, that the four obvious wrong readings
are all assemblable: a mystery with only one possible accusation is a form, not
a puzzle.

```
$ npm test
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

## Run it

```bash
git clone <this repo> && cd voice-case
export ASSEMBLYAI_API_KEY=...      # free tier, no card: assemblyai.com
npm start                          # → http://localhost:3000
```

No dependencies. Node 20+, and Node's own `http`, `fs` and `fetch`.

**Without a key it still runs** — the microphone is disabled and there is a
text box, which is also the fastest way to review the game.

Say **start**, then:

| | |
|---|---|
| Search — free, unlimited | *the ledger* · *the syringe* · *look at the keys* |
| Ask — ten questions total | *ask Tobias about the letter* · *Iris, where were you last night* |
| Take stock | *notebook* · *who is here* · *what is left* |
| Finish | *I accuse Tobias, by oleander, over authorship* → *yes* |

## Cost

Zero, and deliberately so — this has to be runnable by anyone reviewing it.

| | | |
|---|---|---|
| AssemblyAI Universal-Streaming | **$0** | free tier is `up to 333 hours of streaming transcription`, `no credit card required` |
| Text to speech | **$0** | the browser's own `speechSynthesis` |
| LLM | **not used** | the intent layer is mechanical, by design |
| Hosting | **$0** | Replit Starter, or any Node host |

The API key never reaches the browser. The page calls its own origin for a
[temporary token](https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token)
(`GET /v3/token`, 120 s, single use), then opens the socket with it.

## Layout

```
public/                  everything the browser gets — and no more
  case/glasshouse.js       the room, the four, what they will say. No answer key.
  engine.js                game state; holds a `grade` function, not a solution
  intent.js                transcript → engine call, mechanically
  stt.js                   AssemblyAI streaming client
  pcm-worklet.js           Float32 mic frames → 16-bit PCM, in ~100 ms blocks
  tts.js                   the narrator's voice
  grader.js                the browser's only route to the answer
  app.js                   hear, decide, speak
server/solution.js       the answer. Never served.
_fixtures/stream_probe.py  streams a WAV at the live endpoint and prints the turns
server.js                token minting, marking, static files. No dependencies.
test/                    25 tests: 4 are the seal, 5 are playability,
                           and 2 pin real AssemblyAI transcripts
```

## Four things that were measured, not guessed

Each of these is a silent failure — nothing errors, nothing warns, and the
pipeline keeps returning confident output. They were found by streaming
synthesised speech at the live endpoint (`_fixtures/stream_probe.py`) rather
than by reasoning about the docs.

**1. The default model code-switches, and will transcribe your English into
another language.** Streaming *"ask Tobias about the letter"* came back as
Japanese katakana — a fluent, well-formed transcript of the wrong language. The
fix is `language_codes=en`.

**2. The obvious fix for that is worse.** `speech_model=universal-streaming-english`
pins the language, but is measurably less accurate on this vocabulary: *"search
the ledger"* became *"Search is a rich"*, where the default model got it exactly
right. Keep `universal-3-5-pro` and pin the language.

**3. `keyterms_prompt` must be a JSON array.** Comma-separated and
space-separated lists are both rejected with WebSocket close code `3006` and no
message. With the cast list in place, *"Tobias"*, *"oleander"* and
*"authorship"* all survive; without it, *"Tobias"* comes back as *"to be"*.

**4. The recogniser keeps your proper nouns and dissolves the words around
them** — which is the opposite of what we designed for. *"I accuse Tobias by
oleander over authorship"* came back as **"Hi, I'm Tobias by Oleander Over
Authorship"**: all three entities intact, the verb destroyed. An intent layer
that required the verb would have read the player's ending as a question and
eaten it. So three filled slots is an accusation, verb or no verb — and the real
transcript is pinned in `test/intent.test.mjs` so it stays that way.

Two more from the browser side:

**Declare the sample rate you actually have.** Safari ignores
`new AudioContext({ sampleRate: 16000 })`. Forcing 16 kHz into the query string
while sending 48 kHz audio does not error — it transcribes as confident nonsense,
because the recogniser hears a chipmunk. `stt.js` reads `AudioContext.sampleRate`
back and declares that.

**Chrome silently drops long utterances.** The epilogue is ~1,200 characters and
simply never speaks. `tts.js` splits on sentence boundaries into ~200 character
chunks and queues them.

## Credits and provenance

The sealed-engine idea is ours, first written as a text-only demo
(`sealed-case`, MIT, built for an earlier event). **This is a new
implementation for voice** — new case, new engine, new intent layer — and the
architecture has moved on from it in one important way: in the text version the
solution was hidden in a JavaScript closure, which stops an *agent* but not a
reader with devtools. Here it is not in the client at all.

*The Glasshouse, 03:40* is original, written for this submission. All four
suspects, the station and the journal are invented.

Built by [Ai-Q Labs](https://aiqlabs.itch.io/). Parts of this project were
written with AI assistance, and reviewed by a human before release.
