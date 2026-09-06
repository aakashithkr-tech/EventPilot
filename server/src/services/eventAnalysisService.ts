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
const RENDER_TIMEOUT_MS = 35_000;

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
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(p|div|section|article|li|h[1-6]|tr|td|th|header|footer|main|aside|nav)>/gi,
        '\n'
      )
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]*\n+/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  );
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = escapeRegExp(key);

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
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

function trimSiteSuffix(title: string): string {
  return title
    .replace(
      /\s*[|•–—-]\s*(unstop|devpost|eventbrite|meetup|hack2skill|linkedin)\s*$/i,
      ''
    )
    .trim()
    .slice(0, 200);
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
      const host = new URL(sourceUrl).hostname.replace(/^www\./i, '');
      return host
        .split('.')[0]
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      // Ignore and use fallback.
    }
  }

  return 'Untitled Event';
}

function inferType(text: string): EventAnalysisResult['event']['type'] {
  const value = text.toLowerCase();

  if (
    /\b(conference|summit|speaker|keynote|panel|symposium)\b/.test(value)
  ) {
    return 'conference';
  }

  if (
    /\b(workshop|bootcamp|masterclass|training|hands[- ]on)\b/.test(value)
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

  const individualPositive =
    /\b(individual|solo|single[-\s]?participant|participate alone|participate individually|individual participation)\b/i.test(
      value
    );

  const individualNegative =
    /\b(no solo|solo not allowed|individual(?:s)? not allowed|teams only|only teams|individual participation is not allowed)\b/i.test(
      value
    );

  const individualAllowed = individualPositive && !individualNegative;

  const rangePatterns = [
    /\bteam\s*(?:size|of)?\s*[:=-]?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,
    /\bteams?\s+of\s+(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,
    /\b(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)\b/i,
  ];

  for (const pattern of rangePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const first = Number(match[1]);
    const second = Number(match[2]);

    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      continue;
    }

    const min = Math.min(first, second);
    const max = Math.max(first, second);

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

  const upToPatterns = [
    /\b(?:up\s+to|max(?:imum)?|at\s+most)\s+(\d+)\s*(?:members?|participants?|people)\b/i,
    /\b(?:team\s+size|team\s+limit)\s*[:=-]?\s*(?:up\s+to|max(?:imum)?|at\s+most)\s*(\d+)\b/i,
  ];

  for (const pattern of upToPatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const max = Number(match[1]);
    if (!Number.isFinite(max)) continue;

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

  const fixedPatterns = [
    /\b(?:team\s+size|teams?\s+of|team\s+of)\s*[:=-]?\s*(\d+)\s*(?:members?|participants?|people)\b/i,
    /\b(\d+)\s*(?:members?|participants?|people)\s+per\s+team\b/i,
  ];

  for (const pattern of fixedPatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const size = Number(match[1]);
    if (!Number.isFinite(size)) continue;

    return {
      teamSize: size,
      teamSizeMin: size,
      teamSizeMax: size,
      individualAllowed,
      participationDetails: individualAllowed
        ? `Individual or teams of ${size} members`
        : `Teams of ${size} members`,
    };
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

function inferSourceYear(text: string): number {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));

  if (years.length > 0) {
    const counts = new Map<number, number>();

    for (const year of years) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }

    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || b[0] - a[0]
    )[0][0];
  }

  return new Date().getUTCFullYear();
}

const MONTHS: Record<string, number> = {
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

function parseMonth(value: string): number | null {
  const month = MONTHS[value.toLowerCase()];
  return month === undefined ? null : month;
}

function parseDateCandidate(
  raw: string,
  fallbackYear?: number
): Date | null {
  const value = cleanText(raw)
    .replace(/\b(st|nd|rd|th)\b/gi, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const year = fallbackYear ?? new Date().getUTCFullYear();

  let match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i
  );

  if (match) {
    const day = Number(match[1]);
    const month = parseMonth(match[2]);

    if (month !== null) {
      return new Date(Date.UTC(Number(match[3]), month, day));
    }
  }

  match = value.match(
    /\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/i
  );

  if (match) {
    const month = parseMonth(match[1]);
    const day = Number(match[2]);

    if (month !== null) {
      return new Date(Date.UTC(Number(match[3]), month, day));
    }
  }

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

  match = value.match(
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/
  );

  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const parsedYear = Number(match[3]);

    // Prefer DD/MM when first number is > 12.
    if (first > 12) {
      return new Date(Date.UTC(parsedYear, second - 1, first));
    }

    // Otherwise interpret common event-site formatting as MM/DD.
    return new Date(Date.UTC(parsedYear, first - 1, second));
  }

  // 25 Sep'26 / 25 Sep ’26
  match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s*['’]\s*(\d{2})\b/i
  );

  if (match) {
    const day = Number(match[1]);
    const month = parseMonth(match[2]);
    const parsedYear = 2000 + Number(match[3]);

    if (month !== null) {
      return new Date(Date.UTC(parsedYear, month, day));
    }
  }

  // Sep 25'26
  match = value.match(
    /\b([A-Za-z]+)\s+(\d{1,2})\s*['’]\s*(\d{2})\b/i
  );

  if (match) {
    const month = parseMonth(match[1]);
    const day = Number(match[2]);
    const parsedYear = 2000 + Number(match[3]);

    if (month !== null) {
      return new Date(Date.UTC(parsedYear, month, day));
    }
  }

  // Aug 16 / 16 Aug
  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/i);

  if (match) {
    const month = parseMonth(match[1]);
    const day = Number(match[2]);

    if (month !== null) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\b/i);

  if (match) {
    const day = Number(match[1]);
    const month = parseMonth(match[2]);

    if (month !== null) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  // ISO timestamps / common machine-readable values.
  if (/^\d{4}-\d{2}-\d{2}T/i.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function dateRegex(): RegExp {
  const month =
    '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

  return new RegExp(
    [
      `\\b\\d{1,2}\\s+${month}\\s*['’]\\s*\\d{2}\\b`,
      `\\b${month}\\s+\\d{1,2}\\s*['’]\\s*\\d{2}\\b`,
      `\\b\\d{1,2}\\s+${month}\\s+\\d{4}\\b`,
      `\\b${month}\\s+\\d{1,2},?\\s+\\d{4}\\b`,
      `\\b\\d{4}-\\d{2}-\\d{2}\\b`,
      `\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}\\b`,
      `\\b${month}\\s+\\d{1,2}\\b`,
      `\\b\\d{1,2}\\s+${month}\\b`,
    ].join('|'),
    'i'
  );
}

function normalizeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDeadlineLabel(value: string): string {
  return cleanText(value)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b(the|official|date|time|on|at)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deadlineKey(title: string): string {
  const value = cleanText(title).toLowerCase();

  if (
    /registration|application/.test(value) &&
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
    /code freeze|final submission|submission/.test(value) &&
    /deadline|due|close|closing|final|freeze/.test(value)
  ) {
    return 'final-submission';
  }

  if (/event/.test(value) && /start|begin/.test(value)) {
    return 'event-start';
  }

  if (/event/.test(value) && /end/.test(value)) {
    return 'event-end';
  }

  if (/hackathon/.test(value) && /start|begin/.test(value)) {
    return 'event-start';
  }

  if (/hackathon/.test(value) && /end/.test(value)) {
    return 'event-end';
  }

  if (/proposal/.test(value)) return 'proposal';
  if (/abstract/.test(value)) return 'abstract';
  if (/presentation/.test(value)) return 'presentation';
  if (/speaker/.test(value)) return 'speaker';
  if (/judging/.test(value)) return 'judging';
  if (/winner/.test(value)) return 'winners';

  return normalizeDeadlineLabel(value);
}

function deadlinePriority(title: string): number {
  const key = deadlineKey(title);

  if (key === 'final-submission') return 100;
  if (key === 'registration-close') return 85;
  if (key === 'proposal') return 75;
  if (key === 'abstract') return 75;
  if (key === 'presentation') return 75;
  if (key === 'speaker') return 70;
  if (key === 'event-end') return 60;
  if (key === 'event-start') return 40;
  if (key === 'judging') return 30;
  if (key === 'winners') return 20;

  return 50;
}

function extractDeadlineTitle(label: string): string {
  const lower = cleanText(label).toLowerCase();

  if (
    /registration|application/.test(lower) &&
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

  if (
    (/event|hackathon/.test(lower)) &&
    /start|begin/.test(lower)
  ) {
    return 'Event Starts';
  }

  if (
    (/event|hackathon/.test(lower)) &&
    /end/.test(lower)
  ) {
    return 'Event Ends';
  }

  if (
    /code\s+freeze/.test(lower) &&
    /submission|deadline|freeze/.test(lower)
  ) {
    return 'Code Freeze / Submission Deadline';
  }

  if (
    /final\s+submission/.test(lower)
  ) {
    return 'Final Submission Deadline';
  }

  if (
    /submission/.test(lower) &&
    /deadline|due|close|closing|last date/.test(lower)
  ) {
    return 'Submission Deadline';
  }

  if (/judging/.test(lower)) {
    return 'Judging';
  }

  if (/winner/.test(lower)) {
    return 'Winners Announced';
  }

  if (/write\s*up/.test(lower)) {
    return 'Write Up Deadline';
  }

  if (/proposal/.test(lower)) {
    return 'Proposal Submission';
  }

  if (/abstract/.test(lower)) {
    return 'Abstract Submission';
  }

  if (/presentation/.test(lower)) {
    return 'Presentation Submission';
  }

  if (/speaker/.test(lower)) {
    return 'Speaker Deadline';
  }

  return cleanText(label).slice(0, 100) || 'Official Event Deadline';
}

function extractDeadlines(text: string): AnalyzedDeadline[] {
  const normalizedText = decodeHtml(text).replace(/\u00a0/g, ' ');
  const lines = normalizedText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const sourceYear = inferSourceYear(normalizedText);

  const keyword =
    /\b(registration|application|submission|deadline|closing|close|proposal|abstract|presentation|speaker|final|last date|due|event start|event end|event starts|event ends|judging|team formation|specification|code freeze|write up|winners?)\b/i;

  const candidates: Array<
    AnalyzedDeadline & {
      key: string;
      priority: number;
      order: number;
    }
  > = [];

  function addCandidate(
    labelSource: string,
    rawDate: string,
    order: number
  ): void {
    const parsed = parseDateCandidate(rawDate, sourceYear);

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return;
    }

    const label = cleanText(
      labelSource
        .replace(rawDate, ' ')
        .replace(/\s+/g, ' ')
    );

    if (!label || !keyword.test(label)) {
      return;
    }

    const title = extractDeadlineTitle(label);
    const key = deadlineKey(title);

    candidates.push({
      title,
      date: normalizeDate(parsed),
      type: 'official',
      verified: true,
      key,
      priority: deadlinePriority(title),
      order,
    });
  }

  const hasDate = (line: string): string | null => {
    return line.match(dateRegex())?.[0] ?? null;
  };

  const isTimeOnly = (line: string): boolean => {
    return /^\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*[A-Z]{2,5})?$/i.test(
      cleanText(line)
    );
  };

  /*
   * PASS 1
   * Normal line-oriented timeline extraction.
   *
   * Important:
   * - never borrow a time-only line
   * - never cross another milestone boundary
   * - only pair with an actual date
   */
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!keyword.test(line)) {
      continue;
    }

    const sameLineDate = hasDate(line);

    if (sameLineDate) {
      addCandidate(line, sameLineDate, i);
      continue;
    }

    for (let offset = 1; offset <= 5; offset++) {
      const next = lines[i + offset];

      if (!next) break;

      if (isTimeOnly(next)) {
        continue;
      }

      const nextDate = hasDate(next);

      if (nextDate) {
        addCandidate(line, nextDate, i);
        break;
      }

      if (keyword.test(next)) {
        break;
      }
    }
  }

  /*
   * PASS 2
   * Flattened React/SPA text.
   *
   * We locate each known milestone and search only inside that milestone's
   * local window, preventing one milestone from stealing another one's date.
   */
  const flat = cleanText(normalizedText);

  const milestoneRegex =
    /(?:registration\s+(?:opens?|open|starts?|begins?|closes?|closing|deadline)|application\s+(?:deadline|closes?|closing)|hackathon\s+(?:begins?|starts?|ends?)|event\s+(?:starts?|ends?)|final\s+submission(?:\s+deadline)?|code\s+freeze(?:\s+and\s+submission\s+deadline)?|submission\s+(?:deadline|closes?|closing)|proposal\s+(?:submission|deadline)|abstract\s+(?:submission|deadline)|presentation\s+(?:submission|deadline)|speaker\s+(?:deadline|submission)|judging(?:\s+(?:panel\s+announced|window))?|team\s+formation|full\s+specification\s+published|write\s*up\s+quest\s+closes?|winners?\s+announced)/gi;

  const milestoneMatches = [...flat.matchAll(milestoneRegex)];

  for (let i = 0; i < milestoneMatches.length; i++) {
    const match = milestoneMatches[i];
    const label = match[0];

    const start = (match.index ?? 0) + label.length;

    const end =
      milestoneMatches[i + 1]?.index ??
      Math.min(flat.length, start + 220);

    const localWindow = flat.slice(start, end);
    const date = localWindow.match(dateRegex())?.[0];

    if (date) {
      addCandidate(label, date, i);
    }
  }

  /*
   * PASS 3
   * Explicit same-sentence patterns:
   *
   * "Submission deadline: 28 Sep 2026"
   * "Registration closes on Sep 15, 2026"
   */
  const sentenceRegex =
    /((?:registration|application|hackathon|event|submission|proposal|abstract|presentation|speaker|judging|team formation|full specification|code freeze|write\s*up quest|winners?)[^.!?\n]{0,120}?)(?:\bon\b|\bby\b|\buntil\b|\bat\b|:|-)\s*((?:\d{1,2}\s+[A-Za-z]+\s*['’]\s*\d{2}|\d{1,2}\s+[A-Za-z]+(?:,?\s+\d{4})?|[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}))/gi;

  for (const match of flat.matchAll(sentenceRegex)) {
    if (match[1] && match[2]) {
      addCandidate(match[1], match[2], 10_000);
    }
  }

  /*
   * PASS 4
   * Deduplicate by logical milestone.
   * Later values win only for the SAME logical milestone.
   */
  const best = new Map<string, (typeof candidates)[number]>();

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
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;

      return b.priority - a.priority;
    })
    .slice(0, 50)
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
  const normalizedText = decodeHtml(text).replace(/\u00a0/g, ' ');

  const lines = normalizedText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const found = new Map<string, AnalyzedRequirement>();

  const addRequirement = (
    value: string,
    requiredBy: string
  ): void => {
    const candidate = cleanText(value)
      .replace(/^[\s•·▪◦|;*,\-–—✓✔☐☑]+/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();

    if (candidate.length < 4 || candidate.length > 220) {
      return;
    }

    if (!/[A-Za-z]/.test(candidate)) {
      return;
    }

    if (
      /^(requirements?|eligibility|submission|details?|rules?|guidelines?|judging criteria|evaluation criteria|important dates|timeline|schedule|contact|faq|about|prizes?|register|registration)$/i.test(
        candidate
      )
    ) {
      return;
    }

    const key = candidate.toLowerCase();

    if (found.has(key)) {
      return;
    }

    found.set(key, {
      title: candidate,
      completed: false,
      requiredBy,
      ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
      verified: true,
    });
  };

  const headingRegex =
    /^(?:what you need to submit|what to submit|submission checklist|submission requirements?|requirements?|deliverables?|documents required|what to build|deliverables and requirements)$/i;

  let inSection = false;
  let remaining = 0;
  let sectionTitle = 'Event Requirements';

  for (const line of lines) {
    const isHeading =
      headingRegex.test(line) ||
      (
        /what you need to submit|submission requirements?|submission checklist|deliverables?|documents required|what to build/i.test(
          line
        ) &&
        line.length < 150
      );

    if (isHeading) {
      inSection = true;
      remaining = 50;
      sectionTitle = line;
      continue;
    }

    if (!inSection) {
      continue;
    }

    remaining--;

    if (remaining < 0) {
      inSection = false;
      continue;
    }

    if (
      /^(important dates|timeline|schedule|contact|faq|about|prizes?|register|registration|judging(?!\.md)|eligibility|rules?|evaluation|criteria)\b/i.test(
        line
      )
    ) {
      inSection = false;
      continue;
    }

    addRequirement(line, sectionTitle);
  }

  /*
   * Flattened page fallback.
   */
  if (found.size === 0) {
    const flat = cleanText(normalizedText);

    const sectionMatch = flat.match(
      /what\s+you\s+need\s+to\s+submit|what\s+to\s+submit|submission\s+requirements?|submission\s+checklist|what\s+to\s+build/i
    );

    if (sectionMatch?.index !== undefined) {
      const start =
        sectionMatch.index + sectionMatch[0].length;

      const tail = flat.slice(start);

      const stopMatch = tail.match(
        /\b(?:important dates|timeline|schedule|judging|eligibility|rules?|prizes?|faq|contact|about)\b/i
      );

      const section = tail.slice(
        0,
        stopMatch?.index ?? Math.min(tail.length, 2500)
      );

      const items = section.split(
        /\s*(?:•|·|▪|◦|\||;)\s*/
      );

      for (const item of items) {
        addRequirement(item, sectionMatch[0]);
      }
    }
  }

  /*
   * Last-resort instruction extraction.
   */
  if (found.size === 0) {
    const flat = cleanText(normalizedText);

    const instructionRegex =
      /(?:must\s+(?:submit|provide|upload)|submit|provide|upload|include|requires?)\s+([^.;]{4,180})/gi;

    for (const match of flat.matchAll(instructionRegex)) {
      const candidate = match[1]?.trim();

      if (!candidate) continue;

      addRequirement(candidate, 'Submission Instructions');
    }
  }

  return [...found.values()].slice(0, 50);
}

function extractResources(
  html: string,
  sourceUrl: string
): AnalyzedResource[] {
  const found = new Map<string, AnalyzedResource>();

  const anchorRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = cleanText(match[1]);
    const name = cleanText(stripHtml(match[2]));

    if (!href || !name) continue;
    if (name.length < 3 || name.length > 180) continue;

    let absolute: string;

    try {
      absolute = new URL(href, sourceUrl).toString();
    } catch {
      continue;
    }

    const combined = `${name} ${absolute}`.toLowerCase();

    if (
      !/guideline|rulebook|rules|template|problem statement|starter|handbook|brochure|schedule|resource|download|brief|kit|documentation|docs|pdf/.test(
        combined
      )
    ) {
      continue;
    }

    const isTemplate =
      /template|starter|kit|boilerplate/.test(combined);

    const isDocument =
      /pdf|guideline|rulebook|rules|handbook|brief|brochure|problem statement|schedule|documentation|docs/.test(
        combined
      );

    const fileType = /\.pdf(?:$|[?#])/i.test(absolute)
      ? 'PDF'
      : isTemplate
        ? 'Template'
        : 'URL';

    found.set(absolute, {
      name,
      type: isTemplate
        ? 'template'
        : isDocument
          ? 'document'
          : 'link',
      fileType,
      source: 'Extracted from event page',
      url: absolute,
    });
  }

  return [...found.values()].slice(0, 30);
}

function extractDescription(html: string): string {
  return (
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'description') ||
    ''
  );
}

function extractStructuredDates(html: string): string[] {
  const dates: string[] = [];

  const jsonLdRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);

      const stack = Array.isArray(parsed)
        ? parsed
        : [parsed];

      for (const item of stack) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        for (const key of [
          'startDate',
          'endDate',
          'validThrough',
          'expires',
          'doorTime',
        ]) {
          if (typeof item[key] === 'string') {
            dates.push(item[key]);
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return dates;
}

async function fetchUrl(
  url: string
): Promise<{ html: string; finalUrl: string }> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Please enter a valid http(s) event URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) event URLs are supported.');
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(
        `The event page returned HTTP ${response.status}.`
      );
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new Error(
        'That URL did not return an HTML event page.'
      );
    }

    const contentLength = Number(
      response.headers.get('content-length') || 0
    );

    if (contentLength > MAX_SOURCE_BYTES) {
      throw new Error(
        'The event page is too large to analyze.'
      );
    }

    const html = await response.text();

    if (
      Buffer.byteLength(html, 'utf8') > MAX_SOURCE_BYTES
    ) {
      throw new Error(
        'The event page is too large to analyze.'
      );
    }

    return {
      html,
      finalUrl: response.url || parsed.toString(),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'The event page took too long to respond.'
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
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

    const playwright = require('playwright');

    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1200,
      },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    });

    await page
      .waitForLoadState('networkidle', {
        timeout: 15_000,
      })
      .catch(() => undefined);

    // Give SPA frameworks time to finish rendering.
    await page.waitForTimeout(2_000);

    const bodyText = await page
      .locator('body')
      .innerText({
        timeout: 7_000,
      })
      .catch(() => '');

    const html = await page.content();

    return {
      html: html.slice(0, MAX_SOURCE_BYTES),
      text: bodyText.slice(0, MAX_SOURCE_BYTES),
      finalUrl: page.url() || url,
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
        'Browser rendering is unavailable because Playwright is not installed.'
      );
    }

    if (
      /Executable doesn't exist|download new browsers/i.test(
        message
      )
    ) {
      throw new Error(
        'Chromium is not installed on the server.'
      );
    }

    if (
      /error while loading shared libraries|missing dependencies|libnss3|libatk/i.test(
        message
      )
    ) {
      throw new Error(
        'The server is missing Chromium system libraries.'
      );
    }

    throw new Error(
      `The event page could not be rendered: ${message}`
    );
  } finally {
    if (browser) {
      await browser.close().catch(
        () => undefined
      );
    }
  }
}

function choosePrimaryDeadline(
  deadlines: AnalyzedDeadline[]
): string {
  if (deadlines.length === 0) {
    return '';
  }

  const submissionCandidates = deadlines.filter(
    (deadline) =>
      /final submission|submission deadline|code freeze|submission/i.test(
        deadline.title
      ) &&
      !/registration/i.test(deadline.title)
  );

  if (submissionCandidates.length > 0) {
    return [...submissionCandidates].sort((a, b) =>
      a.date.localeCompare(b.date)
    )[
      submissionCandidates.length - 1
    ].date;
  }

  const actionableCandidates = deadlines.filter(
    (deadline) =>
      /deadline|due|closing|close|last date|registration/i.test(
        deadline.title
      ) &&
      !/winner|judging/i.test(deadline.title)
  );

  if (actionableCandidates.length > 0) {
    return [...actionableCandidates].sort((a, b) =>
      a.date.localeCompare(b.date)
    )[
      actionableCandidates.length - 1
    ].date;
  }

  const nonPostEventCandidates = deadlines.filter(
    (deadline) =>
      !/winner|judging/i.test(deadline.title)
  );

  if (nonPostEventCandidates.length > 0) {
    return [...nonPostEventCandidates].sort((a, b) =>
      a.date.localeCompare(b.date)
    )[
      nonPostEventCandidates.length - 1
    ].date;
  }

  return [...deadlines].sort((a, b) =>
    a.date.localeCompare(b.date)
  )[deadlines.length - 1].date;
}

export async function analyzeEventSource(
  input: string
): Promise<EventAnalysisResult> {
  const source = input.trim();

  if (!source) {
    throw new Error('Event source is required.');
  }

  let html = '';
  let finalUrl: string | undefined;
  let renderedText = '';

  const looksLikeUrl =
    /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(
      source
    );

  const isUrl = looksLikeUrl;

  const urlSource = /^https?:\/\//i.test(source)
    ? source
    : `https://${source}`;

  if (isUrl) {
    /*
     * IMPORTANT:
     *
     * We do NOT trust raw HTML as the final source for event extraction.
     * Many modern platforms return a JS shell / partial data from fetch().
     *
     * Raw HTML is fetched first for metadata/fallback, but the rendered
     * browser view becomes the preferred extraction source.
     */
    let fetchedError: Error | null = null;

    try {
      const fetched = await fetchUrl(urlSource);

      html = fetched.html;
      finalUrl = fetched.finalUrl;
    } catch (error) {
      fetchedError =
        error instanceof Error
          ? error
          : new Error(String(error));
    }

    /*
     * Always attempt browser rendering for URL analysis.
     * This is intentionally generic and not tied to any platform.
     */
    try {
      const rendered = await renderUrl(
        finalUrl || urlSource
      );

      html = rendered.html;
      renderedText = rendered.text;
      finalUrl = rendered.finalUrl;

      console.log(
        `[event-analysis] Rendered source successfully: ${finalUrl}`
      );
    } catch (renderError) {
      console.log(
        `[event-analysis] Browser render failed: ${
          renderError instanceof Error
            ? renderError.message
            : String(renderError)
        }`
      );

      /*
       * If raw fetch succeeded, continue with raw HTML.
       * This keeps static pages working even when Playwright is unavailable.
       */
      if (!html && fetchedError) {
        throw fetchedError;
      }
    }
  } else {
    html = `<main>${source.replace(
      /\n/g,
      '<br>'
    )}</main>`;
  }

  /*
   * Prefer Playwright's visible body text.
   * Only fall back to HTML stripping when rendering wasn't possible.
   */
  const visibleText = isUrl
    ? renderedText.trim() || stripHtml(html)
    : stripHtml(html);

  const lines = visibleText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const firstUsefulLine =
    lines.find(
      (line) =>
        line.length > 2 &&
        !/^loading(?:\.\.\.)?$/i.test(line)
    ) || 'Untitled Event';

  const title =
    isUrl
      ? extractTitle(html, finalUrl)
      : firstUsefulLine.slice(0, 200);

  const extractedDescription =
    isUrl
      ? extractDescription(html)
      : '';

  const description =
    extractedDescription ||
    lines
      .filter(
        (line) =>
          line !== title &&
          !/^(loading|register|login|sign up)$/i.test(
            line
          )
      )
      .slice(0, 12)
      .join(' ')
      .slice(0, 5000);

  const combined =
    `${title}\n${description}\n${visibleText}`;

  const type = inferType(combined);

  const deadlines = extractDeadlines(
    visibleText
  );

  const structuredDates =
    extractStructuredDates(html)
      .map(
        (value) =>
          parseDateCandidate(
            value,
            inferSourceYear(visibleText)
          )?.getTime()
      )
      .filter(
        (value): value is number =>
          Number.isFinite(value)
      );

  /*
   * Do NOT fail the complete event analysis merely because a deadline
   * wasn't found. The rest of the event can still be extracted.
   */
  const requirements = extractRequirements(
    visibleText,
    finalUrl
  );

  const resources =
    finalUrl
      ? extractResources(html, finalUrl)
      : [];

  const participation =
    inferParticipation(combined);

  const finalDeadline =
    choosePrimaryDeadline(deadlines);

  const warnings: string[] = [];

  if (title === 'Untitled Event') {
    warnings.push(
      'The event name could not be identified confidently.'
    );
  }

  if (deadlines.length === 0) {
    if (structuredDates.length > 0) {
      warnings.push(
        'Event dates were found, but no clearly labelled deadline was identified.'
      );
    } else {
      warnings.push(
        'No clearly labelled event deadline was identified on the source page.'
      );
    }
  }

  if (requirements.length === 0) {
    warnings.push(
      'No clear requirements or deliverables section was found.'
    );
  }

  if (resources.length === 0) {
    warnings.push(
      'No linked guidelines, templates, or supporting resources were detected.'
    );
  }

  if (
    participation.teamSizeMax === 1 &&
    !participation.individualAllowed
  ) {
    warnings.push(
      'No explicit team-size limit was detected.'
    );
  }

  const confidenceScore =
    (title !== 'Untitled Event' ? 1 : 0) +
    (deadlines.length > 0 ? 1 : 0) +
    (requirements.length > 0 ? 1 : 0) +
    (resources.length > 0 ? 1 : 0) +
    (participation.teamSizeMax > 1 ||
    participation.individualAllowed
      ? 1
      : 0);

  const overall: EventAnalysisResult['confidence']['overall'] =
    confidenceScore >= 4
      ? 'high'
      : confidenceScore >= 2
        ? 'medium'
        : 'low';

  return {
    ...(finalUrl
      ? { sourceUrl: finalUrl }
      : {}),
    sourceType: isUrl ? 'url' : 'text',

    event: {
      name: title,
      type,
      description: description.slice(0, 5000),
      status: 'on-track',
      finalDeadline,
      progress: 0,
      healthScore: 100,

      teamSize: participation.teamSize,
      teamSizeMin: participation.teamSizeMin,
      teamSizeMax: participation.teamSizeMax,
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
        title !== 'Untitled Event'
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