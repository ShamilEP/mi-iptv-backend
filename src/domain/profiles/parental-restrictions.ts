/**
 * Parental / kid-profile restrictions stored in `profiles.restrictions` (BE-037 / FR-023).
 * Enforcement applies only when the relevant content metadata is present.
 */
export type ParentalRestrictions = {
  readonly kidMode: boolean;
  /** Highest allowed rating label (inclusive). Null = no rating gate. */
  readonly maxRating: string | null;
  /** When non-empty, only these source ids are allowed (metadata must include sourceId). */
  readonly allowedSourceIds: readonly string[];
  /** Source ids that are always blocked when sourceId metadata is present. */
  readonly blockedSourceIds: readonly string[];
};

export type ContentRestrictionMetadata = {
  readonly rating?: string | null;
  readonly sourceId?: string | null;
};

export type ContentAccessDecision = {
  readonly allowed: boolean;
  readonly reason: string | null;
};

/** Coarse maturity ladder for common IPTV / broadcast labels (case-insensitive). */
const RATING_RANK: Readonly<Record<string, number>> = {
  'TV-Y': 10,
  G: 20,
  'TV-G': 20,
  'TV-Y7': 30,
  PG: 40,
  'TV-PG': 40,
  'PG-13': 50,
  'TV-14': 60,
  R: 70,
  'TV-MA': 80,
  'NC-17': 90,
  XXX: 100,
};

export function emptyParentalRestrictions(): ParentalRestrictions {
  return {
    kidMode: false,
    maxRating: null,
    allowedSourceIds: [],
    blockedSourceIds: [],
  };
}

export function parseParentalRestrictions(
  raw: Readonly<Record<string, unknown>> | ParentalRestrictions,
): ParentalRestrictions {
  const allowed = asStringArray(raw.allowedSourceIds);
  const blocked = asStringArray(raw.blockedSourceIds);
  const maxRatingRaw = raw.maxRating;
  const maxRating =
    typeof maxRatingRaw === 'string' && maxRatingRaw.trim() !== ''
      ? maxRatingRaw.trim().toUpperCase()
      : null;
  return {
    kidMode: Boolean(raw.kidMode),
    maxRating,
    allowedSourceIds: allowed,
    blockedSourceIds: blocked,
  };
}

/**
 * Decide whether content may be shown for a profile.
 * Missing rating/source metadata skips that axis (DoD: restrict when metadata exists).
 */
export function evaluateContentAccess(
  restrictionsInput:
    | Readonly<Record<string, unknown>>
    | ParentalRestrictions,
  content: ContentRestrictionMetadata,
): ContentAccessDecision {
  const restrictions = parseParentalRestrictions(restrictionsInput);

  if (!restrictions.kidMode) {
    return { allowed: true, reason: null };
  }

  const sourceId =
    typeof content.sourceId === 'string' && content.sourceId.trim() !== ''
      ? content.sourceId.trim()
      : null;
  if (sourceId !== null) {
    if (restrictions.blockedSourceIds.includes(sourceId)) {
      return { allowed: false, reason: 'SOURCE_BLOCKED' };
    }
    if (
      restrictions.allowedSourceIds.length > 0 &&
      !restrictions.allowedSourceIds.includes(sourceId)
    ) {
      return { allowed: false, reason: 'SOURCE_NOT_ALLOWED' };
    }
  }

  const rating =
    typeof content.rating === 'string' && content.rating.trim() !== ''
      ? content.rating.trim().toUpperCase()
      : null;
  if (rating !== null && restrictions.maxRating !== null) {
    const contentRank = RATING_RANK[rating];
    const maxRank = RATING_RANK[restrictions.maxRating];
    if (contentRank !== undefined && maxRank !== undefined) {
      if (contentRank > maxRank) {
        return { allowed: false, reason: 'RATING_EXCEEDED' };
      }
    }
  }

  return { allowed: true, reason: null };
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
