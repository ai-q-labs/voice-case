/**
 * Voice Case — the layer that hears, decides and speaks.
 *
 * Read this file with one question in mind: where would the answer leak?
 *
 *   case/glasshouse.js  has no solution key — the answer is not in the bundle
 *   engine.js           can only mark a guess, never look one up
 *   intent.js           is mechanical, so nothing here is written by something
 *                       that knows
 *   this file           passes `result.say` to the narrator and never reads
 *                       the case itself
 *
 * There is no model in the loop. The game master is articulate because the case
 * file is written well, not because a language model is improvising over a
 * document that happens to contain the culprit's name.
 */

import { createEngine, CASE, QUESTION_BUDGET } from "./engine.js";
import { httpGrader } from "./grader.js";
import { resolve } from "./intent.js";
import { Listener } from "./stt.js";
import { Narrator } from "./tts.js";

const engine = createEngine({ grade: httpGrader("./api/verdict") });
const $ = (id) => document.getElementById(id);

const el = {
  mic: $("mic"),
  status: $("status"),
  log: $("log"),
  heard: $("heard"),
  entry: $("entry"),
  send: $("send"),
  phase: $("phase"),
  questions: $("questions"),
  found: $("found"),
  evidence: $("evidence"),
  pending: $("pending"),
};

let lastSay = "";
let busy = false;

// ---- output ---------------------------------------------------------------

const narrator = new Narrator({
  onStart: () => listener?.mute(),
  onEnd: () => listener?.unmute(),
});

function write(who, text) {
  const row = document.createElement("div");
  row.className = `line line--${who}`;
  const tag = document.createElement("span");
  tag.className = "line__who";
  tag.textContent = who === "gm" ? "GM" : "You";
  const body = document.createElement("p");
  body.className = "line__body";
  body.textContent = text;
  row.append(tag, body);
  el.log.append(row);
  el.log.scrollTop = el.log.scrollHeight;
}

/**
 * Not awaited on purpose. The turn is over once the line is on screen; holding
 * the lock until the narrator finishes would mean a player cannot say "stop"
 * over a long epilogue. `narrator.speak` cancels whatever is already going, so
 * two lines in quick succession do not overlap.
 */
function say(text) {
  if (!text) return;
  lastSay = text;
  write("gm", text);
  narrator.speak(text);
}

// ---- input ----------------------------------------------------------------

const listener = new Listener({
  tokenUrl: "./api/token",
  onPartial: (text) => {
    el.heard.textContent = text;
    el.heard.dataset.state = "partial";
  },
  onFinal: (text) => {
    el.heard.textContent = "";
    delete el.heard.dataset.state;
    handle(text);
  },
  onState: (state, detail) => {
    if (state === "listening") setStatus("listening", "Listening");
    else if (state === "connecting") setStatus("connecting", "Connecting");
    else if (state === "stopped") setStatus("off", "Microphone off");
    else if (state === "closed") setStatus("off", "Disconnected");
    else if (state === "error") {
      setStatus("error", "Transcriber error");
      write("gm", `[${typeof detail === "string" ? detail : "transcriber error"}]`);
    }
  },
});

function setStatus(kind, text) {
  el.status.dataset.kind = kind;
  el.status.textContent = text;
}

// ---- the turn -------------------------------------------------------------

async function handle(transcript) {
  if (busy) return;
  const clean = transcript.trim();
  if (!clean) return;

  busy = true;
  try {
    write("you", clean);
    const snap = engine.get();
    const intent = resolve(clean, { pending: Boolean(snap.pending) });
    await dispatch(intent);
    render();
  } finally {
    busy = false;
  }
}

async function dispatch(intent) {
  const snap = engine.get();

  // Nothing but "start" works before the case is open.
  if (
    snap.phase === "briefing" &&
    !["begin", "help", "repeat", "suspects", "restart", "quiet"].includes(intent.kind)
  ) {
    return say("Say start when you are ready to begin.");
  }

  switch (intent.kind) {
    case "begin": {
      const r = engine.begin();
      return say(r.say);
    }

    case "examine":
      return say(engine.examine(intent.object).say);

    case "ask":
      return say(engine.ask(intent.suspect, intent.topic).say);

    case "topics":
      return say(engine.topicsFor(intent.suspect).say);

    case "suspects":
      return say(engine.suspects().say);

    case "searchable":
      return say(engine.searchable().say);

    case "notebook":
      return say(engine.notebook().say);

    case "options":
      return say(engine.accusationOptions().say);

    case "accuse": {
      const r = engine.proposeAccusation({
        culprit: intent.culprit,
        method: intent.method,
        motive: intent.motive,
      });
      return say(r.say);
    }

    case "confirm": {
      if (!snap.pending) return say("There is nothing on the table to confirm.");
      const r = await engine.confirmAccusation();
      return say(r.say);
    }

    case "withdraw":
      return say(engine.withdrawAccusation().say);

    case "reopen":
      return say(engine.reopen().say);

    case "restart":
      return say(engine.restart().say);

    case "repeat":
      return say(lastSay || "I have not said anything yet.");

    case "quiet":
      narrator.cancel();
      return;

    case "help":
      return say(HELP);

    default:
      return say(
        "I did not follow that. You can search something — the ledger, the thermostat, the boots, the syringe, the letter, the keys, the orchid. You can ask Vale, Desmond, Iris or Tobias about the night. Or say notebook to hear what you have.",
      );
  }
}

const HELP = [
  "Four things get you through this.",
  "Search something: say the ledger, or the syringe.",
  "Ask someone: ask Tobias about the letter.",
  "Take stock: say notebook.",
  "Finish it: I accuse Tobias, by oleander, over authorship — then say yes.",
  "Searching is free. You have ten questions.",
].join(" ");

// ---- rendering ------------------------------------------------------------

function render() {
  const s = engine.get();

  el.phase.textContent =
    s.phase === "briefing"
      ? "Not yet begun"
      : s.phase === "investigation"
        ? "03:40 — the glasshouse"
        : s.verdict?.correct
          ? "Closed"
          : "Wrong, and the road is still out";

  el.questions.textContent = `${s.questionsLeft} / ${QUESTION_BUDGET}`;
  el.found.textContent = `${s.examined.length} / ${Object.keys(CASE.objects).length}`;

  el.evidence.replaceChildren();
  for (const n of s.notebook) {
    const li = document.createElement("li");
    li.className = `note note--${n.kind}`;
    li.textContent = n.text;
    el.evidence.append(li);
  }

  if (s.pending) {
    el.pending.hidden = false;
    el.pending.textContent = `On the table: ${s.pending.readable.culprit}, by ${s.pending.readable.method}, over ${s.pending.readable.motive}. Say yes or no.`;
  } else {
    el.pending.hidden = true;
  }
}

// ---- wiring ---------------------------------------------------------------

el.mic.addEventListener("click", async () => {
  if (listener.isRunning) {
    await listener.stop();
    el.mic.textContent = "Start listening";
    el.mic.dataset.on = "false";
    return;
  }
  try {
    el.mic.disabled = true;
    await listener.start();
    el.mic.textContent = "Stop listening";
    el.mic.dataset.on = "true";
  } catch (err) {
    setStatus("error", "Microphone unavailable");
    write("gm", `[${err.message}]`);
  } finally {
    el.mic.disabled = false;
  }
});

el.send.addEventListener("click", submitTyped);
el.entry.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTyped();
});

function submitTyped() {
  const text = el.entry.value;
  el.entry.value = "";
  handle(text);
}

engine.subscribe(render);
render();

say(
  `${CASE.title}. ${engine.caseFile().say} Press start listening and say start — or type it, if you would rather not talk to your computer at this hour.`,
);

// Deliberately exposed, and deliberately incomplete: every method the game
// master can call is here, and the answer is not, because it is not in the
// page at all. Try it. `voiceCase.engine.notebook()`, `.suspects()`,
// `.searchable()`, in any order you like — then look in the Network tab and
// see that nothing ever arrived carrying the culprit's name.
window.voiceCase = { engine, resolve };
