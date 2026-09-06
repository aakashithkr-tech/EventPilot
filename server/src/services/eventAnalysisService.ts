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
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|td|th|header|footer|main|aside)>/gi, '\n')
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

// Some sites render small UI pieces (badges/pills, an icon next to a label)
// as adjacent inline nodes with no whitespace between them, so the browser's
// visible text comes out as "TeamSize2-4Members" instead of "Team Size 2-4
// Members". Every keyword/date regex below relies on real word boundaries,
// so a single squashed run can silently hide an otherwise-perfect match.
// Insert a space at the obvious boundaries (lower→upper case, letter→digit,
// digit→letter) as a cheap safety net before running extraction.
function repairSquashedWhitespace(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return undefined;
}

function extractTitle(html: string, sourceUrl?: string): string {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return trimSiteSuffix(ogTitle);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) return trimSiteSuffix(cleanText(title));
  if (sourceUrl) {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
    return host.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Untitled Event';
}

function trimSiteSuffix(title: string): string {
  return title
    .replace(/\s*[|•–—-]\s*(unstop|devpost|eventbrite|meetup|hack2skill|linkedin).*$/i, '')
    .trim()
    .slice(0, 200);
}

function inferType(text: string): EventAnalysisResult['event']['type'] {
  const value = text.toLowerCase();
  if (/\b(conference|summit|speaker|keynote|panel|symposium)\b/.test(value)) return 'conference';
  if (/\b(workshop|bootcamp|masterclass|training|hands[- ]on)\b/.test(value)) return 'workshop';
  if (/\b(case competition|case study|business challenge|quiz competition|olympiad|challenge|contest|competition)\b/.test(value)) return 'competition';
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

  // Explicit solo/individual participation.
  const individualAllowed =
    /\b(?:individual|solo|single[-\s]?participant|participate\s+(?:alone|individually))\b/i.test(value) &&
    !/\b(?:not\s+allowed|not\s+permitted|only\s+teams?|teams?\s+only)\b/i.test(value);

  // Prefer explicit ranges such as "1-4 members", "2 to 4 members",
  // "teams of 2–4", or "team size: 2-4".
  const rangePatterns = [
    /\bteam(?:\s+size|\s+of)?\s*[:=-]?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,
    /\bteams?\s+of\s+(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?|people)?\b/i,
    /\b(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:members?|participants?)\b/i,
  ];

  for (const pattern of rangePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const a = Number(match[1]);
    const b = Number(match[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

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

  // "Up to N members" means 1..N unless individual participation is
  // explicitly disallowed.
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

  // Fixed "team size: 4", "4 members per team", etc.
  const fixed = value.match(
    /\b(?:team\s+size|teams?\s+of|team\s+of)\s*[:=-]?\s*(\d+)\s*(?:members?|participants?|people)\b/i
  ) || value.match(/\b(\d+)\s*(?:members?|participants?|people)\s+per\s+team\b/i);

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
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (years.length > 0) {
    const counts = new Map<number, number>();
    for (const year of years) counts.set(year, (counts.get(year) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }
  return new Date().getUTCFullYear();
}

function parseDateCandidate(raw: string, fallbackYear?: number): Date | null {
  const value = raw.trim().replace(/\b(st|nd|rd|th)\b/gi, '').replace(/,/g, '');
  const monthNames: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11,
  };
  const year = fallbackYear ?? new Date().getUTCFullYear();

  let match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (match && monthNames[match[2].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(Number(match[3]), monthNames[match[2].toLowerCase()], Number(match[1])));
  }
  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (match && monthNames[match[1].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(Number(match[3]), monthNames[match[1].toLowerCase()], Number(match[2])));
  }
  match = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    return new Date(Date.UTC(Number(match[3]), month - 1, day));
  }

  // Many event platforms render timeline dates without the year,
  // e.g. "Aug 16, 04:38 PM". Use the page's repeated year when available.
  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/);
  if (match && monthNames[match[1].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(year, monthNames[match[1].toLowerCase()], Number(match[2])));
  }
  match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\b/);
  if (match && monthNames[match[2].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(year, monthNames[match[2].toLowerCase()], Number(match[1])));
  }
  return null;
}

function dateRegex(): RegExp {
  // Keep this regex non-global so every test/match starts from a clean state.
  // Event platforms commonly render dates with or without the year.
  return /\b(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?=\s|$|,)|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?=\s|$|,))\b/i;
}

function normalizeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function deadlineKey(title: string): string {
  const value = cleanText(title).toLowerCase();
  if (/registration/.test(value) && /open|start|begin/.test(value)) return 'registration-open';
  if (/registration|application/.test(value) && /close|closing|deadline|last date|due/.test(value)) return 'registration-close';
  if (/submission/.test(value) && /final|close|closing|deadline|last date|due/.test(value)) return 'final-submission';
  if (/proposal/.test(value)) return 'proposal';
  if (/abstract/.test(value)) return 'abstract';
  if (/presentation/.test(value)) return 'presentation';
  if (/speaker/.test(value)) return 'speaker';
  if (/event.*start|start.*event/.test(value)) return 'event-start';
  if (/event.*end|end.*event/.test(value)) return 'event-end';
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
  if (key === 'registration-close') return 100;
  if (key === 'final-submission') return 95;
  if (key === 'registration-open') return 90;
  if (key === 'submission') return 85;
  if (key === 'proposal' || key === 'abstract' || key === 'presentation' || key === 'speaker') return 80;
  if (key === 'event-start' || key === 'event-end') return 60;
  return 50;
}

function extractDeadlineTitle(label: string): string {
  const lower = label.toLowerCase();
  if (/registration/.test(lower) && /open|start|begin/.test(lower)) return 'Registration Opens';
  if (/registration|application/.test(lower) && /close|closing|deadline|last date|due/.test(lower)) return 'Registration Closes';
  if (/event/.test(lower) && /start/.test(lower)) return 'Event Starts';
  if (/event/.test(lower) && /end/.test(lower)) return 'Event Ends';
  if (/final\s+submission|final/.test(lower) && /submission|deadline|due|close|closing/.test(lower)) return 'Final Submission Deadline';
  if (/abstract/.test(lower)) return 'Abstract Submission';
  if (/proposal/.test(lower)) return 'Proposal Submission';
  if (/presentation/.test(lower)) return 'Presentation Submission';
  if (/speaker/.test(lower)) return 'Speaker Deadline';
  if (/submission|deadline|closing|close|last date|due/.test(lower)) return 'Submission Deadline';
  return label.replace(/\s+/g, ' ').trim().slice(0, 90) || 'Official Event Deadline';
}

function extractDeadlines(text: string): AnalyzedDeadline[] {
  const normalizedText = decodeHtml(text).replace(/\u00a0/g, ' ');
  const lines = normalizedText.split(/\r?\n/).map(cleanText).filter(Boolean);
  const sourceYear = inferSourceYear(normalizedText);
  const candidates: Array<AnalyzedDeadline & { key: string; priority: number; order: number }> = [];

  // Event pages use many different labels. Keep the label broad here and
  // normalize it later with extractDeadlineTitle/deadlineKey.
  const keyword = /registration|application|submission|deadline|closing|close|proposal|abstract|presentation|speaker|final|last date|due|event start|event end|judging|team formation|specification|code freeze|write up|winners?/i;

  const addCandidate = (labelSource: string, rawDate: string, order: number) => {
    const date = parseDateCandidate(rawDate, sourceYear);
    if (!date || Number.isNaN(date.getTime())) return;

    const cleanedLabel = cleanText(labelSource)
      .replace(rawDate, ' ')
      .replace(/\b(?:at|on|by|until)\s*$/i, '')
      .trim();

    const title = extractDeadlineTitle(cleanedLabel);
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

  const hasDate = (value: string) => (value.match(dateRegex()) || []).length > 0;
  const isTimeOnly = (value: string) => /^\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*[A-Z]{2,5})?$/i.test(value);

  // 1) Normal DOM structure.
  // Pair a milestone only with a real date. Never use a time-only line.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!keyword.test(line)) continue;

    const sameLineDates = line.match(dateRegex()) || [];
    if (sameLineDates.length) {
      for (const raw of sameLineDates) addCandidate(line, raw, i);
      continue;
    }

    for (let offset = 1; offset <= 8; offset++) {
      const next = lines[i + offset];
      if (!next) break;

      if (isTimeOnly(next)) continue;

      const match = next.match(dateRegex());
      if (match?.[0]) {
        addCandidate(line, match[0], i);
        break;
      }

      // Once another labelled milestone begins, this milestone has no date
      // in its own block. Do not steal the next milestone's date.
      if (offset > 1 && keyword.test(next)) break;
    }
  }

  // 2) Flattened SPA/React text.
  // Some event pages collapse the timeline into a single line. Treat each
  // known milestone as a boundary and search only inside that milestone's
  // local window.
  const flat = cleanText(normalizedText);
  const milestoneRegex =
    /(registration\s+(?:opens?|open|starts?|begins?|closes?|closing|deadline)|application\s+(?:deadline|closes?|closing)|hackathon\s+(?:begins?|starts?|ends?)|event\s+(?:starts?|ends?)|final\s+submission(?:\s+deadline)?|code\s+freeze(?:\s+and\s+submission\s+deadline)?|submission\s+(?:deadline|closes?|closing)|proposal\s+(?:submission|deadline)|abstract\s+(?:submission|deadline)|presentation\s+(?:submission|deadline)|speaker\s+(?:deadline|submission)|judging\s+(?:panel\s+announced|window)|team\s+formation|full\s+specification\s+published|write\s*up\s+quest\s+closes?|winners?\s+announced)/ig;

  const matches = [...flat.matchAll(milestoneRegex)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const label = match[0];
    const start = (match.index ?? 0) + label.length;
    const end = matches[i + 1]?.index ?? Math.min(flat.length, start + 220);
    const window = flat.slice(start, end);

    const dateMatch = window.match(dateRegex());
    if (dateMatch?.[0]) {
      addCandidate(label, dateMatch[0], i);
    }
  }

  // 3) Sentence-style fallback.
  // Example: "Code freeze and submission deadline: September 28, 2026".
  const sentenceRegex =
    /((?:registration|application|hackathon|event|submission|proposal|abstract|presentation|speaker|judging|team formation|full specification|code freeze|write\s*up quest|winners?)[^.!?\n]{0,100}?)(?:on|by|until|at|:)\s*((?:\d{1,2}\s+[A-Za-z]+(?:,?\s+\d{4})?|[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}))/gi;

  for (const match of flat.matchAll(sentenceRegex)) {
    if (match[1] && match[2]) addCandidate(match[1], match[2], 10000);
  }

  // 4) Deduplicate by logical milestone.
  // Prefer a later announced value for the same milestone, but do not let a
  // different milestone replace it.
  const best = new Map<string, typeof candidates[number]>();
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
    .slice(0, 30)
    .map(({ key: _key, priority: _priority, order: _order, ...deadline }) => deadline);
}
function extractRequirements(text: string, sourceUrl?: string): AnalyzedRequirement[] {
  const normalizedText = decodeHtml(text).replace(/\u00a0/g, ' ');
  const lines = normalizedText.split(/\r?\n/).map(cleanText).filter(Boolean);
  const found = new Map<string, AnalyzedRequirement>();

  const sectionHeading =
    /^(?:what you need to submit|what to submit|submission checklist|submission requirements?|requirements?|deliverables?|documents required|judging criteria|evaluation criteria|eligibility|rules?)$/i;

  const addRequirement = (value: string, requiredBy: string) => {
    // Some event platforms (React/Next.js single-page apps) occasionally leak
    // a raw internal JS/JSON config into the page's visible text — e.g.
    // `...your final project"},assessment:{label:"Assessment / Quiz",icon:...`.
    // Cut the candidate off at the first sign of that (a brace, or a
    // compact `key:value` code token with no space after the colon) so a
    // leaked fragment can only ever contribute its clean leading text —
    // never the raw code — to a requirement.
    const codeMarkerIndex = value.search(/[{}[\]]|"\s*[,}]|\b\w+:(?=\S)/);
    const trimmedValue = codeMarkerIndex >= 0 ? value.slice(0, codeMarkerIndex) : value;

    const candidate = cleanText(
      trimmedValue
        .replace(/^[\s•*\-–—✓✔☐☑\d.)]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    );

    if (candidate.length < 4 || candidate.length > 220) return;
    if (!/[A-Za-z]/.test(candidate)) return;

    // Anything that still contains leftover code/JSON punctuation (stray
    // braces, brackets, or a quote butted up against a closing paren/comma)
    // is not a real requirement — reject it outright rather than show it.
    if (/[{}[\]]|"\)|",$/.test(candidate)) return;

    if (/^(requirements?|eligibility|submission|details?|rules?|guidelines?|judging criteria|evaluation criteria)$/i.test(candidate)) {
      return;
    }

    const key = candidate.toLowerCase();
    if (!found.has(key)) {
      found.set(key, {
        title: candidate,
        completed: false,
        requiredBy,
        ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
        verified: true,
      });
    }
  };

  // 1) Line-oriented sections.
  let inSection = false;
  let remaining = 0;
  let sectionTitle = 'Event Requirements';

  for (const line of lines) {
    const isHeading = sectionHeading.test(line) ||
      /what you need to submit|submission requirements?|submission checklist|deliverables?|documents required/i.test(line) && line.length < 140;

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

      if (/^(important dates|timeline|schedule|contact|faq|about|prizes?|register|registration)\b/i.test(line)) {
        inSection = false;
        continue;
      }

      addRequirement(line, sectionTitle);
    }
  }

  // 2) Flattened Unstop/React text.
  // Capture content after "What You Need to Submit" until the next major
  // section heading. Split common bullet markers and punctuation into items.
  const flat = cleanText(normalizedText);
  const flattenedSection =
    /what\s+you\s+need\s+to\s+submit|what\s+to\s+submit|submission\s+requirements?|submission\s+checklist/i;

  const sectionMatch = flat.match(flattenedSection);
  if (sectionMatch && sectionMatch.index !== undefined) {
    const start = sectionMatch.index + sectionMatch[0].length;
    const tail = flat.slice(start);
    const stop =
      tail.search(/\b(?:important dates|timeline|judging criteria|prizes?|eligibility|about hackathon|faq|contact)\b/i);
    const section = tail.slice(0, stop >= 0 ? stop : 1800);

    for (const item of section.split(/\s*(?:•|·|▪|◦|\||;)\s*/)) {
      addRequirement(item, sectionMatch[0]);
    }
  }

  // 3) Explicit instruction sentences.
  const instructionRegex =
    /(?:must\s+(?:submit|provide|upload)|submit|provide|upload|include|requires?)\s+([^.;]{4,180})/gi;

  for (const match of flat.matchAll(instructionRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (/^(your|the)\s+(application|details|information)$/i.test(candidate)) continue;
    addRequirement(candidate, 'Submission Instructions');
  }

  return [...found.values()].slice(0, 40);
}
function extractResources(html: string, sourceUrl: string): AnalyzedResource[] {
  const found = new Map<string, AnalyzedResource>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const name = cleanText(match[2]);
    if (!name || name.length < 3 || name.length > 140) continue;
    if (!/guideline|rulebook|rules|template|problem statement|starter|handbook|brochure|schedule|resource|download|brief|kit/i.test(name)) continue;
    let absolute: string;
    try { absolute = new URL(href, sourceUrl).toString(); } catch { continue; }
    const lower = `${name} ${absolute}`.toLowerCase();
    const isTemplate = /template|starter|kit|boilerplate/.test(lower);
    const isDocument = /pdf|guideline|rulebook|rules|handbook|brief|brochure|problem statement|schedule/.test(lower);
    found.set(absolute, {
      name,
      type: isTemplate ? 'template' : isDocument ? 'document' : 'link',
      fileType: /\.pdf(?:$|[?#])/i.test(absolute) ? 'PDF' : isTemplate ? 'Template' : 'URL',
      source: 'Extracted from event page',
      url: absolute,
    });
  }
  return [...found.values()].slice(0, 20);
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
        for (const key of ['startDate', 'endDate', 'validThrough', 'expires']) {
          if (typeof item[key] === 'string') dates.push(item[key]);
        }
      }
    } catch {
      // Some pages contain malformed JSON-LD; the visible-text extractor is still useful.
    }
  }
  return dates;
}

async function fetchUrl(url: string): Promise<{ html: string; finalUrl: string }> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Please enter a valid http(s) event URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http(s) event URLs are supported.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Many event platforms (Unstop, Devpost, Cloudflare-protected sites, etc.)
        // block requests from an obviously-non-browser User-Agent like
        // "EventPilot/1.0" with a 403/999. Presenting as a normal desktop
        // Chrome request drastically reduces false "could not fetch" failures.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) throw new Error(`The event page returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('That URL did not return an HTML event page. Upload the document or use Add Manually instead.');
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SOURCE_BYTES) throw new Error('The event page is too large to analyze.');
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_SOURCE_BYTES) throw new Error('The event page is too large to analyze.');
    return { html, finalUrl: response.url || parsed.toString() };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The event page took too long to respond. Try again or use the event PDF/manual entry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function renderUrl(url: string): Promise<{ html: string; text: string; finalUrl: string }> {
  let browser: any;
  try {
    // The browser is installed locally inside the deployed Playwright package.
    // Set this before requiring Playwright so its executable lookup uses the
    // same location that the postinstall script populated.
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

    // Playwright is intentionally loaded lazily so text-only analysis and
    // normal HTML pages do not pay the browser startup cost.
    const playwright = require('playwright');
    browser = await playwright.chromium.launch({
      headless: true,
      // Most hosting platforms (Render, Railway, Docker containers in
      // general, etc.) run the Node process as root inside a container
      // without the kernel namespaces Chromium's sandbox needs. Without
      // these flags, launch() throws "No usable sandbox!" in production
      // even though it works fine on a local dev machine. --disable-dev-shm-usage
      // avoids a separate crash on hosts with a tiny /dev/shm.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36 EventPilot/1.0',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);

    // Many event platforms (React/Next.js) render the page shell immediately
    // but fetch the actual timeline/team-size data from an API afterwards.
    // A fixed short pause can grab the page mid-load, before that data
    // exists in the DOM, which then looks like "nothing was found" even
    // though the page has the info a second later. Poll innerText for a
    // signal that real event content (a date-like or "team"/"deadline"
    // keyword) is present, up to ~7s, instead of trusting a single pause.
    const contentSignal = /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;
    let bodyText = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
      if (contentSignal.test(bodyText) && /team|deadline|registration|submission/i.test(bodyText)) break;
      await page.waitForTimeout(1_000);
    }
    const html = await page.content();
    return {
      html: html.slice(0, MAX_SOURCE_BYTES),
      // innerText is the authoritative rendered text. React/event platforms often
      // use <span>/<button> nodes without block-level closing tags, so stripHtml()
      // can flatten labels and dates into one noisy line. Playwright innerText
      // preserves the visual timeline structure and fixes that regression.
      text: bodyText.slice(0, MAX_SOURCE_BYTES),
      finalUrl: page.url() || url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Cannot find module ['"]playwright['"]/.test(message)) {
      throw new Error('This event page needs browser rendering. Run "npm install" in server and then "npx playwright install chromium" once.');
    }
    if (/Executable doesn't exist|download new browsers/i.test(message)) {
      throw new Error('The Chromium browser used to read JS-rendered event pages is missing on this server. Run "npx playwright install --with-deps chromium" in the server directory and redeploy.');
    }
    if (/error while loading shared libraries|missing dependencies|libnss3|libatk/i.test(message)) {
      throw new Error('The server is missing system libraries Chromium needs. Run "npx playwright install-deps chromium" (or use a base image with those libraries) and redeploy.');
    }
    throw new Error(`The event page could not be rendered: ${message}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

// --- LLM-assisted extraction --------------------------------------------
// Regex parsing is fast and free but brittle against every possible layout
// a site can use. When a Gemini API key is configured, use it as a second
// pass over the SAME already-fetched page text (no extra site visit) to
// pull out deadlines / team size / requirements more reliably. This never
// replaces the regex pass — it only fills gaps, and it is skipped entirely
// (falling back to regex-only, exactly as before) if no key is set or the
// call fails for any reason.
type LlmExtraction = {
  deadlines: AnalyzedDeadline[];
  teamSizeMin?: number;
  teamSizeMax?: number;
  individualAllowed?: boolean;
  participationDetails?: string;
  requirements?: string[];
};

async function extractWithLLM(pageText: string, eventTitle: string): Promise<LlmExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const today = new Date().toISOString().slice(0, 10);
  const trimmedText = pageText.slice(0, 12_000);

  const prompt = `You are extracting structured facts from the text of an event/hackathon registration page. Today's date is ${today}. Event title: "${eventTitle}".

Read the page text below and return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "deadlines": [ { "title": string, "date": "YYYY-MM-DD" } ],
  "teamSizeMin": number or null,
  "teamSizeMax": number or null,
  "individualAllowed": boolean or null,
  "participationDetails": string or null,
  "requirements": [string]
}

Rules:
- Only include a deadline/date if it is literally present in the text (registration opens/closes, submission deadline, event start/end, etc.). Never invent a date.
- If a date has no year in the text, infer the nearest sensible future/past year using today's date as context.
- teamSizeMin/teamSizeMax come from an explicit team size statement (e.g. "Team Size: 2-4 Members", "Teams of 2-4"). If none is stated, use null for both.
- individualAllowed is true only if solo participation is explicitly allowed.
- requirements is a short list of submission/eligibility requirements explicitly stated on the page (max 10 items). Use an empty array if none.
- Do not include any text outside the JSON object.

PAGE TEXT:
"""
${trimmedText}
"""`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.log(`[event-analysis] Gemini extraction skipped: HTTP ${res.status}`);
      return null;
    }
    const data: any = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== 'string') return null;

    const parsed = JSON.parse(rawText);

    const deadlines: AnalyzedDeadline[] = Array.isArray(parsed.deadlines)
      ? parsed.deadlines
          .map((d: any) => {
            const parsedDate = parseDateCandidate(String(d?.date ?? ''));
            if (!parsedDate) return null;
            return {
              title: cleanText(String(d?.title ?? 'Deadline')).slice(0, 120) || 'Deadline',
              date: normalizeDate(parsedDate),
              type: 'official' as const,
              verified: true,
            };
          })
          .filter((d: AnalyzedDeadline | null): d is AnalyzedDeadline => d !== null)
      : [];

    const teamSizeMinRaw = Number(parsed.teamSizeMin);
    const teamSizeMaxRaw = Number(parsed.teamSizeMax);
    const teamSizeMin = Number.isFinite(teamSizeMinRaw) && teamSizeMinRaw > 0 ? Math.round(teamSizeMinRaw) : undefined;
    const teamSizeMax =
      Number.isFinite(teamSizeMaxRaw) && teamSizeMaxRaw > 0
        ? Math.max(teamSizeMin ?? 1, Math.round(teamSizeMaxRaw))
        : undefined;

    const requirements = Array.isArray(parsed.requirements)
      ? parsed.requirements.map((r: any) => cleanText(String(r))).filter(Boolean).slice(0, 10)
      : undefined;

    return {
      deadlines,
      teamSizeMin,
      teamSizeMax,
      individualAllowed: typeof parsed.individualAllowed === 'boolean' ? parsed.individualAllowed : undefined,
      participationDetails:
        typeof parsed.participationDetails === 'string' && parsed.participationDetails.trim()
          ? cleanText(parsed.participationDetails).slice(0, 200)
          : undefined,
      requirements,
    };
  } catch (error) {
    console.log(`[event-analysis] Gemini extraction failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function analyzeEventSource(input: string): Promise<EventAnalysisResult> {
  const source = input.trim();
  if (!source) throw new Error('Event source is required.');

  let html = '';
  let finalUrl: string | undefined;
  let renderedText: string | undefined;
  const looksLikeUrl = /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(source);
  const isUrl = looksLikeUrl;
  const urlSource = /^https?:\/\//i.test(source) ? source : `https://${source}`;

  if (isUrl) {
    try {
  const fetched = await fetchUrl(urlSource);
  html = fetched.html;
  finalUrl = fetched.finalUrl;

  // Raw HTML from modern event platforms can contain partial/stale data.
  // Render the page when the raw response is incomplete, even if it contains
  // one unrelated date such as a registration deadline.
  const rawText = repairSquashedWhitespace(stripHtml(html));
  const rawDeadlines = extractDeadlines(rawText);
  const rawRequirements = extractRequirements(rawText, finalUrl);
  const rawParticipation = inferParticipation(
    `${extractTitle(html, finalUrl)}\n${extractDescription(html)}\n${rawText}`
  );

  const rawHasSubmissionDeadline = rawDeadlines.some((d) =>
    /submission|code freeze|final submission/i.test(d.title) &&
    !/registration/i.test(d.title)
  );

  const rawHasUsefulTeamSize =
    rawParticipation.teamSizeMax > 1 ||
    rawParticipation.individualAllowed;

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

    const rendered = await renderUrl(finalUrl);
    html = rendered.html;
    renderedText = rendered.text;
    finalUrl = rendered.finalUrl;
  }
}
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[event-analysis] Direct fetch failed, trying browser render: ${message}`);

      const rendered = await renderUrl(urlSource);
      html = rendered.html;
      renderedText = rendered.text;
      finalUrl = rendered.finalUrl;
    }
  } else {
    // Text mode is intentionally limited to user-provided content; it never invents missing fields.
    html = `<main>${source.replace(/\n/g, '<br>')}</main>`;
  }

  const visibleText = repairSquashedWhitespace(renderedText?.trim() || stripHtml(html));
  const firstTextLine = visibleText.split('\n').map(cleanText).find(Boolean) || 'Untitled Event';
  const title = isUrl ? extractTitle(html, finalUrl) : firstTextLine.slice(0, 200);
  const description = isUrl ? (extractDescription(html) || visibleText.slice(0, 500)) : visibleText.split('\n').slice(1).join(' ').slice(0, 5000);
  const combined = `${title}\n${description}\n${visibleText}`;
  const type = inferType(combined);
  let deadlines = extractDeadlines(visibleText);
  let requirements = extractRequirements(visibleText, finalUrl);
  const resources = finalUrl ? extractResources(html, finalUrl) : [];
  let participation = inferParticipation(combined);

  // Second pass: ask Gemini over the SAME page text (no extra fetch) to catch
  // whatever the regex patterns missed — e.g. squashed/reworded labels regex
  // can't anticipate. Only fills in gaps; never overrides a field the regex
  // pass already found something reasonable for, and is a total no-op if
  // GEMINI_API_KEY isn't configured or the call fails.
  const llmResult = await extractWithLLM(visibleText, title);
  if (llmResult) {
    if (deadlines.length === 0 && llmResult.deadlines.length > 0) {
      deadlines = llmResult.deadlines;
    }
    if (participation.teamSizeMax <= 1 && !participation.individualAllowed &&
        llmResult.teamSizeMin !== undefined && llmResult.teamSizeMax !== undefined) {
      participation = {
        teamSize: llmResult.teamSizeMin,
        teamSizeMin: llmResult.teamSizeMin,
        teamSizeMax: llmResult.teamSizeMax,
        individualAllowed: llmResult.individualAllowed ?? participation.individualAllowed,
        participationDetails: llmResult.participationDetails ?? `Teams of ${llmResult.teamSizeMin}-${llmResult.teamSizeMax}`,
      };
    }
    if (requirements.length === 0 && llmResult.requirements && llmResult.requirements.length > 0) {
      requirements = llmResult.requirements.map((text) => ({
        title: text,
        completed: false,
        requiredBy: 'Event Requirements',
        verified: true,
      }));
    }
  }

  // JSON-LD dates are useful only as additional event dates. They are not labelled deadlines,
  // so they never get silently converted into a submission deadline.
  const structuredDates = extractStructuredDates(html)
    .map((value) => parseDateCandidate(value)?.getTime())
    .filter((value): value is number => Number.isFinite(value));

  const deadlineWarnings: string[] = [];

  if (deadlines.length === 0) {
    // Previously this threw and forced the user into "Add Manually", even
    // though the page usually has a real title, description, requirements,
    // or team-size rules worth keeping. Fail soft instead: hand back
    // everything else we found plus one unverified placeholder deadline
    // (2 weeks out) that the confirm screen's editable date field lets the
    // user fix in one click, rather than losing all extracted context.
    if (structuredDates.length > 0) {
      deadlineWarnings.push(
        'I found event dates on the page, but none were clearly labelled as a registration or submission deadline — please verify the date below.'
      );
    } else {
      deadlineWarnings.push(
        'I could not find a clearly labelled deadline on that page — please verify the date below, or check the specific event/rules page for the exact date.'
      );
    }
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + 14);
    deadlines = [
      {
        title: 'Event Deadline (please verify)',
        date: normalizeDate(fallback),
        type: 'official',
        verified: false,
      },
    ];
  }

  // Prefer the actual submission/code-freeze milestone as the workspace's
  // primary deadline. Registration deadlines and post-submission activities
  // such as judging or winner announcements must not override it.
  const submissionCandidates = deadlines.filter((d) =>
    /submission|code freeze|final submission/i.test(d.title) &&
    !/registration/i.test(d.title)
  );

  const deadlineCandidates = deadlines.filter((d) =>
    /deadline|due|closing|close|last date/i.test(d.title) &&
    !/registration/i.test(d.title)
  );

  const finalCandidates =
    submissionCandidates.length > 0
      ? submissionCandidates
      : deadlineCandidates.length > 0
        ? deadlineCandidates
        : deadlines;

  const finalDeadline = [...finalCandidates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)!.date;


  const teamSize = participation.teamSize;

  const warnings: string[] = [...deadlineWarnings];
  if (!extractMeta(html, 'og:title') && !/<title/i.test(html)) warnings.push('Event name came from the page URL.');
  if (requirements.length === 0) warnings.push('No clear requirements section was found; review the event page before creating the workspace.');
  if (resources.length === 0) warnings.push('No linked guidelines/templates were detected on the page.');
  if (participation.teamSizeMax === 1 && !participation.individualAllowed) {
    warnings.push('No explicit team-size limit was detected.');
  }

  const hasVerifiedDeadline = deadlineWarnings.length === 0;
  const confidenceScore = (hasVerifiedDeadline ? 1 : 0) + (requirements.length > 0 ? 1 : 0) + (resources.length > 0 ? 1 : 0) + (title !== 'Untitled Event' ? 1 : 0);
  const overall: EventAnalysisResult['confidence']['overall'] = confidenceScore >= 4 ? 'high' : confidenceScore >= 2 ? 'medium' : 'low';

  return {
    ...(finalUrl ? { sourceUrl: finalUrl } : {}),
    sourceType: isUrl ? 'url' : 'text',
    event: {
      name: title,
      type,
      description: description.slice(0, 5000),
      status: 'on-track',
      finalDeadline,
      progress: 0,
      healthScore: 100,
      teamSize,
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
      event: title !== 'Untitled Event' ? 'high' : 'low',
      deadlines: hasVerifiedDeadline ? 'high' : 'low',
      requirements: requirements.length > 0 ? 'high' : 'low',
      resources: resources.length > 0 ? 'high' : 'low',
    },
    warnings,
  };
}