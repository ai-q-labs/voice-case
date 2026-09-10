/**
 * The intent resolver is the part that has to survive real speech.
 *
 * Cases marked "as heard" are the transcript, not the sentence — what a
 * recogniser actually hands you when someone says the sentence at four in the
 * morning with rain on the glass.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolve, editDistance, normalise } from "../public/intent.js";

const kind = (s, ctx) => resolve(s, ctx).kind;

test("bare nouns are searches, because that is how people play", () => {
  assert.deepEqual(resolve("the ledger"), { kind: "examine", object: "ledger" });
  assert.deepEqual(resolve("syringe"), { kind: "examine", object: "syringe" });
  assert.deepEqual(resolve("look at the keys"), { kind: "examine", object: "keys" });
  assert.deepEqual(resolve("search the boots"), { kind: "examine", object: "boots" });
});

test("a suspect plus anything is a question to that suspect", () => {
  assert.deepEqual(resolve("ask Tobias about the letter"), {
    kind: "ask",
    suspect: "tobias",
    topic: "letter",
  });
  assert.deepEqual(resolve("Iris, where were you last night"), {
    kind: "ask",
    suspect: "iris",
    topic: "night",
  });
  // No topic named: fall back to the one question everyone answers.
  assert.deepEqual(resolve("question Desmond"), {
    kind: "ask",
    suspect: "desmond",
    topic: "night",
  });
});

test("the earliest name wins, so 'ask Iris about Tobias' is a question for Iris", () => {
  const r = resolve("ask Iris about Tobias");
  assert.equal(r.kind, "ask");
  assert.equal(r.suspect, "iris");
});

test("a suspect cannot become their own topic", () => {
  const r = resolve("ask Tobias about Tobias");
  assert.equal(r.suspect, "tobias");
  assert.notEqual(r.topic, "tobias");
});

test("accusations are parsed as three independent slots", () => {
  assert.deepEqual(resolve("I accuse Tobias, by oleander, over authorship"), {
    kind: "accuse",
    culprit: "tobias",
    method: "oleander",
    motive: "credit",
  });
  assert.deepEqual(resolve("it was Vale with the cold for the money"), {
    kind: "accuse",
    culprit: "vale",
    method: "frost",
    motive: "money",
  });
  // A half-formed accusation still resolves; the engine asks for the rest.
  const partial = resolve("I accuse Desmond");
  assert.equal(partial.kind, "accuse");
  assert.equal(partial.culprit, "desmond");
  assert.equal(partial.method, null);
});

test("'nobody' is a valid accusation", () => {
  const r = resolve("I accuse nobody, this was not a murder");
  assert.equal(r.culprit, "nobody");
});

test("yes and no only mean confirm and withdraw when something is on the table", () => {
  assert.equal(kind("yes", { pending: true }), "confirm");
  assert.equal(kind("no, take it back", { pending: true }), "withdraw");
  // Without a pending accusation, "no" must not silently confirm anything.
  assert.notEqual(kind("no", { pending: false }), "confirm");
});

test("as heard: the recogniser mangles names and it still works", () => {
  // Real substitutions the recogniser makes for these four names.
  assert.equal(resolve("ask veil about the thermostat").suspect, "vale");
  assert.equal(resolve("ask desmund about the keys").suspect, "desmond");
  assert.equal(resolve("ask toby about the letter").suspect, "tobias");
  // ...and for the objects.
  assert.equal(resolve("the ledgers").object, "ledger");
  assert.equal(resolve("look at the shoes").object, "boots");
});

test("as heard: filler and punctuation do not change the meaning", () => {
  assert.deepEqual(resolve("um, so, could you just look at the letter please"), {
    kind: "examine",
    object: "letter",
  });
  assert.equal(kind("Notebook."), "notebook");
  assert.equal(kind("what have I got"), "notebook");
});

test("housekeeping verbs", () => {
  assert.equal(kind("start"), "begin");
  assert.equal(kind("say that again"), "repeat");
  assert.equal(kind("help"), "help");
  assert.equal(kind("who is here"), "suspects");
  assert.equal(kind("reopen"), "reopen");
  assert.equal(kind("start over"), "restart");
  assert.equal(kind("stop"), "quiet");
});

test("nonsense comes back as unknown rather than a wrong guess", () => {
  const r = resolve("the quick brown fox jumped");
  assert.equal(r.kind, "unknown");
  assert.equal(r.transcript, "the quick brown fox jumped");
  assert.equal(kind(""), "unknown");
  assert.equal(kind("   "), "unknown");
});

test("edit distance is capped and symmetric enough to be trusted", () => {
  assert.equal(editDistance("ledger", "ledger"), 0);
  assert.equal(editDistance("ledger", "ledgar"), 1);
  assert.equal(editDistance("tobias", "toby"), 3); // capped
  assert.equal(editDistance("a", "abcdefgh"), 3); // capped, not thrown
});

test("normalise strips what speech-to-text adds", () => {
  assert.equal(normalise("  Ask TOBIAS, about the letter!  "), "ask tobias about the letter");
});

/**
 * These four strings are not invented. They are what AssemblyAI actually
 * returned on 2026-09-10 when the sentences were spoken into
 * `wss://streaming.assemblyai.com/v3/ws` (Universal-3.5-pro, language_codes=en,
 * keyterms_prompt with the cast list). Fixtures and probe in `_fixtures/`.
 *
 * They are here because the first three were written from imagination and all
 * three were wrong about *how* a recogniser fails. It does not politely mangle
 * a name and leave the sentence — it keeps the unusual proper nouns, because
 * those are what `keyterms_prompt` pins, and dissolves the ordinary words
 * around them.
 */
test("as actually heard: real AssemblyAI output for the four spoken commands", () => {
  // "start"
  assert.equal(kind("Start."), "begin");

  // "search the ledger"
  assert.deepEqual(resolve("Search the ledger."), { kind: "examine", object: "ledger" });

  // "ask Tobias about the letter" — the topic dissolved, the name survived.
  // Falling back to his default question is the right failure: the player
  // hears an answer and can ask again, rather than hitting an error.
  const asked = resolve("asked Tobias, about to dare it.");
  assert.equal(asked.kind, "ask");
  assert.equal(asked.suspect, "tobias");

  // 🔴 "I accuse Tobias by oleander over authorship" — the VERB was destroyed
  // ("I accuse" → "Hi, I'm") while all three entities came through clean.
  // Requiring the verb would have read the player's ending as a question.
  assert.deepEqual(resolve("Hi, I'm Tobias by Oleander Over Authorship."), {
    kind: "accuse",
    culprit: "tobias",
    method: "oleander",
    motive: "credit",
  });
});

test("three filled slots is an accusation; two is not", () => {
  // All three present, no verb: an accusation.
  assert.equal(resolve("Vale, the cold, the money").kind, "accuse");
  // Only two: this is still a question, and must not end the game.
  assert.equal(resolve("Vale and the cold").kind, "ask");
});
