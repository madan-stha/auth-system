import { Transform } from 'class-transformer';

/** Trims and lowercases an email so "  Jane@Example.COM " and "jane@example.com" are one account. */
export const NormalizeEmail = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/**
 * Trims surrounding whitespace; a blank string becomes undefined, so an
 * empty optional form field counts as "not provided".
 */
export const TrimOrUndefined = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  );
