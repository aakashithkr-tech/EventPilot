import { URL } from 'url';

export interface AnalyzedDeadline {
  title: string;
  date: string;
  type: 'official';
  verified: boolean;
}

export interface AnalyzedRequirement {
  title: string;
  completed: boolean;
  description?: string;
  requiredBy: string;
  sourceLink?: string;
  verified: boolean;
}

export interface AnalyzedResource {
  name: string;
  type: 'template' | 'document' | 'link';
  fileType: string;
  source: string;
  url: string;
}

export interface EventAnalysisResult {
  sourceUrl?: string;
  sourceType: 'url' | 'text';

  event: {
    name: string;
    type: 'hackathon' | 'competition' | 'conference' | 'workshop';
    description: string;
    status: 'on-track';
    finalDeadline: string;
    progress: number;
    healthScore: number;

    teamSize: number;
    teamSizeMin: number;
    teamSizeMax: number;
    individualAllowed: boolean;
    participationDetails: string;
    nextAction: string;
  };

  deadlines: AnalyzedDeadline[];
  requirements: AnalyzedRequirement[];
  resources: AnalyzedResource[];
  teamMembers: [];

  confidence: {
    overall: 'high' | 'medium' | 'low';
    event: 'high' | 'medium' | 'low';
    deadlines: 'high' | 'medium' | 'low';
    requirements: 'high' | 'medium' | 'low';
    resources: 'high' | 'medium' | 'low';
  };

  warnings: string[];
}

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(
        /<\/(p|div|section|article|li|h[1-6]|tr|td|th|header|footer|main|aside)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  );
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i'
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }

  return undefined;
}

function extractTitle(html: string, sourceUrl?: string): string {
  const ogTitle = extractMeta(html, 'og:title');

  if (ogTitle) {
    return trimSiteSuffix(ogTitle);
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  if (title) {
    return trimSiteSuffix(cleanText(title));
  }

  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, '');

      return host
        .split('.')[0]
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      // fall through
    }
  }

  return 'Untitled Event';
}

function trimSiteSuffix(title: string): string {
  return title
    .replace(
      /\s*[|•–—-]\s*(unstop|devpost|eventbrite|meetup|hack2skill|linkedin).*$/i,
      ''
    )
    .trim()
    .slice(0, 200);
}

function inferType(
  text: string
): EventAnalysisResult['event']['type'] {
  const value = text.toLowerCase();

  if (
    /\b(conference|summit|speaker|keynote|panel|symposium)\b/.test(
      value
    )
  ) {
    return 'conference';
  }

  if (
    /\b(workshop|bootcamp|masterclass|training|hands[- ]on)\b/.test(
      value
    )
  ) {
    return 'workshop';
  }

  if (
    /\b(case competition|case study|business challenge|quiz competition|olympiad|challenge|contest|competition)\b/.test(
      value
    )
  ) {
    return 'competition';
  }

  return 'hackathon';
}

function inferParticipation(text: string): {
  teamSize: number;
  teamSizeMin: number;
  teamSizeMax: number;
  individualAllowed: boolean;
  participationDetails: string;
} {
  const value = cleanText(text);

  const individualExplicit =
    /\b(?:individual|solo|single[-\s]?participant|participate\s+(?:alone|individually))\b/i.test(
      value
    );

  const individualForbidden =
    /\b(?:not\s+allowed|not\s+permitted|only\s+teams?|teams?\s+only)\b/i.test(
      value
    );

  const individualAllowed =
    individualExplicit && !individualForbidden;

  /*
   * Examples:
   * 1-4 members
   * 1–4 members
   * 1 to 4 members
   * team size 1-4
   * team size: 1–4
   * teams of 2-4
   * teams of 2 to 4
   */
  const rangePatterns = [
    /\bteam(?:\s+size|\s+of)?\s*[:=-]?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,

    /\bteams?\s+of\s+(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,

    /\b(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)\b/i,
  ];

  for (const pattern of rangePatterns) {
    const match = value.match(pattern);

    if (!match) continue;

    const a = Number(match[1]);
    const b = Number(match[2]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }

    const min = Math.min(a, b);
    const max = Math.max(a, b);

    return {
      teamSize: max,
      teamSizeMin: min,
      teamSizeMax: max,
      individualAllowed,
      participationDetails: individualAllowed
        ? `Individual or teams of ${min}–${max} members`
        : `Teams of ${min}–${max} members`,
    };
  }

  /*
   * Examples:
   * maximum 4 members
   * max 4 members
   * up to 4 members
   * at most 4 members
   */
  const upTo = value.match(
    /\b(?:maximum|max\.?|up\s+to|at\s+most)\s*(\d+)\s*(?:members?|participants?|people)\b/i
  );

  if (upTo) {
    const max = Number(upTo[1]);

    if (Number.isFinite(max)) {
      const min = individualAllowed ? 1 : 2;

      return {
        teamSize: max,
        teamSizeMin: min,
        teamSizeMax: max,
        individualAllowed,
        participationDetails: individualAllowed
          ? `Individual or teams of up to ${max} members`
          : `Teams of up to ${max} members`,
      };
    }
  }

  /*
   * Fixed team size.
   */
  const fixed =
    value.match(
      /\b(?:team\s+size|teams?\s+of|team\s+of)\s*[:=-]?\s*(\d+)\s*(?:members?|participants?|people)\b/i
    ) ||
    value.match(
      /\b(\d+)\s*(?:members?|participants?|people)\s+per\s+team\b/i
    );

  if (fixed) {
    const size = Number(fixed[1]);

    if (Number.isFinite(size)) {
      return {
        teamSize: size,
        teamSizeMin: size,
        teamSizeMax: size,
        individualAllowed,
        participationDetails: individualAllowed
          ? `Individual or teams of ${size} members`
          : `${size} members per team`,
      };
    }
  }

  if (individualAllowed) {
    return {
      teamSize: 1,
      teamSizeMin: 1,
      teamSizeMax: 1,
      individualAllowed: true,
      participationDetails: 'Individual participation allowed',
    };
  }

  return {
    teamSize: 1,
    teamSizeMin: 1,
    teamSizeMax: 1,
    individualAllowed: false,
    participationDetails: 'Team size not explicitly detected',
  };
}

function inferTeamSize(text: string): number {
  return inferParticipation(text).teamSize;
}

function inferSourceYear(text: string): number {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1])
  );

  if (years.length > 0) {
    const counts = new Map<number, number>();

    for (const year of years) {
      counts.set(year, (counts.get(year) || 0) + 1);
    }

    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || b[0] - a[0]
    )[0][0];
  }

  return new Date().getUTCFullYear();
}

function parseDateCandidate(
  raw: string,
  fallbackYear?: number
): Date | null {
  const value = raw
    .trim()
    .replace(/\b(st|nd|rd|th)\b/gi, '')
    .replace(/,/g, '');

  const monthNames: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const year = fallbackYear ?? new Date().getUTCFullYear();

  /*
   * Full date:
   * 28 September 2026
   */
  let match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/
  );

  if (
    match &&
    monthNames[match[2].toLowerCase()] !== undefined
  ) {
    return new Date(
      Date.UTC(
        Number(match[3]),
        monthNames[match[2].toLowerCase()],
        Number(match[1])
      )
    );
  }

  /*
   * Full date:
   * September 28 2026
   */
  match = value.match(
    /\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/
  );

  if (
    match &&
    monthNames[match[1].toLowerCase()] !== undefined
  ) {
    return new Date(
      Date.UTC(
        Number(match[3]),
        monthNames[match[1].toLowerCase()],
        Number(match[2])
      )
    );
  }

  /*
   * ISO:
   * 2026-09-28
   */
  match = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (match) {
    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      )
    );
  }

  /*
   * Numeric:
   * 28/09/2026
   * 28-09-2026
   */
  match = value.match(
    /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/
  );

  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);

    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;

    return new Date(
      Date.UTC(Number(match[3]), month - 1, day)
    );
  }

  /*
   * Unstop-style:
   * 25 Sep'26
   * 25 Sep ’26
   * 25 September '26
   */
  match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s*['’](\d{2})\b/
  );

  if (
    match &&
    monthNames[match[2].toLowerCase()] !== undefined
  ) {
    const shortYear = Number(match[3]);
    const fullYear = 2000 + shortYear;

    return new Date(
      Date.UTC(
        fullYear,
        monthNames[match[2].toLowerCase()],
        Number(match[1])
      )
    );
  }

  /*
   * Month + day without year:
   * Sep 28
   * September 28
   */
  match = value.match(
    /\b([A-Za-z]+)\s+(\d{1,2})\b/
  );

  if (
    match &&
    monthNames[match[1].toLowerCase()] !== undefined
  ) {
    return new Date(
      Date.UTC(
        year,
        monthNames[match[1].toLowerCase()],
        Number(match[2])
      )
    );
  }

  /*
   * Day + month without year:
   * 28 Sep
   * 28 September
   */
  match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\b/
  );

  if (
    match &&
    monthNames[match[2].toLowerCase()] !== undefined
  ) {
    return new Date(
      Date.UTC(
        year,
        monthNames[match[2].toLowerCase()],
        Number(match[1])
      )
    );
  }

  return null;
}

function dateRegex(): RegExp {
  /*
   * Supports:
   * 28 September 2026
   * September 28 2026
   * 2026-09-28
   * 28/09/2026
   * Sep 28
   * 28 Sep
   * 25 Sep'26
   */
  return /\b(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*['’]\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?=\s|$|,)|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?=\s|$|,))\b/i;
}

function normalizeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function deadlineKey(title: string): string {
  const value = cleanText(title).toLowerCase();

  if (
    /registration/.test(value) &&
    /open|start|begin/.test(value)
  ) {
    return 'registration-open';
  }

  if (
    /registration|application/.test(value) &&
    /close|closing|deadline|last date|due/.test(value)
  ) {
    return 'registration-close';
  }

  if (
    /code freeze/.test(value) &&
    /submission|deadline|due|close|closing/.test(value)
  ) {
    return 'final-submission';
  }

  if (
    /submission/.test(value) &&
    /final|close|closing|deadline|last date|due/.test(value)
  ) {
    return 'final-submission';
  }

  if (/proposal/.test(value)) return 'proposal';
  if (/abstract/.test(value)) return 'abstract';
  if (/presentation/.test(value)) return 'presentation';
  if (/speaker/.test(value)) return 'speaker';

  if (/event.*start|start.*event/.test(value)) {
    return 'event-start';
  }

  if (/event.*end|end.*event/.test(value)) {
    return 'event-end';
  }

  if (/code freeze/.test(value)) {
    return 'final-submission';
  }

  return normalizeDeadlineLabel(value);
}

function normalizeDeadlineLabel(value: string): string {
  return value
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|official|date|time|on|at)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deadlinePriority(title: string): number {
  const key = deadlineKey(title);

  if (key === 'final-submission') return 100;
  if (key === 'registration-close') return 90;
  if (key === 'registration-open') return 85;
  if (key === 'submission') return 95;

  if (
    key === 'proposal' ||
    key === 'abstract' ||
    key === 'presentation' ||
    key === 'speaker'
  ) {
    return 80;
  }

  if (key === 'event-start' || key === 'event-end') {
    return 60;
  }

  return 50;
}

function extractDeadlineTitle(label: string): string {
  const lower = label.toLowerCase();

  if (
    /registration/.test(lower) &&
    /open|start|begin/.test(lower)
  ) {
    return 'Registration Opens';
  }

  if (
    /registration|application/.test(lower) &&
    /close|closing|deadline|last date|due/.test(lower)
  ) {
    return 'Registration Closes';
  }

  if (/event/.test(lower) && /start/.test(lower)) {
    return 'Event Starts';
  }

  if (/event/.test(lower) && /end/.test(lower)) {
    return 'Event Ends';
  }

  if (
    /code\s+freeze/.test(lower) &&
    /submission|deadline|due|close|closing/.test(lower)
  ) {
    return 'Final Submission Deadline';
  }

  if (
    /final\s+submission|final/.test(lower) &&
    /submission|deadline|due|close|closing/.test(lower)
  ) {
    return 'Final Submission Deadline';
  }

  if (/abstract/.test(lower)) {
    return 'Abstract Submission';
  }

  if (/proposal/.test(lower)) {
    return 'Proposal Submission';
  }

  if (/presentation/.test(lower)) {
    return 'Presentation Submission';
  }

  if (/speaker/.test(lower)) {
    return 'Speaker Deadline';
  }

  if (/submission|deadline|closing|close|last date|due/.test(lower)) {
    return 'Submission Deadline';
  }

  /*
   * Preserve useful official milestone names instead of allowing
   * arbitrary page sentences to become titles.
   */
  if (/judging\s+panel/.test(lower)) {
    return 'Judging Panel Announced';
  }

  if (/judging/.test(lower)) {
    return 'Judging';
  }

  if (/team\s+formation/.test(lower)) {
    return 'Team Formation';
  }

  if (/full\s+specification/.test(lower)) {
    return 'Full Specification Published';
  }

  if (/write\s*up/.test(lower)) {
    return 'Write Up Deadline';
  }

  if (/winner/.test(lower)) {
    return 'Winners Announced';
  }

  return (
    label
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) || 'Official Event Deadline'
  );
}

function extractDeadlines(text: string): AnalyzedDeadline[] {
  const normalizedText = decodeHtml(text).replace(
    /\u00a0/g,
    ' '
  );

  const lines = normalizedText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const sourceYear = inferSourceYear(normalizedText);

  const candidates: Array<
    AnalyzedDeadline & {
      key: string;
      priority: number;
      order: number;
    }
  > = [];

  const keyword =
    /registration|application|submission|deadline|closing|close|proposal|abstract|presentation|speaker|final|last date|due|event start|event end|judging|team formation|specification|code freeze|write\s*up|winners?/i;

  const addCandidate = (
    labelSource: string,
    rawDate: string,
    order: number
  ) => {
    const date = parseDateCandidate(rawDate, sourceYear);

    if (!date || Number.isNaN(date.getTime())) {
      return;
    }

    const cleanedLabel = cleanText(labelSource)
      .replace(rawDate, ' ')
      .replace(/\b(?:at|on|by|until)\s*$/i, '')
      .trim();

    /*
     * Do not allow a huge arbitrary sentence to become a deadline title.
     */
    const boundedLabel = cleanedLabel.slice(0, 180);

    const title = extractDeadlineTitle(boundedLabel);
    const key = deadlineKey(title);

    candidates.push({
      title,
      date: normalizeDate(date),
      type: 'official',
      verified: true,
      key,
      priority: deadlinePriority(title),
      order,
    });
  };

  const isTimeOnly = (value: string) =>
    /^\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*[A-Z]{2,5})?$/i.test(
      value
    );

  /*
   * 1. Normal DOM / Playwright innerText structure.
   *
   * Important:
   * We never associate a label with a time-only line.
   */
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!keyword.test(line)) {
      continue;
    }

    const sameLineDates = line.match(dateRegex()) || [];

    if (sameLineDates.length > 0) {
      for (const raw of sameLineDates) {
        addCandidate(line, raw, i);
      }

      continue;
    }

    for (let offset = 1; offset <= 8; offset++) {
      const next = lines[i + offset];

      if (!next) {
        break;
      }

      if (isTimeOnly(next)) {
        continue;
      }

      const dateMatch = next.match(dateRegex());

      if (dateMatch?.[0]) {
        addCandidate(line, dateMatch[0], i);
        break;
      }

      /*
       * If another milestone starts before a date appears,
       * never steal its date.
       */
      if (offset > 1 && keyword.test(next)) {
        break;
      }
    }
  }

  /*
   * 2. Flattened SPA / React text.
   *
   * Each milestone gets its own local search window.
   */
  const flat = cleanText(normalizedText);

  const milestoneRegex =
    /(registration\s+(?:opens?|open|starts?|begins?|closes?|closing|deadline)|application\s+(?:deadline|closes?|closing)|hackathon\s+(?:begins?|starts?|ends?)|event\s+(?:starts?|ends?)|final\s+submission(?:\s+deadline)?|code\s+freeze(?:\s+and\s+submission\s+deadline)?|submission\s+(?:deadline|closes?|closing)|proposal\s+(?:submission|deadline)|abstract\s+(?:submission|deadline)|presentation\s+(?:submission|deadline)|speaker\s+(?:deadline|submission)|judging\s+(?:panel\s+announced|window)|team\s+formation|full\s+specification\s+published|write\s*up\s+quest\s+closes?|winners?\s+announced)/gi;

  const matches = [...flat.matchAll(milestoneRegex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    const label = match[0];

    const start =
      (match.index ?? 0) + label.length;

    const end =
      matches[i + 1]?.index ??
      Math.min(flat.length, start + 220);

    const window = flat.slice(start, end);

    const dateMatch = window.match(dateRegex());

    if (dateMatch?.[0]) {
      addCandidate(label, dateMatch[0], i);
    }
  }

  /*
   * 3. Sentence-style fallback.
   */
  const sentenceRegex =
    /((?:registration|application|hackathon|event|submission|proposal|abstract|presentation|speaker|judging|team formation|full specification|code freeze|write\s*up quest|winners?)[^.!?\n]{0,100}?)(?:on|by|until|at|:)\s*((?:\d{1,2}\s+[A-Za-z]+(?:,?\s+\d{4})?|\d{1,2}\s+[A-Za-z]+\s*['’]\d{2}|[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}))/gi;

  for (const match of flat.matchAll(sentenceRegex)) {
    if (match[1] && match[2]) {
      addCandidate(match[1], match[2], 10000);
    }
  }

  /*
   * 4. Deduplicate by logical milestone.
   *
   * If the same milestone occurs multiple times,
   * keep the latest announced value.
   */
  const best = new Map<
    string,
    typeof candidates[number]
  >();

  for (const candidate of candidates) {
    const existing = best.get(candidate.key);

    if (
      !existing ||
      candidate.date > existing.date ||
      (candidate.date === existing.date &&
        candidate.priority > existing.priority)
    ) {
      best.set(candidate.key, candidate);
    }
  }

  return [...best.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30)
    .map(
      ({
        key: _key,
        priority: _priority,
        order: _order,
        ...deadline
      }) => deadline
    );
}

function extractRequirements(
  text: string,
  sourceUrl?: string
): AnalyzedRequirement[] {
  const normalizedText = decodeHtml(text).replace(
    /\u00a0/g,
    ' '
  );

  const lines = normalizedText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const found = new Map<string, AnalyzedRequirement>();

  const sectionHeading =
    /^(?:what you need to submit|what to submit|what you need to provide|submission checklist|submission requirements?|requirements?|deliverables?|documents required|judging criteria|evaluation criteria|eligibility|rules?)$/i;

  const addRequirement = (
    value: string,
    requiredBy: string
  ) => {
    const candidate = cleanText(
      value
        .replace(/^[\s•*\-–—✓✔☐☑\d.)]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    );

    if (candidate.length < 4 || candidate.length > 220) {
      return;
    }

    if (!/[A-Za-z]/.test(candidate)) {
      return;
    }

    if (
      /^(requirements?|eligibility|submission|details?|rules?|guidelines?|judging criteria|evaluation criteria)$/i.test(
        candidate
      )
    ) {
      return;
    }

    /*
     * Do not accidentally turn timeline sentences into requirements.
     */
    if (
      /^(registration|important dates|timeline|schedule|prizes?|contact|faq|about)$/i.test(
        candidate
      )
    ) {
      return;
    }

    const key = candidate.toLowerCase();

    if (!found.has(key)) {
      found.set(key, {
        title: candidate,
        completed: false,
        requiredBy,
        ...(sourceUrl
          ? { sourceLink: sourceUrl }
          : {}),
        verified: true,
      });
    }
  };

  /*
   * 1. Line-oriented sections.
   */
  let inSection = false;
  let remaining = 0;
  let sectionTitle = 'Event Requirements';

  for (const line of lines) {
    const isHeading =
      sectionHeading.test(line) ||
      (/what you need to submit|what you need to provide|submission requirements?|submission checklist|deliverables?|documents required/i.test(
        line
      ) &&
        line.length < 140);

    if (isHeading) {
      inSection = true;
      sectionTitle = line;
      remaining = 40;
      continue;
    }

    if (inSection) {
      if (remaining-- <= 0) {
        inSection = false;
        continue;
      }

      if (
        /^(important dates|timeline|schedule|contact|faq|about|prizes?|register|registration|judging)\b/i.test(
          line
        )
      ) {
        inSection = false;
        continue;
      }

      addRequirement(line, sectionTitle);
    }
  }

  /*
   * 2. Flattened Unstop / React text.
   */
  const flat = cleanText(normalizedText);

  const flattenedSection =
    /what\s+you\s+need\s+to\s+(?:submit|provide)|what\s+to\s+submit|submission\s+requirements?|submission\s+checklist/i;

  const sectionMatch = flat.match(flattenedSection);

  if (
    sectionMatch &&
    sectionMatch.index !== undefined
  ) {
    const start =
      sectionMatch.index +
      sectionMatch[0].length;

    const tail = flat.slice(start);

    const stop = tail.search(
      /\b(?:important dates|timeline|judging criteria|prizes?|eligibility|about hackathon|faq|contact|registration)\b/i
    );

    const section = tail.slice(
      0,
      stop >= 0 ? stop : 1800
    );

    /*
     * Some pages have bullets, some use separators,
     * and some flattened React text has no bullet at all.
     */
    for (const item of section.split(
      /\s*(?:•|·|▪|◦|\||;)\s*/
    )) {
      addRequirement(
        item,
        sectionMatch[0]
      );
    }

    /*
     * If no separator existed, extract common deliverable
     * phrases from the flattened section.
     */
    const deliverablePatterns = [
      /public github repo[^.;]*/gi,
      /working implementation[^.;]*/gi,
      /open[- ]source license[^.;]*/gi,
      /docker compose up[^.;]*/gi,
      /acceptance[- ]report[^.;]*/gi,
      /readme\.md[^.;]*/gi,
      /architecture\.md[^.;]*/gi,
      /data[- ]model\.md[^.;]*/gi,
      /judging\.md[^.;]*/gi,
      /tests?[^.;]*/gi,
      /demo video[^.;]*/gi,
    ];

    for (const pattern of deliverablePatterns) {
      for (const match of section.matchAll(pattern)) {
        if (match[0]) {
          addRequirement(
            match[0],
            sectionMatch[0]
          );
        }
      }
    }
  }

  /*
   * 3. Explicit instruction sentences.
   */
  const instructionRegex =
    /(?:must\s+(?:submit|provide|upload)|submit|provide|upload|include|requires?)\s+([^.;]{4,180})/gi;

  for (const match of flat.matchAll(
    instructionRegex
  )) {
    const candidate = match[1]?.trim();

    if (!candidate) continue;

    if (
      /^(your|the)\s+(application|details|information)$/i.test(
        candidate
      )
    ) {
      continue;
    }

    addRequirement(
      candidate,
      'Submission Instructions'
    );
  }

  return [...found.values()].slice(0, 40);
}

function extractResources(
  html: string,
  sourceUrl: string
): AnalyzedResource[] {
  const found = new Map<
    string,
    AnalyzedResource
  >();

  const anchorRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = anchorRegex.exec(html)) !== null
  ) {
    const href = match[1].trim();
    const name = cleanText(match[2]);

    if (!name || name.length < 3 || name.length > 140) {
      continue;
    }

    if (
      !/guideline|rulebook|rules|template|problem statement|starter|handbook|brochure|schedule|resource|download|brief|kit/i.test(
        name
      )
    ) {
      continue;
    }

    let absolute: string;

    try {
      absolute = new URL(
        href,
        sourceUrl
      ).toString();
    } catch {
      continue;
    }

    const lower =
      `${name} ${absolute}`.toLowerCase();

    const isTemplate =
      /template|starter|kit|boilerplate/.test(
        lower
      );

    const isDocument =
      /pdf|guideline|rulebook|rules|handbook|brief|brochure|problem statement|schedule/.test(
        lower
      );

    found.set(absolute, {
      name,
      type: isTemplate
        ? 'template'
        : isDocument
          ? 'document'
          : 'link',

      fileType: /\.pdf(?:$|[?#])/i.test(
        absolute
      )
        ? 'PDF'
        : isTemplate
          ? 'Template'
          : 'URL',

      source: 'Extracted from event page',
      url: absolute,
    });
  }

  return [...found.values()].slice(0, 20);
}

function extractDescription(
  html: string
): string {
  return (
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'description') ||
    ''
  );
}

function extractStructuredDates(
  html: string
): string[] {
  const dates: string[] = [];

  const jsonLdRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = jsonLdRegex.exec(html)) !== null
  ) {
    try {
      const parsed = JSON.parse(match[1]);

      const stack = Array.isArray(parsed)
        ? parsed
        : [parsed];

      for (const item of stack) {
        if (
          !item ||
          typeof item !== 'object'
        ) {
          continue;
        }

        for (const key of [
          'startDate',
          'endDate',
          'validThrough',
          'expires',
        ]) {
          if (
            typeof item[key] === 'string'
          ) {
            dates.push(item[key]);
          }
        }
      }
    } catch {
      // Visible rendered text remains the primary source.
    }
  }

  return dates;
}

async function fetchUrl(
  url: string
): Promise<{
  html: string;
  finalUrl: string;
}> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Please enter a valid http(s) event URL.'
    );
  }

  if (
    !['http:', 'https:'].includes(
      parsed.protocol
    )
  ) {
    throw new Error(
      'Only http(s) event URLs are supported.'
    );
  }

  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      parsed.toString(),
      {
        signal: controller.signal,
        redirect: 'follow',

        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',

          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

          'Accept-Language':
            'en-US,en;q=0.9',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `The event page returned HTTP ${response.status}.`
      );
    }

    const contentType =
      response.headers.get(
        'content-type'
      ) || '';

    if (
      !contentType.includes(
        'text/html'
      ) &&
      !contentType.includes(
        'application/xhtml+xml'
      )
    ) {
      throw new Error(
        'That URL did not return an HTML event page. Upload the document or use Add Manually instead.'
      );
    }

    const contentLength = Number(
      response.headers.get(
        'content-length'
      ) || 0
    );

    if (
      contentLength > MAX_SOURCE_BYTES
    ) {
      throw new Error(
        'The event page is too large to analyze.'
      );
    }

    const html =
      await response.text();

    if (
      Buffer.byteLength(
        html,
        'utf8'
      ) > MAX_SOURCE_BYTES
    ) {
      throw new Error(
        'The event page is too large to analyze.'
      );
    }

    return {
      html,
      finalUrl:
        response.url ||
        parsed.toString(),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'The event page took too long to respond. Try again or use the event PDF/manual entry.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function renderUrl(
  url: string
): Promise<{
  html: string;
  text: string;
  finalUrl: string;
}> {
  let browser: any;

  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH =
      '0';

    const playwright =
      require('playwright');

    browser =
      await playwright.chromium.launch(
        {
          headless: true,

          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        }
      );

    const page =
      await browser.newPage({
        viewport: {
          width: 1440,
          height: 1200,
        },

        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36 EventPilot/1.0',
      });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await page
      .waitForLoadState(
        'networkidle',
        {
          timeout: 12_000,
        }
      )
      .catch(
        () => undefined
      );

    await page.waitForTimeout(
      1_500
    );

    const bodyText =
      await page
        .locator('body')
        .innerText({
          timeout: 5_000,
        })
        .catch(
          () => ''
        );

    const html =
      await page.content();

    return {
      html: html.slice(
        0,
        MAX_SOURCE_BYTES
      ),

      /*
       * IMPORTANT:
       * Playwright innerText is authoritative for rendered pages.
       */
      text: bodyText.slice(
        0,
        MAX_SOURCE_BYTES
      ),

      finalUrl:
        page.url() || url,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      /Cannot find module ['"]playwright['"]/.test(
        message
      )
    ) {
      throw new Error(
        'This event page needs browser rendering. Run "npm install" in server and then "npx playwright install chromium" once.'
      );
    }

    if (
      /Executable doesn't exist|download new browsers/i.test(
        message
      )
    ) {
      throw new Error(
        'The Chromium browser used to read JS-rendered event pages is missing on this server. Run "npx playwright install --with-deps chromium" in the server directory and redeploy.'
      );
    }

    if (
      /error while loading shared libraries|missing dependencies|libnss3|libatk/i.test(
        message
      )
    ) {
      throw new Error(
        'The server is missing system libraries Chromium needs. Run "npx playwright install-deps chromium" (or use a base image with those libraries) and redeploy.'
      );
    }

    throw new Error(
      `The event page could not be rendered: ${message}`
    );
  } finally {
    if (browser) {
      await browser
        .close()
        .catch(
          () => undefined
        );
    }
  }
}

export async function analyzeEventSource(
  input: string
): Promise<EventAnalysisResult> {
  const source = input.trim();

  if (!source) {
    throw new Error(
      'Event source is required.'
    );
  }

  let html = '';
  let finalUrl:
    | string
    | undefined;

  let renderedText:
    | string
    | undefined;

  const looksLikeUrl =
    /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(
      source
    );

  const isUrl = looksLikeUrl;

  const urlSource =
    /^https?:\/\//i.test(source)
      ? source
      : `https://${source}`;

  if (isUrl) {
    try {
      /*
       * FIRST: try normal HTTP fetch.
       */
      const fetched =
        await fetchUrl(
          urlSource
        );

      html =
        fetched.html;

      finalUrl =
        fetched.finalUrl;

      /*
       * IMPORTANT FIX:
       *
       * Modern event platforms often return HTML containing
       * one or two dates but hide the actual timeline,
       * requirements and team-size information behind React.
       *
       * Therefore, having "some deadline" is NOT enough
       * to skip Playwright.
       */
      const rawText =
        stripHtml(html);

      const rawDeadlines =
        extractDeadlines(
          rawText
        );

      const rawRequirements =
        extractRequirements(
          rawText,
          finalUrl
        );

      const rawParticipation =
        inferParticipation(
          [
            extractTitle(
              html,
              finalUrl
            ),
            extractDescription(
              html
            ),
            rawText,
          ].join('\n')
        );

      const rawHasSubmissionDeadline =
        rawDeadlines.some(
          (deadline) =>
            /submission|code freeze|final submission/i.test(
              deadline.title
            ) &&
            !/registration/i.test(
              deadline.title
            )
        );

      const rawHasUsefulTeamSize =
        rawParticipation.teamSizeMax >
          1 ||
        rawParticipation.individualAllowed;

      /*
       * Render if ANY important part is missing.
       */
      const needsRenderedPage =
        rawDeadlines.length === 0 ||
        !rawHasSubmissionDeadline ||
        rawRequirements.length === 0 ||
        !rawHasUsefulTeamSize;

      if (needsRenderedPage) {
        console.log(
          `[event-analysis] Raw page incomplete; rendering with Playwright ` +
            `(deadlines=${rawDeadlines.length}, ` +
            `submissionDeadline=${rawHasSubmissionDeadline}, ` +
            `requirements=${rawRequirements.length}, ` +
            `teamSizeMax=${rawParticipation.teamSizeMax})`
        );

        const rendered =
          await renderUrl(
            finalUrl
          );

        html =
          rendered.html;

        renderedText =
          rendered.text;

        finalUrl =
          rendered.finalUrl;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.log(
        `[event-analysis] Direct fetch failed, trying browser render: ${message}`
      );

      const rendered =
        await renderUrl(
          urlSource
        );

      html =
        rendered.html;

      renderedText =
        rendered.text;

      finalUrl =
        rendered.finalUrl;
    }
  } else {
    /*
     * Text mode uses only user-provided text.
     */
    html =
      `<main>${source.replace(
        /\n/g,
        '<br>'
      )}</main>`;
  }

  /*
   * For rendered pages, use Playwright innerText.
   * For normal pages, use stripped HTML.
   */
  const visibleText =
    renderedText?.trim() ||
    stripHtml(html);

  const firstTextLine =
    visibleText
      .split('\n')
      .map(cleanText)
      .find(Boolean) ||
    'Untitled Event';

  const title = isUrl
    ? extractTitle(
        html,
        finalUrl
      )
    : firstTextLine.slice(
        0,
        200
      );

  const description = isUrl
    ? extractDescription(
        html
      ) ||
      visibleText.slice(
        0,
        500
      )
    : visibleText
        .split('\n')
        .slice(1)
        .join(' ')
        .slice(
          0,
          5000
        );

  const combined =
    `${title}\n${description}\n${visibleText}`;

  const type =
    inferType(
      combined
    );

  /*
   * Extract all official milestones.
   */
  const deadlines =
    extractDeadlines(
      visibleText
    );

  /*
   * JSON-LD dates are supplementary only.
   */
  const structuredDates =
    extractStructuredDates(
      html
    )
      .map(
        (value) =>
          parseDateCandidate(
            value
          )?.getTime()
      )
      .filter(
        (
          value
        ): value is number =>
          Number.isFinite(
            value
          )
      );

  if (
    deadlines.length === 0 &&
    structuredDates.length > 0
  ) {
    throw new Error(
      'I found event dates, but no clearly labelled submission/registration deadline. Please verify the deadline manually before creating the workspace.'
    );
  }

  if (
    deadlines.length === 0
  ) {
    throw new Error(
      'I could not find a clearly labelled event deadline on that page. Try the specific event page, upload its rulebook, or use Add Manually.'
    );
  }

  /*
   * ============================================================
   * PRIMARY DEADLINE SELECTION
   * ============================================================
   *
   * Priority:
   *
   * 1. Final submission / code freeze
   * 2. Other submission deadline
   * 3. Other non-registration deadline
   * 4. Last resort: official milestones
   *
   * Registration close MUST NEVER override submission deadline.
   */
  const submissionCandidates =
    deadlines.filter(
      (deadline) =>
        /submission|code freeze|final submission/i.test(
          deadline.title
        ) &&
        !/registration/i.test(
          deadline.title
        )
    );

  const nonRegistrationDeadlineCandidates =
    deadlines.filter(
      (deadline) =>
        /deadline|due|closing|close|last date/i.test(
          deadline.title
        ) &&
        !/registration/i.test(
          deadline.title
        )
    );

  const finalCandidates =
    submissionCandidates.length > 0
      ? submissionCandidates
      : nonRegistrationDeadlineCandidates.length >
          0
        ? nonRegistrationDeadlineCandidates
        : deadlines.filter(
            (deadline) =>
              !/registration/i.test(
                deadline.title
              )
          );

  /*
   * Prefer the latest date among candidates of the SAME semantic
   * category. This prevents a later winner-announcement date from
   * replacing a submission deadline.
   */
  const finalDeadline =
    (
      finalCandidates.length > 0
        ? finalCandidates
        : deadlines
    )
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      )
      .at(-1)!.date;

  /*
   * Requirements/resources/participation are calculated
   * AFTER rendered content has been selected.
   */
  const requirements =
    extractRequirements(
      visibleText,
      finalUrl
    );

  const resources =
    finalUrl
      ? extractResources(
          html,
          finalUrl
        )
      : [];

  const participation =
    inferParticipation(
      combined
    );

  const teamSize =
    participation.teamSize;

  const warnings: string[] =
    [];

  if (
    !extractMeta(
      html,
      'og:title'
    ) &&
    !/<title/i.test(
      html
    )
  ) {
    warnings.push(
      'Event name came from the page URL.'
    );
  }

  if (
    requirements.length === 0
  ) {
    warnings.push(
      'No clear requirements section was found; review the event page before creating the workspace.'
    );
  }

  if (
    resources.length === 0
  ) {
    warnings.push(
      'No linked guidelines/templates were detected on the page.'
    );
  }

  if (
    participation.teamSizeMax ===
      1 &&
    !participation.individualAllowed
  ) {
    warnings.push(
      'No explicit team-size limit was detected.'
    );
  }

  const confidenceScore =
    (deadlines.length > 0
      ? 1
      : 0) +
    (requirements.length > 0
      ? 1
      : 0) +
    (resources.length > 0
      ? 1
      : 0) +
    (title !==
    'Untitled Event'
      ? 1
      : 0);

  const overall:
    EventAnalysisResult['confidence']['overall'] =
    confidenceScore >= 4
      ? 'high'
      : confidenceScore >= 2
        ? 'medium'
        : 'low';

  return {
    ...(finalUrl
      ? {
          sourceUrl:
            finalUrl,
        }
      : {}),

    sourceType: isUrl
      ? 'url'
      : 'text',

    event: {
      name: title,

      type,

      description:
        description.slice(
          0,
          5000
        ),

      status:
        'on-track',

      finalDeadline,

      progress: 0,

      healthScore: 100,

      teamSize,

      teamSizeMin:
        participation.teamSizeMin,

      teamSizeMax:
        participation.teamSizeMax,

      individualAllowed:
        participation.individualAllowed,

      participationDetails:
        participation.participationDetails,

      nextAction:
        'Review extracted event details before creating the workspace',
    },

    deadlines,

    requirements,

    resources,

    teamMembers: [],

    confidence: {
      overall,

      event:
        title !==
        'Untitled Event'
          ? 'high'
          : 'low',

      deadlines:
        deadlines.length > 0
          ? 'high'
          : 'low',

      requirements:
        requirements.length > 0
          ? 'high'
          : 'low',

      resources:
        resources.length > 0
          ? 'high'
          : 'low',
    },

    warnings,
  };
}