/**
 * Voice Case — intent resolution.
 *
 * Turns a transcript into an engine call, with no language model in the path.
 *
 * That is a design constraint, not a cost saving. The moment a transcript is
 * sent to a model that also has the case file in context, the model knows the
 * answer, and every line it produces afterwards is written by something that
 * knows. Keeping this layer mechanical is what lets the game master narrate
 * without ever having been told who did it.
 *
 * The price is that it has to survive real speech-to-text. It does that with
 * three things: an alias table (the words a player actually says), a small
 * edit-distance tolerance (what the recogniser hears instead), and a rule that
 * a bare noun is a search — because in play, most utterances are.
 */

// ---- normalisation --------------------------------------------------------

const FILLER = new Set([
  "um", "uh", "er", "ah", "like", "please", "okay", "ok", "so", "well",
  "just", "now", "then", "hey", "hi", "the", "a", "an", "to", "at", "of",
  "my", "is", "are", "was", "were", "do", "does", "did",
]);

export function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text) {
  return normalise(text).split(" ").filter(Boolean);
}

// ---- fuzzy match ----------------------------------------------------------

/** Levenshtein, capped: we only ever care whether it is 0, 1 or 2. */
export function editDistance(a, b, cap = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best >= cap) return cap;
    prev = row;
  }
  return Math.min(prev[b.length], cap);
}

/**
 * How far off a word is allowed to be before we stop believing it.
 *
 * `cap` exists because commands and names need different slack. A name is
 * unfamiliar and gets mangled — "Tobias" comes back as "Tobius", two edits out,
 * and we want that. A command is a short everyday word said deliberately, and
 * giving it two edits makes "start" indistinguishable from "restart", which is
 * exactly the pair a player will hit on their second game.
 */
function tolerance(word, cap = 2) {
  if (word.length <= 4) return 0;
  if (word.length <= 6) return Math.min(1, cap);
  return Math.min(2, cap);
}

/**
 * Does any token in the utterance match any alias? Multi-word aliases are
 * matched as a contiguous run, so "north bed" cannot be satisfied by the two
 * words appearing at opposite ends of a sentence.
 */
function findAlias(toks, aliases, cap = 2) {
  for (const alias of aliases) {
    const parts = alias.split(" ");
    if (parts.length === 1) {
      for (let i = 0; i < toks.length; i += 1) {
        if (editDistance(toks[i], alias) <= tolerance(alias, cap)) return { at: i, alias };
      }
    } else {
      for (let i = 0; i + parts.length <= toks.length; i += 1) {
        const ok = parts.every(
          (p, k) => editDistance(toks[i + k], p) <= tolerance(p, cap),
        );
        if (ok) return { at: i, alias };
      }
    }
  }
  return null;
}

// ---- vocabulary -----------------------------------------------------------
// Aliases are the words a player says plus the words a recogniser produces
// instead. Everything here was chosen so that no two entries collide under the
// edit distance above.

export const SUSPECT_ALIASES = {
  vale: ["vale", "marguerite", "veil", "vail", "the botanist", "botanist"],
  desmond: ["desmond", "oyelaran", "the porter", "porter", "desmund"],
  iris: ["iris", "kwan", "the daughter", "irish"],
  tobias: ["tobias", "renn", "the archivist", "archivist", "toby", "tobias renn"],
};

export const OBJECT_ALIASES = {
  ledger: ["ledger", "watering ledger", "the book", "logbook", "ledgers"],
  thermostat: ["thermostat", "the dial", "temperature", "the heating", "heating"],
  boots: ["boots", "the boots", "muddy boots", "boot", "shoes"],
  syringe: ["syringe", "the syringe", "plant syringe", "syringes"],
  letter: ["letter", "torn letter", "the paper", "journal letter", "letters"],
  keys: ["keys", "keyring", "key ring", "the ring", "keychain"],
  orchid: ["orchid", "oleander plant", "the flower", "flower", "orchids"],
};

export const TOPIC_ALIASES = {
  night: ["night", "where they were", "alibi", "last night", "that night", "movements"],
  finch: ["finch", "the director", "director", "halloway", "the victim", "victim"],
  ledger: ["ledger", "watering ledger", "logbook"],
  thermostat: ["thermostat", "the cold", "temperature", "heating"],
  boots: ["boots", "the mud", "mud", "north bed"],
  letter: ["letter", "the paper", "the journal", "journal", "notebooks", "publication"],
  keys: ["keys", "keyring", "key ring", "archive key", "archive"],
  orchid: ["orchid", "oleander", "the plants", "plants"],
};

export const METHOD_ALIASES = {
  oleander: ["oleander", "poison", "poisoned", "the flask", "flask", "oleander"],
  frost: ["frost", "cold", "the cold", "freezing", "froze", "thermostat", "hypothermia"],
  fall: ["fall", "fell", "pushed", "push", "the catwalk", "catwalk"],
  smother: ["smother", "smothered", "suffocated", "suffocation", "smothering"],
};

export const MOTIVE_ALIASES = {
  credit: ["credit", "authorship", "the paper", "recognition", "his name", "plagiarism"],
  money: ["money", "the endowment", "endowment", "the land", "inheritance", "funding"],
  silence: ["silence", "to keep it quiet", "cover up", "coverup", "hiding", "secret"],
  revenge: ["revenge", "a grudge", "grudge", "hatred", "spite", "old score"],
};

const VERBS = {
  examine: ["search", "examine", "look at", "inspect", "check", "look", "find", "study"],
  ask: ["ask", "question", "interrogate", "talk to", "speak to", "press"],
  notebook: ["notebook", "recap", "what have i got", "what do i have", "summarise", "summarize", "review", "notes"],
  suspects: ["who is here", "suspects", "who are they", "list the suspects", "everyone"],
  searchable: ["what is left", "what can i search", "what is here", "room"],
  topics: ["what will", "what can i ask", "topics"],
  accuse: ["accuse", "i accuse", "it was", "the killer is", "i name", "arrest"],
  begin: ["start", "begin", "let us begin", "go"],
  reopen: ["reopen", "keep going", "carry on", "continue"],
  restart: ["restart", "new game", "start over", "start again", "from the top"],
  // No bare "what": it swallows "what have I got" and "what is left".
  repeat: ["repeat", "say that again", "again", "pardon", "come again"],
  help: ["help", "what can i say", "how do i play", "rules"],
  options: ["options", "what are my choices", "how does an accusation work"],
  yes: ["yes", "yeah", "yep", "confirm", "correct", "that is right", "do it"],
  no: ["no", "nope", "take it back", "withdraw", "cancel", "not that"],
  quiet: ["stop", "be quiet", "shut up", "silence yourself", "enough"],
};

/** Commands get one edit of slack, not two. See `tolerance`. */
function hasVerb(toks, key) {
  return Boolean(findAlias(toks, VERBS[key], 1));
}

// ---- the resolver ---------------------------------------------------------

/**
 * @returns {{kind: string, ...}} an intent the app can dispatch. `kind` is
 * always set; `unknown` carries the transcript back so the game master can say
 * it did not understand rather than guessing.
 */
export function resolve(transcript, ctx = {}) {
  const toks = tokens(transcript);
  if (toks.length === 0) return { kind: "unknown", transcript };

  const meaningful = toks.filter((t) => !FILLER.has(t));

  // A pending accusation turns the room into a yes/no question. Check this
  // first: "no" during a normal turn means something else entirely.
  if (ctx.pending) {
    if (hasVerb(toks, "yes")) return { kind: "confirm" };
    if (hasVerb(toks, "no")) return { kind: "withdraw" };
  }

  if (hasVerb(toks, "quiet")) return { kind: "quiet" };
  if (hasVerb(toks, "repeat")) return { kind: "repeat" };
  if (hasVerb(toks, "help")) return { kind: "help" };
  // Restart first: "start over" is the specific reading of an utterance that
  // also contains the word begin answers to.
  if (hasVerb(toks, "restart")) return { kind: "restart" };
  if (hasVerb(toks, "begin")) return { kind: "begin" };
  if (hasVerb(toks, "reopen")) return { kind: "reopen" };
  if (hasVerb(toks, "options")) return { kind: "options" };
  if (hasVerb(toks, "notebook")) return { kind: "notebook" };
  if (hasVerb(toks, "suspects")) return { kind: "suspects" };
  if (hasVerb(toks, "searchable")) return { kind: "searchable" };

  const suspect = matchOne(toks, SUSPECT_ALIASES);
  const object = matchOne(toks, OBJECT_ALIASES);

  // ---- accusation --------------------------------------------------------
  const method = matchOne(toks, METHOD_ALIASES);
  const motive = matchOne(toks, MOTIVE_ALIASES);
  const nobody = matchNobody(toks);

  // Three slots filled is an accusation whether or not the verb survived.
  //
  // This is not defensive coding, it is a measured failure. Streaming the
  // sentence "I accuse Tobias by oleander over authorship" came back as
  // "Hi, I'm Tobias by Oleander Over Authorship" — every entity intact, the
  // verb gone. Requiring the verb would have read that as a question for
  // Tobias and quietly eaten the player's ending.
  const slots = (suspect || nobody ? 1 : 0) + (method ? 1 : 0) + (motive ? 1 : 0);

  if (hasVerb(toks, "accuse") || slots === 3) {
    return {
      kind: "accuse",
      culprit: nobody ? "nobody" : suspect,
      method,
      motive,
    };
  }

  // ---- questions ---------------------------------------------------------
  if (suspect && hasVerb(toks, "topics")) {
    return { kind: "topics", suspect };
  }

  if (suspect) {
    // "ask Tobias about the ledger", but also the way people actually talk:
    // "Tobias, where were you last night" — a suspect plus anything else is a
    // question to that suspect.
    const topic = matchTopic(toks, suspect);
    if (hasVerb(toks, "ask") || topic || meaningful.length > 1) {
      return { kind: "ask", suspect, topic: topic || "night" };
    }
    return { kind: "topics", suspect };
  }

  // ---- searching ---------------------------------------------------------
  if (object) return { kind: "examine", object };

  if (hasVerb(toks, "yes")) return { kind: "confirm" };
  if (hasVerb(toks, "no")) return { kind: "withdraw" };
  if (hasVerb(toks, "examine")) return { kind: "searchable" };
  if (hasVerb(toks, "ask")) return { kind: "suspects" };

  return { kind: "unknown", transcript };
}

function matchOne(toks, table) {
  let best = null;
  for (const [id, aliases] of Object.entries(table)) {
    const hit = findAlias(toks, aliases);
    // Earliest mention wins: "ask Iris about Tobias" is a question for Iris.
    if (hit && (best === null || hit.at < best.at)) best = { id, at: hit.at };
  }
  return best ? best.id : null;
}

function matchNobody(toks) {
  return Boolean(
    findAlias(toks, ["nobody", "no one", "noone", "not a murder", "no murder"]),
  );
}

/**
 * Topic matching is scoped so that the suspect's own name cannot become the
 * topic: "ask Tobias about Tobias" resolves to his default, not a loop.
 */
function matchTopic(toks, suspectId) {
  let best = null;
  for (const [id, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (id === suspectId) continue;
    const hit = findAlias(toks, aliases);
    if (hit && (best === null || hit.at < best.at)) best = { id, at: hit.at };
  }
  return best ? best.id : null;
}
