/**
 * orgSig.vectors.ts — golden vectors shared by server, mobile and desktop.
 *
 * The SAME file lives in all three packages (golden rule #5: crypto parity).
 * Each package's `orgSig.test.ts` asserts its own implementation reproduces
 * these exact strings, so a change that only lands in one client — a different
 * key sort, a base32 alphabet, an extra newline in the signing bytes — fails
 * that package's suite instead of silently producing signatures the other two
 * reject at runtime.
 *
 * Every value below was produced by the implementation, then frozen. If a
 * legitimate wire-format change is needed, bump the prefix to `aegiswork/v2/`
 * and add v2 vectors beside these; never edit a v1 value to match new code.
 */

/** Ed25519 seed: bytes 1..32. Test org only — never a real key. */
export const ORG_SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

export const ORG_PUB_B64 = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';

/** base32(sha256(orgPubKey))[0:20] — PROTOCOL.md §2. */
export const ORG_ID = 'CPV0CWYPXP44QW0W5GH2';

/** 16 bytes of 0x07. */
export const NONCE = 'BwcHBwcHBwcHBwcHBwcHBw==';

export const EXP = 1_800_000_000_000;

export const ACTION = 'member.approve';

/**
 * Params chosen to pin every canonicalization rule at once: unsorted keys, an
 * array whose order must be PRESERVED (`teamIds`), an integer, a boolean and a
 * null.
 */
export const PARAMS = {
  aegisId: 'ABC-DEFG-HIJK',
  role: 'member',
  teamIds: ['t2', 't1'],
  retentionDays: 30,
  guest: false,
  note: null,
} as const;

/** canonicalJson of the full payload: keys sorted, array order kept. */
export const CANONICAL_PAYLOAD =
  '{"action":"member.approve","exp":1800000000000,"nonce":"BwcHBwcHBwcHBwcHBwcHBw==",' +
  '"orgId":"CPV0CWYPXP44QW0W5GH2","params":{"aegisId":"ABC-DEFG-HIJK","guest":false,' +
  '"note":null,"retentionDays":30,"role":"member","teamIds":["t2","t1"]}}';

/** `aegiswork/v1/<action>\n` + CANONICAL_PAYLOAD, as UTF-8. */
export const SIGNING_BYTES_LENGTH = 261;

export const SIGNATURE =
  'LRq03F5W6gUh7b8wom17WNHRYrsvJgcYlBRmQaPskfw81rW7tMgSA8BHsbmF3vFoHsmOVXEjp5fVvF0yoznWBw==';

/** Canonicalization cases every copy must agree on, independent of signing. */
export const CANONICAL_CASES: ReadonlyArray<{ label: string; value: unknown; expected: string }> = [
  { label: 'keys sorted by code unit', value: { b: 1, a: 2, A: 3, '0': 4 }, expected: '{"0":4,"A":3,"a":2,"b":1}' },
  { label: 'array order preserved', value: ['z', 'a', 'm'], expected: '["z","a","m"]' },
  { label: 'nested objects sorted at every level', value: { z: { y: 1, x: 2 } }, expected: '{"z":{"x":2,"y":1}}' },
  { label: 'empty object and array', value: { o: {}, a: [] }, expected: '{"a":[],"o":{}}' },
  { label: 'null survives (it is data, not absence)', value: { a: null }, expected: '{"a":null}' },
  { label: 'negative integers', value: { a: -42 }, expected: '{"a":-42}' },
  { label: 'zero', value: { a: 0 }, expected: '{"a":0}' },
  { label: 'unicode is not escaped beyond JSON rules', value: { a: 'día ✓' }, expected: '{"a":"día ✓"}' },
  {
    label: 'quotes and backslashes escaped',
    // A double quote and a real backslash, built from char codes so this
    // vector cannot be changed by an editor or a copy-paste that eats an
    // escape level — the whole point of a frozen vector.
    value: { a: `he said ${String.fromCharCode(34)}hi${String.fromCharCode(34)}${String.fromCharCode(92)}` },
    expected: `{"a":"he said ${String.fromCharCode(92, 34)}hi${String.fromCharCode(92, 34)}${String.fromCharCode(92, 92)}"}`,
  },
  {
    label: 'control characters escaped',
    value: { a: String.fromCharCode(10, 9, 0) },
    expected: `{"a":"${String.fromCharCode(92)}n${String.fromCharCode(92)}t${String.fromCharCode(92)}u0000"}`,
  },
];

/** Values that must be REFUSED rather than guessed (see canonicalJson header). */
export const CANONICAL_REJECTS: ReadonlyArray<{ label: string; value: unknown }> = [
  { label: 'float', value: { a: 1.5 } },
  { label: 'NaN', value: { a: NaN } },
  { label: 'Infinity', value: { a: Infinity } },
  { label: 'negative zero', value: { a: -0 } },
  { label: 'unsafe integer', value: { a: Number.MAX_SAFE_INTEGER + 2 } },
  { label: 'undefined', value: { a: undefined } },
  { label: 'Date (no agreed wire shape)', value: { a: new Date(0) } },
  { label: 'Map', value: { a: new Map() } },
  { label: 'bigint', value: { a: 1n } },
];
