/**
 * Voice Case — game engine.
 *
 * The whole point of this file is what it cannot hand out.
 *
 * There is no answer in here to leak. `createEngine()` is constructed with a
 * `grade` function and captures it in a closure; in the browser that function
 * is an HTTP call to `server/solution.js`, which is not served. So:
 *
 *   - no method returns the culprit, the method or the motive
 *   - no `say` string contains them
 *   - the DOM never receives them
 *   - and reading every byte the page downloaded does not find them either,
 *     because they were never sent
 *
 * Call everything below, in any order, as many times as you like. The only way
 * a name comes back is `confirmAccusation()`, which grades a guess *you*
 * supplied — and on a miss it returns three booleans and a nudge, never the
 * value you got wrong.
 *
 * This is the part worth stealing for other projects: an AI game master built
 * by putting the scenario in the context window knows the ending, and every
 * line it writes afterwards is written by something that knows. Prompting it to
 * keep quiet does not change that. Not giving it the document does.
 */

import { CASE } from "./case/glasshouse.js";

export const PHASES = {
  BRIEFING: "briefing",
  INVESTIGATION: "investigation",
  VERDICT: "verdict",
};

/** Questions the four will answer before they stop talking. */
export const QUESTION_BUDGET = 10;

const listSpoken = (items) => {
  if (items.length === 0) return "nothing";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

/**
 * @param {object} opts
 * @param {(guess: {culprit: string, method: string, motive: string}) =>
 *          Promise<{correct: boolean, parts: object, hint: string|null, epilogue: string|null}>}
 *        opts.grade  the only route to the answer, and it only ever marks.
 */
export function createEngine({ grade } = {}) {
  if (typeof grade !== "function") {
    throw new Error("createEngine needs a grade function; see grader.js.");
  }

  const listeners = new Set();

  const state = {
    phase: PHASES.BRIEFING,
    examined: [],
    asked: [], // { suspect, topic }
    notebook: [], // { kind, text }
    questionsLeft: QUESTION_BUDGET,
    pending: null,
    verdict: null,
    wrongAttempts: 0,
  };

  const suspectById = (id) => CASE.suspects.find((s) => s.id === id);
  const emit = () => {
    for (const fn of listeners) fn(snapshot());
  };
  const note = (kind, text) => state.notebook.push({ kind, text });

  /** A read-only view. Deliberately contains no answer material. */
  function snapshot() {
    return {
      phase: state.phase,
      examined: [...state.examined],
      notebook: state.notebook.map((n) => ({ ...n })),
      asked: state.asked.map((a) => ({ ...a })),
      questionsLeft: state.questionsLeft,
      pending: state.pending ? { ...state.pending } : null,
      verdict: state.verdict ? { ...state.verdict } : null,
      objectsLeft: Object.keys(CASE.objects).filter(
        (k) => !state.examined.includes(k),
      ).length,
    };
  }

  function readable(kind, id) {
    if (kind === "culprit") {
      if (id === "nobody") return "no one";
      const s = suspectById(id);
      return s ? s.name : id;
    }
    const found = CASE.options[kind].find((o) => o.id === id);
    return found ? found.label : id;
  }

  /**
   * Every method returns `{ ok, say, ...data }`. `say` is the only thing the
   * voice layer reads aloud, so it is also the only surface a leak could use.
   */
  const api = {
    subscribe(fn) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },

    get: snapshot,

    caseFile() {
      return {
        ok: true,
        title: CASE.title,
        where: CASE.subtitle,
        victim: CASE.victim,
        policeArrive: "06:00",
        say: CASE.briefing,
      };
    },

    suspects() {
      const lines = CASE.suspects.map(
        (s) => `${s.name}, ${s.age}. ${s.role} ${s.visible}`,
      );
      return {
        ok: true,
        suspects: CASE.suspects.map(({ id, name, spoken, age, role, visible }) => ({
          id,
          name,
          spoken,
          age,
          role,
          knownMovements: visible,
        })),
        say: `There are four. ${lines.join(" ")}`,
      };
    },

    /** What is left in the room to look at. */
    searchable() {
      const left = Object.entries(CASE.objects)
        .filter(([id]) => !state.examined.includes(id))
        .map(([, o]) => o.label);
      return {
        ok: true,
        objects: Object.entries(CASE.objects).map(([id, o]) => ({
          id,
          label: o.label,
          where: o.where,
          examined: state.examined.includes(id),
        })),
        say:
          left.length === 0
            ? "You have been over all of it. Nothing in this room is still hiding."
            : `Still worth a look: ${listSpoken(left)}.`,
      };
    },

    begin() {
      if (state.phase !== PHASES.BRIEFING) {
        return { ok: false, say: "The investigation is already open." };
      }
      state.phase = PHASES.INVESTIGATION;
      emit();
      return {
        ok: true,
        phase: state.phase,
        say: "The glass is running with rain and the four of them are watching you. Go on, then. Search something, or ask someone a question.",
      };
    },

    examine(id) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, say: "You cannot search the room in this phase." };
      }
      const obj = CASE.objects[id];
      if (!obj) {
        return {
          ok: false,
          say: "There is nothing here by that name.",
          available: Object.keys(CASE.objects),
        };
      }
      const first = !state.examined.includes(id);
      if (first) {
        state.examined.push(id);
        note("evidence", obj.note);
        emit();
      }
      return {
        ok: true,
        id,
        label: obj.label,
        newToYou: first,
        say: first
          ? `${obj.label}, ${obj.where}. ${obj.reveals}`
          : `You have already been through ${obj.label}. ${obj.reveals}`,
      };
    },

    /** Searching costs nothing. Questions do. */
    ask(suspectId, topic) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, say: "No one is answering questions in this phase." };
      }
      const suspect = suspectById(suspectId);
      if (!suspect) {
        return {
          ok: false,
          say: "There is no one here by that name.",
          available: CASE.suspects.map((s) => s.spoken),
        };
      }
      if (state.questionsLeft <= 0) {
        return {
          ok: false,
          say: "They have stopped answering. It is nearly six and they have said all they intend to say. Make your accusation.",
        };
      }

      const theirs = CASE.interviews[suspectId] || {};
      const onTopic = Object.prototype.hasOwnProperty.call(theirs, topic);
      const line = onTopic ? theirs[topic] : CASE.no_comment[suspectId];

      state.questionsLeft -= 1;
      state.asked.push({ suspect: suspect.name, topic });
      if (onTopic) note("testimony", `${suspect.name} on ${topic}: ${line}`);
      emit();

      const left = state.questionsLeft;
      const tail =
        left === 0
          ? " That was the last question they will take."
          : left <= 3
            ? ` ${left} questions left.`
            : "";

      return {
        ok: true,
        suspect: suspect.name,
        topic,
        onTopic,
        questionsLeft: left,
        willDiscuss: Object.keys(theirs),
        say: `${suspect.name}. ${line}${tail}`,
      };
    },

    /** What a suspect is willing to be asked about. Free. */
    topicsFor(suspectId) {
      const suspect = suspectById(suspectId);
      if (!suspect) return { ok: false, say: "There is no one here by that name." };
      const ids = Object.keys(CASE.interviews[suspectId] || {});
      return {
        ok: true,
        topics: ids,
        say: `${suspect.name} will talk about ${listSpoken(
          ids.map((t) => CASE.topics[t] || t),
        )}.`,
      };
    },

    notebook() {
      const evidence = state.notebook
        .filter((n) => n.kind === "evidence")
        .map((n) => n.text);
      const testimony = state.notebook
        .filter((n) => n.kind === "testimony")
        .map((n) => n.text);

      const parts = [];
      parts.push(
        evidence.length
          ? `You have found ${evidence.length}. ${evidence.join(" ")}`
          : "You have found nothing yet.",
      );
      if (testimony.length) parts.push(`They have told you this. ${testimony.join(" ")}`);
      parts.push(`${state.questionsLeft} questions left.`);

      return {
        ok: true,
        evidence,
        testimony,
        questionsLeft: state.questionsLeft,
        unexamined: Object.entries(CASE.objects)
          .filter(([id]) => !state.examined.includes(id))
          .map(([id]) => id),
        say: parts.join(" "),
      };
    },

    accusationOptions() {
      return {
        ok: true,
        culprit: CASE.suspects
          .map((s) => ({ id: s.id, label: s.name }))
          .concat([{ id: "nobody", label: "No one — this was not a murder" }]),
        method: CASE.options.method,
        motive: CASE.options.motive,
        say:
          "An accusation is three things. Who. How — oleander, the cold, a fall, or smothering. And why — authorship, money, to keep something hidden, or an old grudge.",
      };
    },

    /**
     * Stage an accusation. Nothing is graded here. The guess sits on the table
     * until the player says it back, which keeps a misheard name from ending
     * the game.
     */
    proposeAccusation({ culprit, method, motive }) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, say: "There is nothing left to accuse." };
      }
      const missing = [];
      if (!CASE.options.culprit.includes(culprit)) missing.push("who");
      if (!CASE.options.method.some((m) => m.id === method)) missing.push("how");
      if (!CASE.options.motive.some((m) => m.id === motive)) missing.push("why");
      if (missing.length) {
        return {
          ok: false,
          missing,
          say: `I did not catch the ${listSpoken(missing)}. Say it as one sentence: I accuse Tobias, by oleander, over authorship.`,
        };
      }

      state.pending = {
        culprit,
        method,
        motive,
        readable: {
          culprit: readable("culprit", culprit),
          method: readable("method", method),
          motive: readable("motive", motive),
        },
      };
      emit();

      const r = state.pending.readable;
      return {
        ok: true,
        staged: r,
        awaiting: "spoken_confirmation",
        say: `You are accusing ${r.culprit}, by ${r.method}, over ${r.motive}. The police are twenty minutes out. Say yes to put it on the record, or no to take it back.`,
      };
    },

    withdrawAccusation() {
      const had = Boolean(state.pending);
      state.pending = null;
      emit();
      return {
        ok: true,
        say: had ? "Taken back. Nothing has been said out loud." : "Nothing was on the table.",
      };
    },

    /**
     * The only route to the answer, and it is one-way: a guess goes out, a mark
     * comes back. Async because in the browser the marker is on the server.
     */
    async confirmAccusation() {
      if (!state.pending) return { ok: false, say: "Nothing is on the table." };
      const a = state.pending;

      let result;
      try {
        result = await grade({
          culprit: a.culprit,
          method: a.method,
          motive: a.motive,
        });
      } catch (err) {
        // Leave the accusation on the table: the player has not been answered,
        // and clearing it would silently cost them their guess.
        return {
          ok: false,
          error: err.message,
          say: "I could not reach the case file to check that. Your accusation is still on the table. Say yes again in a moment.",
        };
      }

      const { correct, parts, hint, epilogue } = result;

      state.verdict = { correct, parts, accused: a.readable, epilogue, hint };
      state.pending = null;
      state.phase = PHASES.VERDICT;
      if (!correct) state.wrongAttempts += 1;
      emit();

      const right = [parts.culprit, parts.method, parts.motive].filter(Boolean).length;
      const scoreline = correct ? "All three." : `You had ${right} of the three.`;

      return {
        ok: true,
        correct,
        parts,
        say: correct
          ? `${scoreline} ${epilogue} The case is closed.`
          : `${scoreline} ${hint} The police are not here yet. Say reopen and keep working.`,
      };
    },

    reopen() {
      if (state.phase !== PHASES.VERDICT || state.verdict?.correct) {
        return { ok: false, say: "The case is closed." };
      }
      state.verdict = null;
      state.phase = PHASES.INVESTIGATION;
      emit();
      return {
        ok: true,
        phase: state.phase,
        say: `Back in the glass. ${state.questionsLeft} questions left.`,
      };
    },

    /** Only ever the text the grader already handed back on a correct guess. */
    solutionText() {
      if (state.phase !== PHASES.VERDICT || !state.verdict?.correct) {
        return { ok: false, say: "The case is not solved." };
      }
      return { ok: true, say: state.verdict.epilogue };
    },

    restart() {
      state.phase = PHASES.BRIEFING;
      state.examined = [];
      state.asked = [];
      state.notebook = [];
      state.questionsLeft = QUESTION_BUDGET;
      state.pending = null;
      state.verdict = null;
      emit();
      return { ok: true, say: "Back to the beginning. Say start when you are ready." };
    },
  };

  return api;
}

export { CASE };
