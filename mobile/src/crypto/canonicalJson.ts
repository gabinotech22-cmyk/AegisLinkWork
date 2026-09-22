/**
 * canonicalJson.ts — deterministic JSON for signing (PROTOCOL.md §3).
 *
 * ONE byte representation per value, on every platform, forever. Every signed
 * org action and every certificate is signed over the output of this function,
 * so producer (client) and verifier (relay, and any auditor re-checking the
 * signature years later) must agree on it byte for byte.
 *
 * Subset of RFC 8785 (JCS):
 *   - object keys sorted by UTF-16 code unit (what `Array.prototype.sort` and
 *     JCS both do), no whitespace anywhere;
 *   - strings serialized by `JSON.stringify`, which already emits the shortest
 *     RFC 8259 escaping and encodes lone surrogates as `\udXXX`;
 *   - `true` / `false` / `null` as-is;
 *   - arrays keep their order (order is data);
 *   - numbers: **safe integers only**.
 *
 * Why integers only: JCS defers float formatting to ECMAScript's
 * `Number::toString`, which is exact but notoriously easy to reimplement
 * *almost* right (`1e21`, `-0`, `5e-324`). A signing format that is subtly
 * wrong on one platform produces signatures that verify here and fail there —
 * the worst possible failure for an audit trail. No field in an org action is
 * fractional (ids, roles, day counts, epochs, millisecond timestamps), so this
 * module refuses non-integers outright instead of getting them wrong.
 *
 * Also rejected, each because it has no single honest encoding: `undefined`,
 * functions, symbols, `NaN`, `±Infinity`, `-0`, `BigInt`, cycles, and any
 * object that is not a plain object or array (Date, Map, class instances — a
 * caller must decide their wire shape explicitly).
 *
 * Changing anything here is a WIRE-FORMAT BREAK: every signature ever produced
 * stops verifying. Version the action prefix instead (`aegiswork/v2/…`).
 */

/** A value this module can canonicalize. */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const MAX_DEPTH = 32;

function fail(path: string, why: string): never {
  throw new Error(`canonicalJson: ${why} at ${path || '<root>'}`);
}

function encodeValue(value: unknown, path: string, depth: number, seen: Set<object>): string {
  if (depth > MAX_DEPTH) fail(path, 'nesting deeper than 32 levels');

  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number': {
      if (!Number.isFinite(value)) fail(path, 'non-finite number');
      if (!Number.isInteger(value)) fail(path, 'non-integer number (see module header)');
      if (!Number.isSafeInteger(value)) fail(path, 'integer outside the safe range');
      // `Object.is` distinguishes -0 from 0; `String(-0)` would silently emit "0".
      if (Object.is(value, -0)) fail(path, 'negative zero');
      return String(value);
    }

    case 'string':
      return JSON.stringify(value);

    case 'object': {
      const obj = value as object;
      if (seen.has(obj)) fail(path, 'circular reference');
      seen.add(obj);
      try {
        if (Array.isArray(obj)) {
          const parts = obj.map((item, i) => encodeValue(item, `${path}[${i}]`, depth + 1, seen));
          return `[${parts.join(',')}]`;
        }
        if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) {
          fail(path, 'not a plain object (give it an explicit wire shape first)');
        }
        const record = obj as Record<string, unknown>;
        // Own enumerable string keys only: inherited or symbol-keyed data has no
        // place in a signed payload, and silently dropping it would let two
        // different objects sign identical bytes.
        const keys = Object.keys(record).sort();
        const parts = keys.map((key) => {
          const encoded = encodeValue(record[key], path ? `${path}.${key}` : key, depth + 1, seen);
          return `${JSON.stringify(key)}:${encoded}`;
        });
        return `{${parts.join(',')}}`;
      } finally {
        seen.delete(obj);
      }
    }

    default:
      // undefined, function, symbol, bigint.
      fail(path, `unsupported type ${typeof value}`);
  }
}

/**
 * Canonical JSON text for `value`.
 *
 * Throws on anything without a single honest encoding (see the module header)
 * rather than guessing — a signer that quietly drops a field signs something
 * different from what it meant to say.
 */
export function canonicalJson(value: CanonicalValue): string {
  return encodeValue(value, '', 0, new Set<object>());
}

/** `canonicalJson` as UTF-8 bytes — what actually gets signed. */
export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
