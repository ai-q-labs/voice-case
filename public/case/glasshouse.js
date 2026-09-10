/**
 * The Glasshouse, 03:40 — case material, minus the answer.
 *
 * 🔴 There is no `solution` key in this file, and there is not meant to be.
 *
 * The culprit, the method, the motive, the near-miss hints and the epilogue
 * live in `server/solution.js`, which is never served to the browser. Open
 * devtools, read every byte the page downloaded, and the answer is not among
 * them — it is not obfuscated, it is absent.
 *
 * Written for voice. Every id a player has to say out loud is a single common
 * word, and no two of them rhyme — "ledger / thermostat / boots / syringe /
 * letter / keys / orchid", "Vale / Desmond / Iris / Tobias". This is not
 * decoration; it is what makes rule-based intent resolution possible without
 * sending the transcript to a language model.
 */

export const CASE = {
  title: "The Glasshouse, 03:40",
  subtitle: "Aldermoor Botanical Station, the long greenhouse",

  briefing: [
    "It is twenty past four in the morning at the Aldermoor Botanical Station.",
    "Doctor Halloway Finch, the director, is dead on the gravel path between the fern beds. His flask is beside him, still warm.",
    "The storm took the road out at midnight. Four people were inside the glass when it happened, and the police cannot reach you until six.",
    "You have until then. Search the room, question the four, and when you are ready, name the killer, the method and the reason.",
  ].join(" "),

  victim: {
    name: "Dr Halloway Finch",
    age: 61,
    role: "Director of the station for nineteen years",
    found: "Face down on the gravel between the fern beds, at 03:40.",
  },

  suspects: [
    {
      id: "vale",
      name: "Marguerite Vale",
      spoken: "Vale",
      age: 44,
      role: "Senior botanist. Keeps the propagation house.",
      visible:
        "Says she was in the propagation house until half past three, alone with the seedlings.",
    },
    {
      id: "desmond",
      name: "Desmond Oyelaran",
      spoken: "Desmond",
      age: 29,
      role: "Night porter. Holds the outer keys.",
      visible:
        "Says he walked the perimeter twice and found the body on the second round.",
    },
    {
      id: "iris",
      name: "Iris Kwan",
      spoken: "Iris",
      age: 35,
      role: "Daughter of the station's benefactor. Sits on the board.",
      visible:
        "Says she was asleep in the guest wing and came out when Desmond shouted.",
    },
    {
      id: "tobias",
      name: "Tobias Renn",
      spoken: "Tobias",
      age: 52,
      role: "Archivist. Keeps the field notebooks.",
      visible: "Says he left the station at midnight, before the road went.",
    },
  ],

  objects: {
    ledger: {
      label: "the watering ledger",
      where: "on the potting bench by the door",
      reveals:
        "A ruled book, one line per round. The last line reads: oh one fifteen, north bed, damp. The hand is small and backward-sloping, and it is not the same hand as the lines above it.",
      note: "Watering ledger: final entry at 01:15, written in an unfamiliar backward-sloping hand.",
    },
    thermostat: {
      label: "the glasshouse thermostat",
      where: "on the central post, under a wire cage",
      reveals:
        "A dial with a paper log clipped beside it. Someone dropped it to four degrees at two o'clock and put it back to twenty-one at ten past three. The log is initialled M V.",
      note: "Thermostat: dropped to 4C at 02:00, restored to 21C at 03:10. Log initialled M V.",
    },
    boots: {
      label: "a pair of muddy boots",
      where: "kicked off inside the vestibule",
      reveals:
        "Small boots, still wet. The mud on them is the red clay of the north bed, not the grey path. Whoever wore them was digging, not walking.",
      note: "Muddy boots in the vestibule: small size, red clay from the north bed.",
    },
    syringe: {
      label: "a plant syringe",
      where: "in the sink at the far end, rinsed",
      reveals:
        "The barrel is clean. The rubber of the plunger is not. There is a thin green stain worked into the seal, and it smells faintly of cut grass and almonds.",
      note: "Plant syringe, rinsed but with green residue in the plunger seal.",
    },
    letter: {
      label: "a torn letter",
      where: "in the waste tin beside the desk",
      reveals:
        "Four pieces of a journal's letter, dated last Tuesday. It accepts for publication a paper titled The Aldermoor Notebooks, and it names one author: Halloway Finch.",
      note: "Torn journal letter: a paper called The Aldermoor Notebooks accepted, sole author Finch.",
    },
    keys: {
      label: "the director's keyring",
      where: "still clipped to the dead man's belt",
      reveals:
        "Nine keys on a steel ring. The tenth position is empty and the split ring is bent open. The gap is the size of the long brass key that opens the archive.",
      note: "Director's keyring: the archive key has been forced off the ring.",
    },
    orchid: {
      label: "the prize orchid",
      where: "under glass at the head of the centre aisle",
      reveals:
        "The orchid is untouched. The oleander planted beside it for contrast is not: two leaves have been taken off close to the stem with a clean blade.",
      note: "Prize orchid untouched, but two oleander leaves cut from the plant beside it.",
    },
  },

  interviews: {
    vale: {
      thermostat:
        "Yes, that was me. There is a seed tray in there that will not break dormancy above five degrees, and I had one hour to give it. I put the heat back the moment it was done.",
      finch:
        "He was a good administrator and a poor scientist, and he had stopped pretending otherwise. That is not a reason to kill a man. It is a reason to leave, and I had already given notice.",
      orchid:
        "The oleander beside it is mine. I keep it for the contrast in leaf form when the students come. I have not cut it. I would have noticed.",
      night:
        "Propagation house, from about eleven until half past three. Alone. There is no one who can say otherwise and I am aware of how that sounds.",
    },
    desmond: {
      night:
        "Two rounds. Half past one, and half past three. On the first round the path was empty. On the second he was on it.",
      keys:
        "The outer keys are mine. The inner keys, the archive, the seed store, those are his and only his. He would not even let me hold the ring while he unlocked a door.",
      ledger:
        "The ledger is for whoever waters. I do not water. If there is a line in it at quarter past one, then somebody was in the north bed at quarter past one, and it was not me, because at quarter past one I was at the gate.",
      finch:
        "He paid on time and he never once learned my name. I am not going to stand here and grieve for him and I am not going to pretend I hurt him.",
    },
    iris: {
      night:
        "I was asleep. I woke when Desmond shouted. That is all there is and I know it is not much.",
      boots:
        "Those are mine. I went out to the north bed at one, in the rain, and I dug up a tin my mother buried there in nineteen ninety-four, because the board is going to sell this land in March and I was not going to leave it in the ground. Ask me what is in the tin. It is letters.",
      finch:
        "He needed my family's money and he never let me forget that he needed it. I disliked him. Half the county disliked him.",
      letter:
        "I have not seen any letter. If a journal has taken a paper of his, that is the first I have heard of it, and I sit on the board.",
    },
    tobias: {
      night: "I left at midnight. Before the road went.",
      ledger:
        "That is not my hand. I do not know whose hand that is. I write forward, like everyone.",
      letter:
        "The Aldermoor Notebooks are four hundred pages of field observation in my grandmother's hand. She died in the archive in this station, unpaid, and she is not named on that letter. I am the archivist. I know what is in my own archive.",
      keys:
        "Why would I need his archive key. I have my own. I have had my own for eleven years.",
      finch:
        "You are asking me whether I am sorry. I am not going to lie to you at four in the morning.",
    },
  },

  no_comment: {
    vale: "She looks at the seedlings and does not answer that.",
    desmond: "He shakes his head. Not that. Ask me something I would know.",
    iris: "She folds her arms. I have nothing to say about that.",
    tobias: "He says nothing at all, for long enough that you move on.",
  },

  topics: {
    night: "where they were during the night",
    finch: "the director",
    ledger: "the watering ledger",
    thermostat: "the thermostat",
    boots: "the muddy boots",
    letter: "the torn letter",
    keys: "the keyring",
    orchid: "the orchid and the oleander",
  },

  options: {
    culprit: ["vale", "desmond", "iris", "tobias", "nobody"],
    method: [
      { id: "oleander", label: "oleander, worked into his flask" },
      { id: "frost", label: "the cold, by way of the thermostat" },
      { id: "fall", label: "a fall from the catwalk" },
      { id: "smother", label: "smothering" },
    ],
    motive: [
      { id: "credit", label: "authorship — whose name goes on the work" },
      { id: "money", label: "money — the endowment and the sale of the land" },
      { id: "silence", label: "to keep something hidden" },
      { id: "revenge", label: "an old grudge" },
    ],
  },

};
