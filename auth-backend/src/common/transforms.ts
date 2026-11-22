import { Transform } from 'class-transformer';

/** Trims and lowercases an email so "  Jane@Example.COM " and "jane@example.com" are one account. */
export const NormalizeEmail = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Trims surrounding whitespace from a string value. */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
