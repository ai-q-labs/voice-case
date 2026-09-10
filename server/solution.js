/**
 * The answer.
 *
 * 🔴 This file is never served to the browser. `server.js` mounts `public/` as
 * the only static root, and this directory is not under it. The page can reach
 * exactly one thing in here: `POST /api/verdict`, which takes a guess and
 * returns a grade.
 *
 * That is the whole trick, and it is worth being precise about what it buys:
 *
 *   - A player with devtools cannot read the culprit, because the bytes were
 *     never sent.
 *   - More to the point, a *language model* asked to run the table cannot read
 *     it either — not because it was told not to, but because the document it
 *     was handed does not contain it.
 *
 * Prompting a model to "not reveal the murderer" fails for the same reason
 * telling a person not to think of an elephant fails. The information is there.
 * The only durable version of this is the one where it isn't.
 */

export const SOLUTION = {
  culprit: "tobias",
  method: "oleander",
  motive: "credit",

  near_miss: {
    culprit:
      "Two things do not fit that person. Someone was in the north bed at quarter past one who has told you they were not on the station at all, and the hand in the ledger is the hand of someone who has spent a working life copying other people's writing.",
    method:
      "The cold was turned off again at ten past three and the man was warm when he was found. Look again at what was cut, and at what was rinsed and not rinsed.",
    motive:
      "Money and grudges were in that glasshouse in quantity and none of them moved that night. What moved was a letter, dated last Tuesday, with one name on it.",
  },

  epilogue: [
    "Tobias Renn does not argue.",
    "He tells it plainly, the way an archivist tells anything. The letter came on Tuesday. Four hundred pages of his grandmother's field observation, forty years of it, accepted under one name, and the name was not hers. He wrote to Finch. Finch wrote back that the archive was the property of the station and so, therefore, was its contents.",
    "So he did not leave at midnight. He took two oleander leaves from the bed by the orchid, worked them down with the plant syringe into the flask on the desk, rinsed the barrel, forgot the seal, and went to the north bed to steady himself. At quarter past one, out of nineteen years of habit, he wrote the round into the ledger, backward-sloping, in the hand he had learned from copying hers.",
    "The archive key he forced off the ring at half past three, after. Not to take anything. To put the notebooks back where she had kept them.",
    "The road opens at six. He is sitting in the vestibule with the tin of Iris Kwan's letters in his lap, waiting, and he has already written the whole of it out, twice, in a fair hand.",
  ].join(" "),
};

/**
 * Grade one accusation.
 *
 * Note what does not come back. On a miss the caller gets three booleans and
 * one hint — never the correct value of the part they got wrong. Somebody
 * probing this endpoint by brute force gets 4 × 4 × 4 = 64 tries, which is the
 * same number of guesses a player at the table has, and they have to say each
 * one out loud.
 *
 * @param {{culprit?: string, method?: string, motive?: string}} guess
 * @returns {{correct: boolean, parts: object, hint: string|null, epilogue: string|null}}
 */
export function grade(guess = {}) {
  const parts = {
    culprit: guess.culprit === SOLUTION.culprit,
    method: guess.method === SOLUTION.method,
    motive: guess.motive === SOLUTION.motive,
  };
  const correct = parts.culprit && parts.method && parts.motive;

  let hint = null;
  if (!correct) {
    if (!parts.culprit) hint = SOLUTION.near_miss.culprit;
    else if (!parts.method) hint = SOLUTION.near_miss.method;
    else hint = SOLUTION.near_miss.motive;
  }

  return {
    correct,
    parts,
    hint,
    epilogue: correct ? SOLUTION.epilogue : null,
  };
}
