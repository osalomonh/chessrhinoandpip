// Dependency-free JSON Schema validator.
//
// Supports the subset of JSON Schema (draft-07 style) that
// contracts/chapter-format.schema.json is allowed to use:
//
//   type, properties, required, additionalProperties, items, enum, const,
//   oneOf, anyOf, minItems, minimum, pattern
//
// This is intentionally not a general-purpose validator. Anything outside
// this keyword set is ignored rather than rejected, so a schema author who
// reaches for an unsupported keyword will not get a loud error — that is a
// known limitation, documented here rather than silently discovered later.

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  minItems?: number;
  minimum?: number;
  pattern?: string;
};

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function describe(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  } catch {
    return String(value);
  }
}

/** Validates `data` against `schema`. Returns a list of human-readable error
 * strings, each prefixed with the JSON pointer-ish path where it occurred.
 * An empty array means valid. */
export function validate(schema: JsonSchema, data: unknown, path = "$"): string[] {
  const errors: string[] = [];

  if (schema.const !== undefined) {
    if (JSON.stringify(data) !== JSON.stringify(schema.const)) {
      errors.push(`${path}: expected const ${describe(schema.const)}, got ${describe(data)}`);
    }
  }

  if (schema.enum !== undefined) {
    const ok = schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(data));
    if (!ok) {
      errors.push(`${path}: expected one of ${describe(schema.enum)}, got ${describe(data)}`);
    }
  }

  if (schema.type !== undefined) {
    const wanted = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    // JSON Schema treats "number" as including integers; JS typeof does too.
    const ok = wanted.some((t) => t === actual || (t === "number" && actual === "number"));
    if (!ok) {
      errors.push(`${path}: expected type ${wanted.join(" | ")}, got ${actual}`);
    }
  }

  if (schema.minimum !== undefined && typeof data === "number") {
    if (data < schema.minimum) {
      errors.push(`${path}: ${data} is below minimum ${schema.minimum}`);
    }
  }

  if (schema.pattern !== undefined && typeof data === "string") {
    if (!new RegExp(schema.pattern).test(data)) {
      errors.push(`${path}: "${data}" does not match pattern /${schema.pattern}/`);
    }
  }

  if (schema.properties || schema.required || schema.additionalProperties !== undefined) {
    if (typeOf(data) === "object") {
      const obj = data as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in obj)) {
          errors.push(`${path}: missing required property "${req}"`);
        }
      }
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (schema.properties && key in schema.properties) {
          errors.push(...validate(schema.properties[key]!, obj[key], `${path}.${key}`));
        } else if (schema.additionalProperties === false) {
          errors.push(`${path}: unexpected property "${key}"`);
        } else if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === "object"
        ) {
          errors.push(...validate(schema.additionalProperties, obj[key], `${path}.${key}`));
        }
      }
      void known;
    } else if (schema.type === "object" || schema.properties) {
      // type mismatch already reported above if schema.type was set.
    }
  }

  if (schema.items !== undefined && Array.isArray(data)) {
    data.forEach((item, i) => {
      errors.push(...validate(schema.items!, item, `${path}[${i}]`));
    });
  }

  if (schema.minItems !== undefined && Array.isArray(data)) {
    if (data.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} items, got ${data.length}`);
    }
  }

  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validate(s, data, path));
    const passing = results.filter((r) => r.length === 0);
    if (passing.length !== 1) {
      errors.push(
        `${path}: expected exactly one oneOf branch to match, ${passing.length} matched (${describe(data)})`,
      );
    }
  }

  if (schema.anyOf) {
    const results = schema.anyOf.map((s) => validate(s, data, path));
    const passing = results.filter((r) => r.length === 0);
    if (passing.length === 0) {
      errors.push(`${path}: expected at least one anyOf branch to match (${describe(data)})`);
    }
  }

  return errors;
}
