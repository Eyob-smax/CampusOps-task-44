export const CANONICAL_THRESHOLD_OPERATORS = [
  ">",
  "<",
  ">=",
  "<=",
  "==",
] as const;

export type CanonicalThresholdOperator =
  (typeof CANONICAL_THRESHOLD_OPERATORS)[number];

const OPERATOR_ALIASES: Record<string, CanonicalThresholdOperator> = {
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "==": "==",
  "=": "==",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  eq: "==",
};

export function normalizeThresholdOperator(
  raw: string,
): CanonicalThresholdOperator | null {
  const token = raw.trim();
  if (!token) return null;

  return OPERATOR_ALIASES[token] ?? OPERATOR_ALIASES[token.toLowerCase()] ?? null;
}
