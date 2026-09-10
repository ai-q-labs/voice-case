/**
 * The claim of this project, checked mechanically.
 *
 * Everything else here is a game. This file is the argument: the answer is not
 * in the bytes the browser receives, and no sequence of engine calls produces
 * it. If someone later adds the solution back into the case file "for
 * convenience", or has the engine return the culprit on a wrong guess to be
 * helpful, these tests fail and the demo stops being true.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEngine } from "../public/engine.js";
import { grade, SOLUTION } from "../server/solution.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");

async function filesUnder(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full)));
    else out.push(full);
  }
  return out;
}

test("nothing served to the browser contains the answer", async () => {
  const files = await filesUnder(PUBLIC);
  assert.ok(files.length >= 8, "expected the public tree to be populated");

  // The three parts of the answer, plus a distinctive phrase from the epilogue
  // that would only appear if the closing text had been shipped.
  const forbidden = [
    SOLUTION.culprit, // "tobias" appears as a *suspect id*, so see below
    "does not argue",
    "forgot the seal",
    SOLUTION.near_miss.method.slice(0, 40),
    SOLUTION.epilogue.slice(0, 40),
  ];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const rel = path.relative(ROOT, file);

    // A `solution` key anywhere in the served tree is the failure mode this
    // whole design exists to prevent.
    assert.ok(
      !/\bsolution\s*:/.test(text),
      `${rel} declares a "solution" key — the answer must stay in server/`,
    );

    for (const needle of forbidden.slice(1)) {
      assert.ok(
        !text.includes(needle),
        `${rel} contains answer material: ${JSON.stringify(needle.slice(0, 30))}`,
      );
    }
  }
});

test("the culprit is not distinguishable from the other suspects in the bundle", async () => {
  // "tobias" must appear — he is a suspect. What must NOT happen is that he
  // appears in a way the other three do not, which is how an answer leaks even
  // when nobody wrote the word "solution".
  const files = await filesUnder(PUBLIC);
  const counts = { vale: 0, desmond: 0, iris: 0, tobias: 0 };

  for (const file of files) {
    const text = (await fs.readFile(file, "utf8")).toLowerCase();
    for (const id of Object.keys(counts)) {
      counts[id] += text.split(id).length - 1;
    }
  }

  for (const id of Object.keys(counts)) {
    assert.ok(counts[id] > 0, `${id} should appear in the case at all`);
  }

  // Tobias is referenced in the help text as the worked example, so he is
  // allowed to be ahead — but not by an order of magnitude, which would be a
  // tell in itself.
  const others = ["vale", "desmond", "iris"].map((k) => counts[k]);
  const floor = Math.min(...others);
  assert.ok(
    counts.tobias <= floor * 4,
    `tobias appears ${counts.tobias} times vs a floor of ${floor} for the others — that is a tell`,
  );
});

test("no sequence of engine calls returns the answer", async () => {
  const engine = createEngine({ grade: async (g) => grade(g) });
  engine.begin();

  const harvested = [];
  const collect = (v) => harvested.push(JSON.stringify(v));

  // Everything the game master can reach, called exhaustively.
  collect(engine.caseFile());
  collect(engine.suspects());
  collect(engine.searchable());
  collect(engine.accusationOptions());
  collect(engine.notebook());
  for (const id of ["vale", "desmond", "iris", "tobias"]) {
    collect(engine.topicsFor(id));
  }
  for (const obj of ["ledger", "thermostat", "boots", "syringe", "letter", "keys", "orchid"]) {
    collect(engine.examine(obj));
    collect(engine.examine(obj)); // twice: re-reads must not reveal more
  }
  for (const s of ["vale", "desmond", "iris", "tobias"]) {
    for (const t of ["night", "finch", "ledger", "letter", "keys", "orchid", "boots", "thermostat"]) {
      collect(engine.ask(s, t));
    }
  }
  collect(engine.notebook());
  collect(engine.get());
  collect(engine.solutionText()); // gated: should refuse

  const all = harvested.join("\n");
  assert.ok(
    !all.includes("does not argue") && !all.includes("forgot the seal"),
    "the epilogue leaked out of the engine",
  );
  assert.ok(
    !all.includes(SOLUTION.near_miss.culprit.slice(0, 40)),
    "a near-miss hint leaked before any accusation was made",
  );
});

test("a wrong accusation never returns the value you got wrong", async () => {
  const engine = createEngine({ grade: async (g) => grade(g) });
  engine.begin();

  engine.proposeAccusation({ culprit: "iris", method: "frost", motive: "money" });
  const r = await engine.confirmAccusation();

  assert.equal(r.ok, true);
  assert.equal(r.correct, false);
  assert.ok(!r.say.includes("Tobias"), "the verdict named the culprit");
  assert.ok(!r.say.includes("oleander"), "the verdict named the method");
  assert.equal(r.parts.culprit, false);
  assert.equal(r.parts.method, false);
  assert.equal(r.parts.motive, false);
});

test("the grader marks the right answer and only the right answer", () => {
  assert.equal(grade({ culprit: "tobias", method: "oleander", motive: "credit" }).correct, true);
  assert.equal(grade({ culprit: "tobias", method: "oleander", motive: "money" }).correct, false);
  assert.equal(grade({ culprit: "tobias", method: "frost", motive: "credit" }).correct, false);
  assert.equal(grade({ culprit: "iris", method: "oleander", motive: "credit" }).correct, false);
  assert.equal(grade({}).correct, false);

  // The epilogue is only ever attached to a correct mark.
  assert.equal(grade({ culprit: "iris", method: "frost", motive: "money" }).epilogue, null);
  assert.ok(grade({ culprit: "tobias", method: "oleander", motive: "credit" }).epilogue.length > 100);
});
