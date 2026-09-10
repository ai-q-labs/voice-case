/**
 * The browser's only route to the answer.
 *
 * Note the shape of the traffic: a guess goes out, a mark comes back. There is
 * no endpoint that returns the case solution, so there is nothing to call in a
 * different order to get it.
 */

export function httpGrader(url = "./api/verdict") {
  return async function grade(guess) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(guess),
    });
    if (!res.ok) {
      throw new Error(`The case file did not answer (${res.status}).`);
    }
    return res.json();
  };
}
