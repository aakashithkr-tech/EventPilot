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
const MAX_CAPTURED_RESPONSE_BYTES = 700 * 1024;
const MAX_CAPTURED_JSON_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 35_000;

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

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
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
        /<\/(p|div|section|article|li|h[1-6]|tr|td|th|header|footer|main|aside|nav)>/gi,
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
    if (match?.[1]) return cleanText(match[1]);
  }

  return undefined;
}

function trimSiteSuffix(title: string): string {
  return title
    .replace(
      /\s*[|•–—-]\s*(unstop|devpost|eventbrite|meetup|hack2skill|linkedin|hackbriven)\s*$/i,
      ''
    )
    .trim()
    .slice(0, 200);
}

function isGenericSiteTitle(title: string): boolean {
  return /^(hackbriven|unstop|devpost|eventbrite|meetup|hack2skill|linkedin|home|event|events|loading(?: event)?\.?|untitled event)$/i.test(
    cleanText(title)
  );
}

function extractTitle(html: string, sourceUrl?: string): string {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle && !isGenericSiteTitle(ogTitle)) {
    return trimSiteSuffix(ogTitle);
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) {
    const cleaned = trimSiteSuffix(cleanText(title));
    if (!isGenericSiteTitle(cleaned)) return cleaned;
  }

  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./i, '');
      return host
        .split('.')[0]
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      // ignore
    }
  }

  return 'Untitled Event';
}

function inferType(text: string): EventAnalysisResult['event']['type'] {
  const value = text.toLowerCase();

  if (/\b(conference|summit|speaker|keynote|panel|symposium)\b/.test(value)) {
    return 'conference';
  }

  if (/\b(workshop|bootcamp|masterclass|training|hands[- ]on)\b/.test(value)) {
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
    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

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

  const upTo = value.match(
    /\b(?:up\s+to|maximum|max\.?|at\s+most)\s*(\d+)\s*(?:members?|participants?|people)\b/i
  );

  if (upTo) {
    const max = Number(upTo[1]);
    const min = individualAllowed ? 1 : 2;

    if (Number.isFinite(max)) {
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
          : `Teams of ${size} members`,
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
    teamSize: 0,
    teamSizeMin: 0,
    teamSizeMax: 0,
    individualAllowed: false,
    participationDetails: 'Team size not explicitly detected',
  };
}

function inferSourceYear(text: string): number {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length === 0) return new Date().getUTCFullYear();

  const counts = new Map<number, number>();
  for (const year of years) counts.set(year, (counts.get(year) ?? 0) + 1);

  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0]
  )[0][0];
}

function parseDateCandidate(raw: string, fallbackYear?: number): Date | null {
  const value = cleanText(raw)
    .replace(/\b(st|nd|rd|th)\b/gi, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const year = fallbackYear ?? new Date().getUTCFullYear();

  let match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
    }
  }

  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/i);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
    }
  }

  match = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) {
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
  }

  match = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const parsedYear = Number(match[3]);

    if (first > 12) {
      return new Date(Date.UTC(parsedYear, second - 1, first));
    }

    return new Date(Date.UTC(parsedYear, first - 1, second));
  }

  match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\s*['’]\s*(\d{2})\b/i);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(
        Date.UTC(2000 + Number(match[3]), month, Number(match[1]))
      );
    }
  }

  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\s*['’]\s*(\d{2})\b/i);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(
        Date.UTC(2000 + Number(match[3]), month, Number(match[2]))
      );
    }
  }

  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/i);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(year, month, Number(match[2])));
    }
  }

  match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\b/i);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(year, month, Number(match[1])));
    }
  }

  if (/^\d{4}-\d{2}-\d{2}T/i.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
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
      `\\b${month}\\s+\\d{1,2}(?=\\s|$|,)`,
      `\\b\\d{1,2}\\s+${month}(?=\\s|$|,)`,
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

  if (/registration|application/.test(value) && /open|start|begin/.test(value)) {
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

  if (/event/.test(value) && /start|begin/.test(value)) return 'event-start';
  if (/event/.test(value) && /end/.test(value)) return 'event-end';
  if (/hackathon/.test(value) && /start|begin/.test(value)) return 'event-start';
  if (/hackathon/.test(value) && /end/.test(value)) return 'event-end';
  if (/judging/.test(value)) return 'judging';
  if (/winner/.test(value)) return 'winners';
  if (/write\s*up/.test(value)) return 'write-up';
  if (/proposal/.test(value)) return 'proposal';
  if (/abstract/.test(value)) return 'abstract';
  if (/presentation/.test(value)) return 'presentation';
  if (/speaker/.test(value)) return 'speaker';

  return normalizeDeadlineLabel(value);
}

function deadlinePriority(title: string): number {
  const key = deadlineKey(title);
  if (key === 'final-submission') return 100;
  if (key === 'registration-close') return 85;
  if (key === 'proposal' || key === 'abstract' || key === 'presentation') return 75;
  if (key === 'speaker') return 70;
  if (key === 'event-end') return 60;
  if (key === 'event-start') return 40;
  if (key === 'judging') return 30;
  if (key === 'winners') return 20;
  return 50;
}

function extractDeadlineTitle(label: string): string {
  const lower = cleanText(label).toLowerCase();

  if (/registration|application/.test(lower) && /open|start|begin/.test(lower)) {
    return 'Registration Opens';
  }

  if (
    /registration|application/.test(lower) &&
    /close|closing|deadline|last date|due/.test(lower)
  ) {
    return 'Registration Closes';
  }

  if (/event|hackathon/.test(lower) && /start|begin/.test(lower)) {
    return 'Event Starts';
  }

  if (/event|hackathon/.test(lower) && /end/.test(lower)) {
    return 'Event Ends';
  }

  if (/code\s+freeze/.test(lower)) return 'Code Freeze / Submission Deadline';
  if (/final\s+submission/.test(lower)) return 'Final Submission Deadline';

  if (/submission/.test(lower) && /deadline|due|close|closing|last date/.test(lower)) {
    return 'Submission Deadline';
  }

  if (/judging/.test(lower)) return 'Judging';
  if (/winner/.test(lower)) return 'Winners Announced';
  if (/write\s*up/.test(lower)) return 'Write Up Deadline';
  if (/proposal/.test(lower)) return 'Proposal Submission';
  if (/abstract/.test(lower)) return 'Abstract Submission';
  if (/presentation/.test(lower)) return 'Presentation Submission';
  if (/speaker/.test(lower)) return 'Speaker Deadline';

  return cleanText(label).slice(0, 100) || 'Official Event Deadline';
}

function extractDeadlines(text: string): AnalyzedDeadline[] {
  const normalizedText = decodeHtml(text).replace(/\u00a0/g, ' ');
  const lines = normalizedText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
  const sourceYear = inferSourceYear(normalizedText);

  const candidates: Array<
    AnalyzedDeadline & { key: string; priority: number; order: number }
  > = [];

  const keyword =
    /\b(registration|application|submission|deadline|closing|close|proposal|abstract|presentation|speaker|final|last date|due|event start|event end|event starts|event ends|judging|team formation|specification|code freeze|write up|winners?)\b/i;

  const addCandidate = (labelSource: string, rawDate: string, order: number) => {
    const date = parseDateCandidate(rawDate, sourceYear);
    if (!date || Number.isNaN(date.getTime())) return;

    const label = cleanText(
      labelSource.replace(rawDate, ' ').replace(/\s+/g, ' ')
    );
    if (!label || !keyword.test(label)) return;

    const title = extractDeadlineTitle(label);
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

  const findDate = (value: string): string | null => value.match(dateRegex())?.[0] ?? null;
  const isTimeOnly = (value: string): boolean =>
    /^\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*[A-Z]{2,5})?$/i.test(cleanText(value));

  // Structured/line-oriented text.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!keyword.test(line)) continue;

    const sameLineDate = findDate(line);
    if (sameLineDate) {
      addCandidate(line, sameLineDate, i);
      continue;
    }

    for (let offset = 1; offset <= 6; offset++) {
      const next = lines[i + offset];
      if (!next) break;
      if (isTimeOnly(next)) continue;

      const nextDate = findDate(next);
      if (nextDate) {
        addCandidate(line, nextDate, i);
        break;
      }

      if (keyword.test(next)) break;
    }
  }

  // Flattened SPA text.
  const flat = cleanText(normalizedText);
  const milestoneRegex =
    /(?:registration\s+(?:opens?|open|starts?|begins?|closes?|closing|deadline)|application\s+(?:deadline|closes?|closing)|hackathon\s+(?:begins?|starts?|ends?)|event\s+(?:starts?|ends?)|final\s+submission(?:\s+deadline)?|code\s+freeze(?:\s+and\s+submission\s+deadline)?|submission\s+(?:deadline|closes?|closing)|proposal\s+(?:submission|deadline)|abstract\s+(?:submission|deadline)|presentation\s+(?:submission|deadline)|speaker\s+(?:deadline|submission)|judging(?:\s+(?:panel\s+announced|window))?|team\s+formation|full\s+specification\s+published|write\s*up\s+quest\s+closes?|winners?\s+announced)/gi;

  const matches = [...flat.matchAll(milestoneRegex)];
  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][0];
    const start = (matches[i].index ?? 0) + label.length;
    const end = matches[i + 1]?.index ?? Math.min(flat.length, start + 240);
    const window = flat.slice(start, end);
    const date = findDate(window);
    if (date) addCandidate(label, date, i);
  }

  // Sentence-style forms.
  const sentenceRegex =
    /((?:registration|application|hackathon|event|submission|proposal|abstract|presentation|speaker|judging|team formation|full specification|code freeze|write\s*up quest|winners?)[^.!?\n]{0,120}?)(?:\bon\b|\bby\b|\buntil\b|\bat\b|:|-)\s*((?:\d{1,2}\s+[A-Za-z]+\s*['’]\s*\d{2}|\d{1,2}\s+[A-Za-z]+(?:,?\s+\d{4})?|[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}))/gi;

  for (const match of flat.matchAll(sentenceRegex)) {
    if (match[1] && match[2]) addCandidate(match[1], match[2], 10_000);
  }

  const best = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.key);
    if (
      !existing ||
      candidate.date > existing.date ||
      (candidate.date === existing.date && candidate.priority > existing.priority)
    ) {
      best.set(candidate.key, candidate);
    }
  }

  return [...best.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 50)
    .map(({ key: _key, priority: _priority, order: _order, ...deadline }) => deadline);
}

function extractRequirements(text: string, sourceUrl?: string): AnalyzedRequirement[] {
  const normalized = decodeHtml(text).replace(/\u00a0/g, ' ');
  const lines = normalized.split(/\r?\n/).map(cleanText).filter(Boolean);
  const found = new Map<string, AnalyzedRequirement>();

  const addRequirement = (value: string, requiredBy: string) => {
    const candidate = cleanText(value)
      .replace(/^[\s•·▪◦|;*,\-–—✓✔☐☑]+/, '')
      .replace(/^\d+[.)]\s*/, '');

    if (candidate.length < 4 || candidate.length > 220) return;
    if (!/[A-Za-z]/.test(candidate)) return;
    if (
      /^(requirements?|eligibility|submission|details?|rules?|guidelines?|judging criteria|evaluation criteria|important dates|timeline|schedule|contact|faq|about|prizes?|register|registration)$/i.test(
        candidate
      )
    ) return;

    const key = candidate.toLowerCase();
    if (found.has(key)) return;

    found.set(key, {
      title: candidate,
      completed: false,
      requiredBy,
      ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
      verified: true,
    });
  };

  const headingRegex =
    /^(?:what you need to submit|what to submit|submission checklist|submission requirements?|requirements?|deliverables?|documents required|what to build|submission instructions)$/i;

  let inSection = false;
  let remaining = 0;
  let sectionTitle = 'Event Requirements';

  for (const line of lines) {
    const isHeading =
      headingRegex.test(line) ||
      (/what you need to submit|submission requirements?|submission checklist|deliverables?|documents required|what to build/i.test(
        line
      ) && line.length < 150);

    if (isHeading) {
      inSection = true;
      remaining = 50;
      sectionTitle = line;
      continue;
    }

    if (!inSection) continue;

    remaining -= 1;
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

  if (found.size === 0) {
    const flat = cleanText(normalized);
    const sectionMatch = flat.match(
      /what\s+you\s+need\s+to\s+submit|what\s+to\s+submit|submission\s+requirements?|submission\s+checklist|what\s+to\s+build/i
    );

    if (sectionMatch?.index !== undefined) {
      const start = sectionMatch.index + sectionMatch[0].length;
      const tail = flat.slice(start);
      const stopMatch = tail.match(
        /\b(?:important dates|timeline|schedule|judging|eligibility|rules?|prizes?|faq|contact|about)\b/i
      );
      const section = tail.slice(0, stopMatch?.index ?? 2500);

      for (const item of section.split(/\s*(?:•|·|▪|◦|\||;)\s*/)) {
        addRequirement(item, sectionMatch[0]);
      }
    }
  }

  if (found.size === 0) {
    const flat = cleanText(normalized);
    const instructionRegex =
      /(?:must\s+(?:submit|provide|upload)|submit|provide|upload|include|requires?)\s+([^.;]{4,180})/gi;

    for (const match of flat.matchAll(instructionRegex)) {
      const candidate = match[1]?.trim();
      if (candidate) addRequirement(candidate, 'Submission Instructions');
    }
  }

  return [...found.values()].slice(0, 50);
}

function extractResources(html: string, sourceUrl: string): AnalyzedResource[] {
  const found = new Map<string, AnalyzedResource>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  const add = (name: string, href: string) => {
    const cleanedName = cleanText(name);
    if (!cleanedName || cleanedName.length < 3 || cleanedName.length > 180) return;

    let absolute: string;
    try {
      absolute = new URL(href, sourceUrl).toString();
    } catch {
      return;
    }

    const combined = `${cleanedName} ${absolute}`.toLowerCase();
    if (
      !/guideline|rulebook|rules|template|problem statement|starter|handbook|brochure|schedule|resource|download|brief|kit|documentation|docs|pdf/.test(
        combined
      )
    ) return;

    const isTemplate = /template|starter|kit|boilerplate/.test(combined);
    const isDocument = /pdf|guideline|rulebook|rules|handbook|brief|brochure|problem statement|schedule|documentation|docs/.test(
      combined
    );

    found.set(absolute, {
      name: cleanedName,
      type: isTemplate ? 'template' : isDocument ? 'document' : 'link',
      fileType: /\.pdf(?:$|[?#])/i.test(absolute)
        ? 'PDF'
        : isTemplate
          ? 'Template'
          : 'URL',
      source: 'Extracted from event page',
      url: absolute,
    });
  };

  while ((match = anchorRegex.exec(html)) !== null) {
    add(stripHtml(match[2]), match[1].trim());
  }

  // Also detect resource URLs that were exposed by captured API/JSON data.
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  for (const raw of html.match(urlRegex) ?? []) {
    const url = raw.replace(/[),.;]+$/, '');
    if (/pdf|rulebook|guideline|template|problem|starter|handbook|brochure|schedule|docs/i.test(url)) {
      add(url.split('/').pop() || 'Event Resource', url);
    }
  }

  return [...found.values()].slice(0, 30);
}

function extractDescription(html: string): string {
  return extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
}

function extractStructuredDates(html: string): string[] {
  const dates: string[] = [];
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const stack = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of stack) {
        if (!item || typeof item !== 'object') continue;
        for (const key of ['startDate', 'endDate', 'validThrough', 'expires', 'doorTime']) {
          const value = (item as Record<string, unknown>)[key];
          if (typeof value === 'string') dates.push(value);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return dates;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenUnknown(value: unknown, path = '', output: string[] = []): string[] {
  if (output.join('\n').length >= MAX_CAPTURED_JSON_BYTES) return output;

  if (value === null || value === undefined) return output;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const cleaned = cleanText(String(value));
    if (cleaned && cleaned.length <= 1200) {
      output.push(path ? `${humanizeKey(path)}: ${cleaned}` : cleaned);
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenUnknown(item, path || `item ${index + 1}`, output));
    return output;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path} ${humanizeKey(key)}` : humanizeKey(key);
      flattenUnknown(child, childPath, output);
      if (output.join('\n').length >= MAX_CAPTURED_JSON_BYTES) break;
    }
  }

  return output;
}

async function fetchUrl(url: string): Promise<{ html: string; finalUrl: string }> {
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
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`The event page returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('That URL did not return an HTML event page.');
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SOURCE_BYTES) throw new Error('The event page is too large to analyze.');

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_SOURCE_BYTES) {
      throw new Error('The event page is too large to analyze.');
    }

    return { html, finalUrl: response.url || parsed.toString() };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The event page took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function renderUrl(url: string): Promise<{
  html: string;
  text: string;
  finalUrl: string;
  capturedDataText: string;
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
      viewport: { width: 1440, height: 1200 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      locale: 'en-US',
    });

    const origin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return '';
      }
    })();

    const capturedChunks: string[] = [];
    let capturedBytes = 0;

    page.on('response', async (response: any) => {
      try {
        if (capturedBytes >= MAX_CAPTURED_JSON_BYTES) return;

        const responseUrl = response.url();
        if (origin && !responseUrl.startsWith(origin)) return;

        const contentType = String(
          response.headers()['content-type'] || ''
        ).toLowerCase();

        const looksRelevant =
          /json|graphql|javascript|text\/plain|text\/html/.test(contentType) &&
          !/image|font|stylesheet|video|audio/.test(contentType);

        if (!looksRelevant) return;
        if (response.status() < 200 || response.status() >= 300) return;

        const body = await response.text();
        if (!body) return;

        const clipped = body.slice(0, MAX_CAPTURED_RESPONSE_BYTES);

        let dataText = '';
        if (/json|graphql/.test(contentType) || /^[\[{]/.test(clipped.trim())) {
          try {
            const parsed = JSON.parse(clipped);
            dataText = flattenUnknown(parsed).join('\n');
          } catch {
            dataText = cleanText(clipped);
          }
        } else {
          dataText = cleanText(clipped);
        }

        if (!dataText) return;

        const remaining = MAX_CAPTURED_JSON_BYTES - capturedBytes;
        const piece = dataText.slice(0, remaining);
        capturedChunks.push(piece);
        capturedBytes += piece.length;
      } catch {
        // Ignore individual network-response read failures.
      }
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    });

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

    // Wait for actual application content, not merely network idle.
    await page
      .waitForFunction(
        () => {
          const body = document.body?.innerText?.trim() || '';
          const normalized = body.toLowerCase();
          if (body.length < 250) return false;
          if (/^loading(?:\s+event)?\.{0,3}$/.test(normalized)) return false;
          return /event|registration|deadline|team|submission|venue|about|timeline/.test(normalized);
        },
        { timeout: 20_000 }
      )
      .catch(() => undefined);

    // Allow late hydration and client-side API data to settle.
    await page.waitForTimeout(3_000);

    // Trigger lazy-loaded content on long event pages.
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1_500);

    const bodyText = await page
      .locator('body')
      .innerText({ timeout: 10_000 })
      .catch(() => '');

    // Read common embedded application-state containers.
    const embeddedState = await page.evaluate(() => {
      const values: string[] = [];

      const nextData = document.querySelector('#__NEXT_DATA__');
      if (nextData?.textContent) values.push(nextData.textContent);

      for (const script of Array.from(document.scripts)) {
        const text = script.textContent || '';
        if (
          text.length > 50 &&
          /event|registration|deadline|submission|teamSize|team_size/i.test(text)
        ) {
          values.push(text.slice(0, 500000));
        }
      }

      return values.join('\n');
    }).catch(() => '');

    if (embeddedState) capturedChunks.push(embeddedState);

    const capturedDataText = capturedChunks.join('\n');
    const html = await page.content();

    console.log(
      `[event-analysis] Browser source acquired: url=${page.url()}, visibleText=${bodyText.length}, capturedData=${capturedDataText.length}`
    );

    return {
      html: html.slice(0, MAX_SOURCE_BYTES),
      text: bodyText.slice(0, MAX_SOURCE_BYTES),
      finalUrl: page.url() || url,
      capturedDataText: capturedDataText.slice(0, MAX_CAPTURED_JSON_BYTES),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/Cannot find module ['"]playwright['"]/.test(message)) {
      throw new Error('Browser rendering is unavailable because Playwright is not installed.');
    }

    if (/Executable doesn't exist|download new browsers/i.test(message)) {
      throw new Error('Chromium is not installed on the server.');
    }

    if (/error while loading shared libraries|missing dependencies|libnss3|libatk/i.test(message)) {
      throw new Error('The server is missing Chromium system libraries.');
    }

    throw new Error(`The event page could not be rendered: ${message}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function chooseBestTitle(
  html: string,
  visibleText: string,
  capturedDataText: string,
  sourceUrl?: string
): string {
  const metadataTitle = extractTitle(html, sourceUrl);
  if (!isGenericSiteTitle(metadataTitle)) return metadataTitle;

  const lines = `${capturedDataText}\n${visibleText}`
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const titleLike = lines.find((line) => {
    const lower = line.toLowerCase();
    if (isGenericSiteTitle(line)) return false;
    if (/^(event|events|home|about|contact|login|sign up|register|loading)/i.test(line)) return false;
    if (/^(registration|deadline|event starts?|event ends?|team size|submission|timeline)$/i.test(line)) return false;
    return (
      (/\b(hack|hackathon|challenge|competition|workshop|summit|conference)\b/i.test(line) ||
        /^[A-Z0-9][A-Z0-9 .&'_-]{3,100}$/.test(line)) &&
      line.length <= 120
    );
  });

  return titleLike?.slice(0, 200) || metadataTitle;
}

function choosePrimaryDeadline(deadlines: AnalyzedDeadline[]): string {
  if (deadlines.length === 0) return '';

  const submission = deadlines.filter(
    (d) =>
      /final submission|submission deadline|code freeze|submission/i.test(d.title) &&
      !/registration/i.test(d.title)
  );

  if (submission.length > 0) {
    return [...submission].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date;
  }

  const applicationOrDeadline = deadlines.filter(
    (d) =>
      /registration closes|application|deadline|due|closing|close|last date/i.test(d.title) &&
      !/winner|judging/i.test(d.title)
  );

  if (applicationOrDeadline.length > 0) {
    return [...applicationOrDeadline]
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)!.date;
  }

  const actionable = deadlines.filter((d) => !/winner|judging/i.test(d.title));
  if (actionable.length > 0) {
    return [...actionable].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date;
  }

  return [...deadlines].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date;
}

export async function analyzeEventSource(
  input: string
): Promise<EventAnalysisResult> {
  const source = input.trim();
  if (!source) throw new Error('Event source is required.');

  let html = '';
  let finalUrl: string | undefined;
  let renderedText = '';
  let capturedDataText = '';

  const isUrl = /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(source);
  const urlSource = /^https?:\/\//i.test(source) ? source : `https://${source}`;

  if (isUrl) {
    let fetchedError: Error | null = null;

    try {
      const fetched = await fetchUrl(urlSource);
      html = fetched.html;
      finalUrl = fetched.finalUrl;
    } catch (error) {
      fetchedError = error instanceof Error ? error : new Error(String(error));
      console.log(`[event-analysis] Direct fetch failed: ${fetchedError.message}`);
    }

    // Browser rendering is intentionally the preferred source for URL analysis.
    // This avoids treating a partial JS shell as if it were the event itself.
    try {
      const rendered = await renderUrl(finalUrl || urlSource);
      html = rendered.html || html;
      renderedText = rendered.text || '';
      capturedDataText = rendered.capturedDataText || '';
      finalUrl = rendered.finalUrl || finalUrl || urlSource;
    } catch (error) {
      const renderError = error instanceof Error ? error : new Error(String(error));
      console.log(`[event-analysis] Browser render failed: ${renderError.message}`);

      if (!html && fetchedError) {
        throw fetchedError;
      }
    }
  } else {
    html = `<main>${source.replace(/\n/g, '<br>')}</main>`;
  }

  const renderedUseful =
    !isUrl ||
    (renderedText.trim().length >= 200 &&
      !/^loading(?:\s+event)?\.{0,3}$/i.test(renderedText.trim()));

  const rawText = stripHtml(html);

  // Rendered visible text is preferred, but captured application data is a valid
  // fallback for SPAs whose DOM stays on a loading shell while the event payload
  // has already arrived through an API/embedded state object.
  const visibleText = isUrl
    ? [renderedUseful ? renderedText : '', capturedDataText, rawText]
        .map((value) => value.trim())
        .filter(Boolean)
        .join('\n')
    : rawText;

  if (!visibleText.trim()) {
    throw new Error('The event source could not be read. Please provide a public event page URL.');
  }

  const title = chooseBestTitle(
    html,
    renderedText,
    capturedDataText,
    finalUrl
  );

  const metaDescription = extractDescription(html);
  const contentLines = visibleText
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  const description = (
    metaDescription ||
    contentLines
      .filter((line) => !isGenericSiteTitle(line))
      .slice(0, 15)
      .join(' ')
  ).slice(0, 5000);

  const combined = `${title}\n${description}\n${visibleText}`;
  const type = inferType(combined);
  const deadlines = extractDeadlines(visibleText);
  const requirements = extractRequirements(visibleText, finalUrl);
  const resources = finalUrl ? extractResources(`${html}\n${capturedDataText}`, finalUrl) : [];
  const participation = inferParticipation(combined);
  const finalDeadline = choosePrimaryDeadline(deadlines);

  const structuredDates = extractStructuredDates(html)
    .map((value) => parseDateCandidate(value, inferSourceYear(combined))?.getTime())
    .filter((value): value is number => Number.isFinite(value));

  const warnings: string[] = [];

  if (!finalDeadline) {
    warnings.push(
      structuredDates.length > 0
        ? 'Event dates were found, but no clearly labelled deadline was identified.'
        : 'No clearly labelled deadline was identified on the source page.'
    );
  }

  if (requirements.length === 0) {
    warnings.push('No clear requirements or deliverables section was found.');
  }

  if (resources.length === 0) {
    warnings.push('No linked guidelines, templates, or supporting resources were detected.');
  }

  if (participation.teamSizeMax === 0) {
    warnings.push('No explicit team-size limit was detected.');
  }

  if (isUrl && !renderedUseful && capturedDataText.length === 0) {
    warnings.push('The page appeared to be dynamically rendered, but no event payload was recovered.');
  }

  const eventConfidencePoints =
    (title !== 'Untitled Event' && !isGenericSiteTitle(title) ? 1 : 0) +
    (description.length >= 40 ? 1 : 0) +
    (type ? 1 : 0);

  const confidenceScore =
    eventConfidencePoints +
    (deadlines.length > 0 ? 1 : 0) +
    (requirements.length > 0 ? 1 : 0) +
    (resources.length > 0 ? 1 : 0) +
    (participation.teamSizeMax > 0 || participation.individualAllowed ? 1 : 0);

  const overall: EventAnalysisResult['confidence']['overall'] =
    confidenceScore >= 6 ? 'high' : confidenceScore >= 3 ? 'medium' : 'low';

  return {
    ...(finalUrl ? { sourceUrl: finalUrl } : {}),
    sourceType: isUrl ? 'url' : 'text',
    event: {
      name: title,
      type,
      description,
      status: 'on-track',
      finalDeadline,
      progress: 0,
      healthScore: 100,
      teamSize: participation.teamSize,
      teamSizeMin: participation.teamSizeMin,
      teamSizeMax: participation.teamSizeMax,
      individualAllowed: participation.individualAllowed,
      participationDetails: participation.participationDetails,
      nextAction: 'Review extracted event details before creating the workspace',
    },
    deadlines,
    requirements,
    resources,
    teamMembers: [],
    confidence: {
      overall,
      event: eventConfidencePoints >= 2 ? 'high' : eventConfidencePoints === 1 ? 'medium' : 'low',
      deadlines: deadlines.length > 0 ? 'high' : 'low',
      requirements: requirements.length > 0 ? 'high' : 'low',
      resources: resources.length > 0 ? 'high' : 'low',
    },
    warnings,
  };
}
