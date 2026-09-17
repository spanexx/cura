/**
 * Local generator for realistic Ryanair customer-support training cases.
 *
 * Replaces the hard-coded INITIAL_SCENARIOS list: every case is assembled at
 * runtime from Ryanair-grounded archetypes (each traceable to the app's own
 * SOP notes or published policy) combined with randomized passengers, routes,
 * flight numbers, PNRs and figures, so two clicks never produce the same case.
 *
 * Also serves as the offline fallback when AI scenario generation fails.
 */

const rand = {
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  int: (min, max) => min + Math.floor(Math.random() * (max - min + 1))
};

// Ryanair-style PNR: 6 chars, no 0/O or 1/I to avoid misreading.
const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makePnr = () =>
  Array.from({ length: 6 }, () => PNR_ALPHABET[rand.int(0, PNR_ALPHABET.length - 1)]).join('');

// Real Ryanair bases and popular destinations (IATA + spoken city names).
const BASES = [
  ['DUB', 'Dublin'], ['STN', 'London Stansted'], ['BGY', 'Milan Bergamo'],
  ['CRL', 'Brussels South'], ['BCN', 'Barcelona'], ['MAD', 'Madrid'],
  ['BVA', 'Paris Beauvais'], ['WMI', 'Warsaw Modlin'], ['KRK', 'Krakow'],
  ['FMM', 'Munich West'], ['OPO', 'Porto'], ['EDI', 'Edinburgh']
];

const DESTS = [
  ['AGP', 'Malaga'], ['ALC', 'Alicante'], ['FAO', 'Faro'], ['PMI', 'Palma'],
  ['IBZ', 'Ibiza'], ['TFS', 'Tenerife South'], ['LPA', 'Gran Canaria'],
  ['ATH', 'Athens'], ['VCE', 'Venice'], ['NCE', 'Nice'], ['PRG', 'Prague'], ['FCO', 'Rome Fiumicino']
];

// Names drawn from Ryanair's biggest markets, mixed and matched for variety.
const NAMES = [
  { country: 'Ireland', firsts: ['Sean', 'Aoife', 'Cian', 'Niamh', 'Orla', 'Declan', 'Saoirse', 'Eoin'], lasts: ['Byrne', 'Kelly', 'Murphy', 'Walsh', "O'Brien", 'Doyle', 'Ryan', 'Fitzgerald'] },
  { country: 'the UK', firsts: ['Harry', 'Gemma', 'Oliver', 'Freya', 'Jack', 'Maisie'], lasts: ['Clarke', 'Whitfield', 'Nash', 'Bolton', 'Hollis', 'Turner'] },
  { country: 'Poland', firsts: ['Katarzyna', 'Piotr', 'Agnieszka', 'Tomasz', 'Marta'], lasts: ['Nowak', 'Kowalski', 'Wisniewska', 'Zielinski', 'Lewandowska'] },
  { country: 'Italy', firsts: ['Giulia', 'Luca', 'Chiara', 'Andrea', 'Martina'], lasts: ['Ferrari', 'Moretti', 'Esposito', 'Ricci', 'Colombo'] },
  { country: 'Spain', firsts: ['Carmen', 'Javier', 'Lucia', 'Sergio', 'Paula'], lasts: ['Ruiz', 'Ortega', 'Navarro', 'Ibanez', 'Serrano'] },
  { country: 'Portugal', firsts: ['Ines', 'Bruno', 'Rui', 'Sofia', 'Tiago'], lasts: ['Carvalho', 'Fernandes', 'Almeida', 'Pereira', 'Mendes'] },
  { country: 'Germany', firsts: ['Lena', 'Jonas', 'Petra', 'Felix', 'Anna'], lasts: ['Hoffmann', 'Becker', 'Schneider', 'Wagner', 'Kruger'] },
  { country: 'France', firsts: ['Amelie', 'Hugo', 'Camille', 'Theo', 'Manon'], lasts: ['Laurent', 'Marchand', 'Dubois', 'Girard', 'Moreau'] },
  { country: 'Romania', firsts: ['Andrei', 'Elena', 'Vlad', 'Ioana', 'Mihai'], lasts: ['Popescu', 'Ionescu', 'Dumitrescu', 'Stan', 'Marin'] }
];

// Small plausible typos: c->k, s->z, i->y, and one-vowel swaps.
const TYPO_MAP = { c: 'k', s: 'z', i: 'y', e: 'a', a: 'e', o: 'u' };

const makeTypoName = (fullName) => {
  const chars = fullName.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const lower = chars[i].toLowerCase();
    if (TYPO_MAP[lower]) {
      chars[i] = lower === chars[i] ? TYPO_MAP[lower] : TYPO_MAP[lower].toUpperCase();
      return chars.join('');
    }
  }
  return fullName + 'n';
};

const makeContext = () => {
  const pool = rand.pick(NAMES);
  const first = rand.pick(pool.firsts);
  const last = rand.pick(pool.lasts);
  const [origin, originCity] = rand.pick(BASES);
  const [dest, destCity] = rand.pick(DESTS);
  const flightNo = 'FR' + rand.int(10, 8899);
  return {
    first,
    last,
    country: pool.country,
    passenger: first + ' ' + last,
    typoName: makeTypoName(first + ' ' + last),
    pnr: makePnr(),
    flightNo,
    origin,
    originCity,
    dest,
    destCity,
    flight: flightNo + ' (' + origin + ' -> ' + dest + ')'
  };
};

// @@ARCHETYPES@@

const ARCHETYPES_A = [
  {
    category: 'Name Correction (24h Grace)',
    difficulty: 'Easy',
    variants: [
      (c) => {
        const hours = rand.int(2, 20);
        return {
          title: 'Name Typo Within 24 Hours',
          details: 'Customer booked ' + hours + ' hours ago and spotted the surname is spelled "' + c.typoName + '" instead of "' + c.passenger + '". Wants it fixed for free and fears the EUR 115 name-change fee.',
          promptScenario: 'You are ' + c.passenger + ', booked on ' + c.flight + '. You booked ' + hours + ' hours ago and just noticed your name is misspelled "' + c.typoName + '" instead of "' + c.passenger + '". You are anxious about expensive name-change fees. If the agent calmly explains the free 24-hour self-service correction (up to 3 characters, done in the Ryanair app or website), you follow their instructions and calm down.'
        };
      },
      (c) => ({
        title: 'Autocorrect Ruined My Booking',
        details: 'Autocorrect turned "' + c.passenger + '" into "' + c.typoName + '" at checkout two hours ago. Customer demands the agent "just fix it in the system" rather than doing it themselves.',
        promptScenario: 'You are ' + c.passenger + ". Your phone's autocorrect mangled your name to \"" + c.typoName + '" when you booked ' + c.flight + ' two hours ago. You want the agent to edit the booking for you right now and get impatient if pushed to self-service - but you accept it once they explain the free 24-hour correction and offer step-by-step app guidance.'
      })
    ]
  },
  {
    category: 'Gate Bag Fee Dispute',
    difficulty: 'Hard',
    variants: [
      (c) => {
        const fee = rand.pick([60, 65, 70]);
        return {
          title: 'Charged EUR ' + fee + ' at the Gate',
          details: 'Customer was charged EUR ' + fee + ' at the ' + c.originCity + ' gate for a small backpack they insist fitted the 40x20x25cm sizer. Flight departs in ' + rand.int(45, 90) + ' minutes and they demand the fee refunded before boarding.',
          promptScenario: 'You are ' + c.passenger + ' at ' + c.originCity + ' airport about to board ' + c.flight + '. Gate staff charged you EUR ' + fee + ' because they said your backpack exceeded the personal-bag size, but you are certain it fit the sizer. You are furious, demand an immediate EUR ' + fee + ' refund, and keep repeating that you have photos of the bag in the sizer. You accept a refund-claim path only if the agent explains exactly how to file it.'
        };
      },
      (c) => ({
        title: 'Cabin Bag Gate-Checked Despite Booking',
        details: 'Customer paid for Priority & 10kg cabin bag but at ' + c.originCity + ' the bag was gate-checked and they were charged EUR 70 anyway. Boarding pass shows no priority marker. Wants the charge reversed.',
        promptScenario: 'You are ' + c.passenger + ' flying ' + c.flight + '. You paid for Priority with a 10kg cabin bag, yet at the gate your bag was taken off you and you were charged EUR 70, and your boarding pass shows Standard boarding. You feel cheated and want the EUR 70 back and your priority restored or refunded. You respond well to a clear explanation of what likely happened and a concrete refund route.'
      })
    ]
  }
];

const ARCHETYPES_B = [
  {
    category: 'EU261 Delay Compensation',
    difficulty: 'Hard',
    variants: [
      (c) => {
        const mins = rand.pick([185, 200, 215, 230]);
        return {
          title: 'Delayed ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm - Demands EUR 400',
          details: 'Flight ' + c.flightNo + ' ' + c.origin + '->' + c.dest + ' yesterday arrived ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm late. Ryanair cited weather at ' + c.destCity + '. Customer demands EUR 400 EU261 compensation and rejects "extraordinary circumstances".',
          promptScenario: 'You are ' + c.passenger + '. Yesterday ' + c.flight + ' landed ' + Math.floor(mins / 60) + ' hours ' + (mins % 60) + ' minutes late and you missed half a day of your holiday. You read online that over 3 hours means EUR 250-600 and you demand EUR 400 now. You are sceptical of the "extraordinary circumstances" argument and push back, but you accept the outcome if the agent explains weather exemptions and points you to the official complaint form.'
        };
      },
      (c) => {
        const mins = rand.pick([190, 205, 225]);
        return {
          title: 'Knock-On Delay - No Vouchers Given',
          details: 'Arriving aircraft landed late, so ' + c.flightNo + ' departed ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm late. No food vouchers were offered during the wait. Customer claims EUR 250 compensation plus receipts for EUR ' + rand.int(15, 35) + ' spent on food.',
          promptScenario: 'You are ' + c.passenger + ' on ' + c.flight + '. Because the inbound aircraft arrived late, your flight left ' + Math.floor(mins / 60) + ' hours ' + (mins % 60) + ' minutes late and nobody offered water or vouchers at the gate. You want EUR 250 compensation and reimbursement of your meal receipts. You are reasonable but persistent, and you expect the agent to acknowledge the missing right-to-care, not just the delay.'
        };
      }
    ]
  },
  {
    category: 'Airport Check-in Fee',
    difficulty: 'Medium',
    variants: [
      (c) => ({
        title: 'EUR 55 Airport Check-in Surprise',
        details: 'Customer went straight to the ' + c.originCity + ' desk without checking in online and was charged EUR 55 per passenger. Claims they were never told online check-in opens 24h before departure. Flight leaves in two hours.',
        promptScenario: 'You are ' + c.passenger + ', flying ' + c.flight + ' today. At the airport you were charged EUR 55 because you never checked in online - you say nobody told you and the confirmation email looked like spam. You demand a refund. You grumble about self-service but accept it if the agent explains the rule clearly and shows you where the free online check-in window is in the app for your return flight.'
      }),
      (c) => ({
        title: 'App Crashed, Charged EUR 55 Anyway',
        details: 'App errored during online check-in (screenshot provided). Next day at ' + c.originCity + ' the customer was charged the EUR 55 airport fee. Demands a refund citing the technical fault and proof they tried self-service.',
        promptScenario: 'You are ' + c.passenger + '. The Ryanair app crashed with error "PR-17" while you tried online check-in for ' + c.flight + ' - you have a screenshot. The next morning the airport desk charged you EUR 55. You want that refunded because you did try to self-serve. You are polite but firm and expect the agent to ask for your screenshot rather than refuse outright.'
      })
    ]
  }
];

const ARCHETYPES_C = [
  {
    category: 'Priority Boarding Not Honoured',
    difficulty: 'Easy',
    variants: [
      (c) => ({
        title: 'Paid for Priority, Pass Says Standard',
        details: 'Customer bought Priority & 2 Cabin Bags for ' + c.flight + ', but the app boarding pass shows Standard boarding and only the free small bag. Wants it fixed before leaving for ' + c.originCity + '.',
        promptScenario: 'You are ' + c.passenger + '. You paid extra for Priority & 2 Cabin Bags on ' + c.flight + ', but your app boarding pass says Standard and shows no cabin bag allowance. You are leaving for ' + c.originCity + ' tomorrow and worried about paying again at the gate. You want it fixed or refunded and respond well to a clear step-by-step fix in the app plus confirmation email advice.'
      }),
      (c) => ({
        title: 'Priority Missing for One of Two Passengers',
        details: 'Two passengers on booking ' + c.pnr + ': only one shows Priority on ' + c.flightNo + '. Receipt shows a single EUR 8 priority charge, so the customer insists both were paid for. Wants the second boarding pass corrected.',
        promptScenario: 'You are ' + c.passenger + ', booked on ' + c.flight + ' with your partner. Only one of the two boarding passes shows Priority, yet you are sure you paid for both. You want the second pass corrected before the flight. You get suspicious that this is a scam, calm down when the agent checks the receipt with you, and accept either a fix or a refund of one priority fee.'
      })
    ]
  },
  {
    category: 'Infant & Family Policy',
    difficulty: 'Easy',
    variants: [
      (c) => ({
        title: 'Travelling With a 9-Month-Old',
        details: 'Passenger flying ' + c.flight + ' with a 9-month-old wants to confirm the free baby bag allowance and whether the pushchair goes to the gate or the hold.',
        promptScenario: 'You are ' + c.passenger + ', flying ' + c.flight + ' next week with a 9-month-old. You want to confirm: is there a free baby bag on top of your own allowance, and can you take the pushchair to the gate? You are a nervous first-time flyer with a baby and appreciate clear, step-by-step answers; you book the add-ons the agent recommends if they explain them simply.'
      }),
      (c) => ({
        title: 'Infant Name Wrong on Add-on',
        details: 'Added the infant to booking ' + c.pnr + ' but typed the baby surname wrong. Worried the infant will be denied boarding on ' + c.flightNo + ' and asking how a name fix works for a 7-month-old.',
        promptScenario: 'You are ' + c.passenger + '. When you added your 7-month-old to booking ' + c.pnr + " you misspelled the baby's surname and now panic that the infant will be refused at the gate on " + c.flightNo + '. You ask how a name correction works for an infant and whether it costs anything. You calm down quickly when given the free-within-24h self-service route or an honest quote for the fix.'
      })
    ]
  }
];

const ARCHETYPES_D = [
  {
    category: 'Flight Change Within 24h',
    difficulty: 'Medium',
    variants: [
      (c) => ({
        title: 'Booked Tomorrow Instead of Next Week',
        details: 'Customer booked ' + c.flightNo + ' about ' + rand.int(1, 3) + ' hours ago for tomorrow by mistake - they meant next week. Wants the date moved with no change fee under the 24-hour grace policy.',
        promptScenario: 'You are ' + c.passenger + '. You booked ' + c.flight + ' a few hours ago for tomorrow, but you actually meant next week. You demand a free date change under the 24-hour grace period. You are flustered and defensive, but if the agent walks you through doing it yourself in the app (fare difference only within 24h), you go and do it.'
      }),
      (c) => ({
        title: 'Wrong Month on the Return Leg',
        details: 'Outbound on ' + c.flightNo + ' is correct, but the return was booked for the wrong month. Less than 24 hours since booking; customer wants the return date corrected cheaply and is worried the whole booking gets voided.',
        promptScenario: 'You are ' + c.passenger + '. Your outbound ' + c.flightNo + ' is fine, but you picked the wrong month for the return right after booking - you are still inside the 24-hour window. You want the return date fixed and you fear losing the whole booking. You calm down if the agent confirms the booking is safe and explains the within-24h change (fare difference only) in the app.'
      })
    ]
  },
  {
    category: 'Seat & Boarding Pass Mix-up',
    difficulty: 'Easy',
    variants: [
      (c) => ({
        title: 'Paid for a Window, Got a Middle Seat',
        details: 'Seat selection on ' + c.flightNo + ' shows a middle seat although the customer paid EUR ' + rand.int(8, 15) + ' for a window. Wants the seat swapped or the difference refunded before flying tomorrow.',
        promptScenario: 'You are ' + c.passenger + '. You paid for a window seat on ' + c.flight + ' but the app shows you a middle seat. You want it swapped or the difference refunded. You are annoyed but not hostile, and you accept either outcome once the agent explains what they can do and confirms it in writing.'
      }),
      (c) => ({
        title: 'Randomly Assigned Away From My Partner',
        details: 'Couple on booking ' + c.pnr + ' were auto-assigned seats rows apart on ' + c.flightNo + ' after declining paid selection. Traveling with a small child and wants to sit together without paying again.',
        promptScenario: 'You are ' + c.passenger + ', flying ' + c.flight + ' with your partner and a 4-year-old. You declined paid seat selection and were seated rows apart. You are upset about being split from your child and ask whether families are always seated together. You respond to a kind, factual explanation of how free family seating allocation works and what your options are.'
      })
    ]
  }
];

const ARCHETYPES_E = [
  {
    category: 'Excess Baggage Weight',
    difficulty: 'Medium',
    variants: [
      (c) => {
        const over = rand.int(2, 7);
        return {
          title: 'Checked Bag ' + over + 'kg Over the Limit',
          details: 'At ' + c.originCity + ' the 20kg checked bag came to ' + (20 + over) + 'kg. Customer was quoted EUR ' + (over * 12) + ' excess (EUR 12/kg). Claims the bathroom scale at home said 19kg and wants the fee waived.',
          promptScenario: 'You are ' + c.passenger + ' at ' + c.originCity + ' with a checked bag for ' + c.flight + " that weighed " + (20 + over) + 'kg at the desk - over the 20kg allowance. You were quoted EUR ' + (over * 12) + ' extra and you protest that your home scale said 19kg. You are annoyed but not abusive; you accept the fee if the agent explains the per-kg rule and warns you the return leg will weigh the same, and you appreciate tips to redistribute weight into cabin bags.'
        };
      },
      (c) => {
        const extra = rand.pick([5, 7, 10]);
        return {
          title: 'Family of Four, One Bag Overweight',
          details: 'Family pooling a ' + (20 + extra) + 'kg bag for ' + c.flightNo + ' were charged EUR ' + (extra * 12) + '. Insists the allowance is per booking, not per bag, and demands a refund.',
          promptScenario: 'You are ' + c.passenger + ', flying ' + c.flight + ' with your family. One shared checked bag weighed ' + (20 + extra) + 'kg and you were charged EUR ' + (extra * 12) + ' excess. You believe the 20kg allowance pools across the family booking and demand the money back. You calm down when the agent explains the allowance is per passenger and per bag, and you listen to advice on splitting the weight into the children\'s allowances next time.'
        };
      }
    ]
  },
  {
    category: 'Payment & Duplicate Charge',
    difficulty: 'Medium',
    variants: [
      (c) => {
        const amt = rand.pick([49, 55, 63]);
        return {
          title: 'Charged Twice, Refund Nowhere in Sight',
          details: 'Booking ' + c.pnr + ' was paid twice - two identical charges of EUR ' + amt + ' on different cards, only one ticket issued for ' + c.flightNo + '. Bank says contact the airline; customer wants the second charge refunded now.',
          promptScenario: 'You are ' + c.passenger + '. You were charged twice - EUR ' + amt + ' on each of two cards - for booking ' + c.pnr + ' (' + c.flight + '). Only one ticket was issued. Your bank told you to contact the airline and you are frustrated at being passed around. You want the duplicate refunded and the reference number for your records. You accept realistic timelines if the agent is straight with you.'
        };
      },
      (c) => ({
        title: 'Refund Promised a Fortnight Ago',
        details: 'A cancelled add-on on booking ' + c.pnr + ' was promised a refund of EUR ' + rand.int(18, 45) + ' about two weeks ago. Nothing on the card statement and no email. Customer is losing patience with the silence.',
        promptScenario: 'You are ' + c.passenger + '. Two weeks ago a EUR ' + rand.int(18, 45) + ' refund was promised for an add-on on booking ' + c.pnr + '. Nothing has appeared on your card and no email arrived. You are polite but losing patience and you want a real status, not an apology. You accept a clear explanation of refund processing times and a reference you can chase.'
      })
    ]
  }
];

const ARCHETYPES_F = [
  {
    category: 'Cancellation & Refunds',
    difficulty: 'Hard',
    variants: [
      (c) => ({
        title: 'Flight Cancelled, Demands Everything Back',
        details: 'Ryanair cancelled ' + c.flightNo + ' three days ago. Customer refused the free rebooking offered and wants the full fare back plus EUR ' + rand.int(150, 400) + ' for a rival airline ticket they already bought.',
        promptScenario: 'You are ' + c.passenger + '. Ryanair cancelled ' + c.flight + ' three days ago and you already bought a EUR ' + rand.int(150, 400) + ' ticket with another airline. You demand the full Ryanair fare refunded plus the difference. You are angry but factually well-prepared. You accept a calm explanation of what refunds are due and how to claim them, but you push back hard on anything that sounds like being fobbed off.'
      }),
      (c) => ({
        title: 'Grandparent Cancelled - Refund Goes Where?',
        details: 'Customer booked for their elderly parent on ' + c.flightNo + ' but the parent can no longer travel. Wants to know if the ticket is refundable, transferable, or if only taxes come back.',
        promptScenario: 'You are ' + c.passenger + '. You booked ' + c.flight + ' for your elderly mother, who can now no longer travel. You want to know whether the ticket is refundable, whether someone else can use it, or if anything comes back at all. You are anxious and out of your depth. You respond well to clear, jargon-free explanations of non-refundable fares versus tax refunds.'
      })
    ]
  },
  {
    category: 'App Error & Duplicate Add-on',
    difficulty: 'Easy',
    variants: [
      (c) => ({
        title: 'App Charged Twice for One Bag',
        details: 'Adding a 20kg checked bag to ' + c.pnr + ' glitched and charged EUR ' + rand.pick([25, 35]) + ' twice. The card statement shows two authorisations and the app shows one bag. Customer wants one charge reversed.',
        promptScenario: 'You are ' + c.passenger + '. Adding a checked bag to booking ' + c.pnr + ' charged your card twice (two identical amounts) but the app shows only one bag for ' + c.flightNo + '. You have both authorisations on your banking app and want one reversed. You are factual and expect the agent to acknowledge a real app fault and give you a reference for the reversal.'
      }),
      (c) => ({
        title: 'Bought Seats for the Wrong Flight',
        details: 'Customer paid for two reserved seats but attached them to the outbound leg only - they meant to buy them for the return on ' + c.flightNo + '. Wants them moved, not refunded.',
        promptScenario: 'You are ' + c.passenger + '. You bought two reserved seats but accidentally attached them to the wrong leg of booking ' + c.pnr + ' - the return flight ' + c.flightNo + ' has none. You want them moved, not refunded. You are mildly embarrassed and cooperative; you accept app-based self-service guidance once the agent confirms it is possible and free.'
      })
    ]
  }
];

const ARCHETYPES = [...ARCHETYPES_A, ...ARCHETYPES_B, ...ARCHETYPES_C, ...ARCHETYPES_D, ...ARCHETYPES_E, ...ARCHETYPES_F];

/** Issue categories for the AI generation prompt, in archetype order. */
const AIRLINE_CATEGORY_NAMES = ARCHETYPES.map((a) => a.category);

/**
 * Builds one random realistic case. `avoidCategories` / `avoidTitles` bias the
 * generator away from what was shown recently, so consecutive clicks differ.
 */
const generateAirlineCase = ({ avoidCategories = [], avoidTitles = [] } = {}) => {
  const recentCategories = new Set(avoidCategories);
  const recentTitles = new Set(avoidTitles);

  let pool = ARCHETYPES.filter((a) => !recentCategories.has(a.category));
  if (pool.length === 0) pool = ARCHETYPES;
  let archetype = rand.pick(pool);

  const context = makeContext();
  let built = archetype.variants.map((make) => make(context));
  // If every variant of the picked archetype was shown recently, swap to a
  // different archetype when one is available (title avoidance is strict-ish).
  if (recentTitles.size > 0 && built.every((s) => recentTitles.has(s.title)) && pool.length > 1) {
    archetype = rand.pick(pool.filter((a) => a !== archetype));
    built = archetype.variants.map((make) => make(context));
  }
  let variantPool = built;
  if (recentTitles.size > 0) {
    const fresh = built.filter((shape) => !recentTitles.has(shape.title));
    if (fresh.length > 0) variantPool = fresh;
  }
  const shape = rand.pick(variantPool);

  return {
    id: 'case_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
    title: shape.title,
    difficulty: archetype.difficulty,
    passenger: context.passenger,
    pnr: context.pnr,
    flight: context.flight,
    details: shape.details,
    promptScenario: shape.promptScenario,
    category: archetype.category
  };
};

export { ARCHETYPES, AIRLINE_CATEGORY_NAMES, generateAirlineCase };