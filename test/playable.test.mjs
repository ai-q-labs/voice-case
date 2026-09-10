/**
 * Is it actually solvable?
 *
 * The seal tests prove the answer cannot leak. They say nothing about whether
 * a player can *find* it, and a mystery that cannot be solved inside its own
 * question budget is broken no matter how well sealed it is.
 *
 * So this walks the case the way a competent first-time player would — search
 * the room, follow what the room suggests, spend questions on the openings that
 * appear — and asserts that the chain closes on all three parts of the answer
 * with questions to spare.
 *
 * It also asserts the reverse: that the obvious wrong readings are *available*.
 * A mystery where only one accusation can be assembled is not a mystery.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createEngine, QUESTION_BUDGET } from "../public/engine.js";
import { resolve } from "../public/intent.js";
import { grade } from "../server/solution.js";

const engine = () => createEngine({ grade: async (g) => grade(g) });

/** Play by speaking, not by calling methods — this exercises the real path. */
function speak(e, transcript) {
  const snap = e.get();
  const intent = resolve(transcript, { pending: Boolean(snap.pending) });
  switch (intent.kind) {
    case "begin":
      return e.begin();
    case "examine":
      return e.examine(intent.object);
    case "ask":
      return e.ask(intent.suspect, intent.topic);
    case "notebook":
      return e.notebook();
    case "accuse":
      return e.proposeAccusation(intent);
    case "confirm":
      return e.confirmAccusation();
    default:
      throw new Error(`the resolver did not understand: ${transcript} (${intent.kind})`);
  }
}

test("a first-time player can solve it inside the question budget", async () => {
  const e = engine();
  speak(e, "start");

  // Searching is free, so a sensible player sweeps the room first.
  const room = [
    "the ledger",
    "the thermostat",
    "the boots",
    "the syringe",
    "the letter",
    "the keys",
    "the orchid",
  ];
  const found = room.map((s) => speak(e, s));
  for (const r of found) {
    assert.equal(r.ok, true, `searching failed: ${r.say}`);
    assert.equal(r.newToYou, true);
  }

  // What the room has told them, in plain terms:
  //   ledger   someone was in the north bed at 01:15, in an unfamiliar hand
  //   boots    small, red clay — someone was digging
  //   syringe  rinsed, green residue in the seal
  //   orchid   two oleander leaves cut
  //   letter   a paper accepted under one name
  //   keys     the archive key forced off the ring
  //   thermostat  M V, and put back
  const notes = e.notebook();
  assert.equal(notes.evidence.length, 7);
  assert.equal(notes.unexamined.length, 0);

  // Now the questions. Each one is prompted by something the room said.
  const asked = [
    "ask Vale about the thermostat", // clears the cold, and her initials
    "ask Iris about the boots", // clears the digging
    "ask Desmond about the ledger", // confirms someone was there at 01:15
    "ask Tobias about the ledger", // he denies the hand
    "ask Tobias about the letter", // the motive, in his own words
    "ask Tobias about the night", // "I left at midnight" — contradicted by the ledger
  ];
  for (const q of asked) {
    const r = speak(e, q);
    assert.equal(r.ok, true, `question failed: ${r.say}`);
    assert.equal(r.onTopic, true, `no one is home for: ${q}`);
  }

  assert.ok(
    e.get().questionsLeft >= 4,
    `solving it should not consume the whole budget (left: ${e.get().questionsLeft})`,
  );

  speak(e, "I accuse Tobias, by oleander, over authorship");
  assert.ok(e.get().pending, "the accusation should be staged, not resolved");

  const verdict = await speak(e, "yes");
  assert.equal(verdict.correct, true, `a fair reading did not solve it: ${verdict.say}`);
  assert.match(verdict.say, /All three/);
});

test("the wrong readings are genuinely available — it is not a one-answer form", async () => {
  // Each of these is supported by something real in the room. If any of them
  // were unassemblable the case would be a formality rather than a puzzle.
  const decoys = [
    { culprit: "vale", method: "frost", motive: "silence" }, // her initials on the cold
    { culprit: "iris", method: "fall", motive: "money" }, // digging, and the land sale
    { culprit: "desmond", method: "smother", motive: "revenge" }, // found the body
    { culprit: "nobody", method: "frost", motive: "silence" }, // not a murder at all
  ];

  for (const d of decoys) {
    const e = engine();
    e.begin();
    const staged = e.proposeAccusation(d);
    assert.equal(staged.ok, true, `could not even stage ${JSON.stringify(d)}`);
    const v = await e.confirmAccusation();
    assert.equal(v.correct, false);
    assert.match(v.say, /You had \d of the three/);
  }
});

test("a wrong accusation is recoverable, and costs no questions", async () => {
  const e = engine();
  e.begin();
  e.ask("vale", "night");
  const before = e.get().questionsLeft;

  e.proposeAccusation({ culprit: "vale", method: "frost", motive: "money" });
  await e.confirmAccusation();
  assert.equal(e.get().phase, "verdict");

  const back = e.reopen();
  assert.equal(back.ok, true);
  assert.equal(e.get().phase, "investigation");
  assert.equal(e.get().questionsLeft, before, "reopening must not cost a question");
});

test("running out of questions does not soft-lock the case", async () => {
  const e = engine();
  e.begin();
  for (let i = 0; i < QUESTION_BUDGET; i += 1) e.ask("vale", "night");

  const refused = e.ask("tobias", "letter");
  assert.equal(refused.ok, false);
  assert.match(refused.say, /Make your accusation/);

  // Searching still works, and so does finishing.
  assert.equal(e.examine("letter").ok, true);
  e.proposeAccusation({ culprit: "tobias", method: "oleander", motive: "credit" });
  assert.equal((await e.confirmAccusation()).correct, true);
});

test("every suspect answers on the topics the room points them at", () => {
  const e = engine();
  e.begin();
  // If the room raises a subject and nobody will discuss it, the player hits a
  // dead end that reads like a bug rather than a refusal.
  const expected = {
    vale: ["thermostat", "orchid", "night", "finch"],
    desmond: ["night", "keys", "ledger", "finch"],
    iris: ["night", "boots", "finch", "letter"],
    tobias: ["night", "ledger", "letter", "keys", "finch"],
  };
  for (const [who, topics] of Object.entries(expected)) {
    const got = e.topicsFor(who).topics;
    assert.deepEqual(new Set(got), new Set(topics), `topics changed for ${who}`);
  }
});
