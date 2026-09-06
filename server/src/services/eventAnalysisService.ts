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
const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

const EVENT_TYPE_VALUES = ['hackathon', 'competition', 'conference', 'workshop'] as const;

type GeminiDeadline = {
  title?: unknown;
  date?: unknown;
  verified?: unknown;
};

type GeminiResource = {
  name?: unknown;
  type?: unknown;
  fileType?: unknown;
  url?: unknown;
};

type GeminiExtraction = {
  event?: {
    name?: unknown;
    type?: unknown;
    description?: unknown;
    organizer?: unknown;
    location?: unknown;
    participation?: {
      minMembers?: unknown;
      maxMembers?: unknown;
      individualAllowed?: unknown;
      details?: unknown;
    };
  };
  deadlines?: GeminiDeadline[];
  primaryDeadline?: {
    date?: unknown;
    title?: unknown;
  } | null;
  requirements?: Array<unknown>;
  resources?: GeminiResource[];
  confidence?: unknown;
  notes?: Array<unknown>;
};

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function trimSiteSuffix(title: string): string {
  return cleanText(title)
    .replace(
      /\s*[|•–—-]\s*(unstop|devpost|eventbrite|meetup|hack2skill|linkedin)\s*$/i,
      ''
    )
    .slice(0, 200);
}

function fallbackTitle(html: string, sourceUrl?: string): string {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return trimSiteSuffix(ogTitle);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) return trimSiteSuffix(title);

  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./i, '');
      return host
        .split('.')[0]
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      // Ignore malformed URL fallback.
    }
  }

  return 'Untitled Event';
}

function inferType(text: string): EventAnalysisResult['event']['type'] {
  const value = text.toLowerCase();
  if (/\b(conference|summit|speaker|keynote|panel|symposium)\b/.test(value)) return 'conference';
  if (/\b(workshop|bootcamp|masterclass|training|hands[- ]on)\b/.test(value)) return 'workshop';
  if (/\b(case competition|case study|business challenge|quiz competition|olympiad|challenge|contest|competition)\b/.test(value)) return 'competition';
  return 'hackathon';
}

function normalizeDateValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text) return null;

  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const monthMap: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const shortYear = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s*['’]\s*(\d{2})\b/);
  if (shortYear) {
    const day = Number(shortYear[1]);
    const month = monthMap[shortYear[2].toLowerCase()];
    const year = 2000 + Number(shortYear[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;
    }
  }

  const shortYearReverse = text.match(/\b([A-Za-z]+)\s+(\d{1,2})\s*['’]\s*(\d{2})\b/);
  if (shortYearReverse) {
    const month = monthMap[shortYearReverse[1].toLowerCase()];
    const day = Number(shortYearReverse[2]);
    const year = 2000 + Number(shortYearReverse[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;
    }
  }

  return null;
}

function normalizeTeamSize(
  minRaw: unknown,
  maxRaw: unknown,
  individualAllowedRaw: unknown
): {
  teamSize: number;
  min: number;
  max: number;
  individualAllowed: boolean;
  known: boolean;
} {
  const minNumber = Number(minRaw);
  const maxNumber = Number(maxRaw);

  const hasMin = Number.isFinite(minNumber) && minNumber > 0;
  const hasMax = Number.isFinite(maxNumber) && maxNumber > 0;
  const individualAllowed = individualAllowedRaw === true;

  if (hasMin || hasMax) {
    const min = hasMin ? Math.round(minNumber) : individualAllowed ? 1 : 2;
    const max = hasMax ? Math.max(min, Math.round(maxNumber)) : min;

    return {
      teamSize: Math.min(Math.max(min, 1), max),
      min,
      max,
      individualAllowed,
      known: true,
    };
  }

  if (individualAllowed) {
    return {
      teamSize: 1,
      min: 1,
      max: 1,
      individualAllowed: true,
      known: true,
    };
  }

  return {
    // Preserve the existing backend contract while explicitly marking the
    // value as unknown in participationDetails/warnings.
    teamSize: 1,
    min: 1,
    max: 1,
    individualAllowed: false,
    known: false,
  };
}

function cleanRequirements(values: unknown, sourceUrl?: string): AnalyzedRequirement[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const result: AnalyzedRequirement[] = [];

  for (const raw of values) {
    const text = cleanText(String(raw ?? ''));
    if (!text || text.length < 3 || text.length > 240) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      title: text,
      completed: false,
      requiredBy: 'Event Requirements',
      ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
      verified: true,
    });

    if (result.length >= 50) break;
  }

  return result;
}

function cleanResources(values: unknown, sourceUrl?: string): AnalyzedResource[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const result: AnalyzedResource[] = [];

  for (const raw of values) {
    if (!raw || typeof raw !== 'object') continue;

    const item = raw as GeminiResource;
    const name = cleanText(String(item.name ?? ''));
    const rawUrl = cleanText(String(item.url ?? ''));
    if (!name || !rawUrl) continue;

    let absoluteUrl = rawUrl;
    try {
      absoluteUrl = new URL(rawUrl, sourceUrl || undefined).toString();
    } catch {
      continue;
    }

    const key = absoluteUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rawType = String(item.type ?? '').toLowerCase();
    const type: AnalyzedResource['type'] = rawType === 'template'
      ? 'template'
      : rawType === 'document'
        ? 'document'
        : 'link';

    const fileType = cleanText(String(item.fileType ?? '')) || (/\.pdf(?:$|[?#])/i.test(absoluteUrl) ? 'PDF' : 'URL');

    result.push({
      name: name.slice(0, 180),
      type,
      fileType,
      source: 'Extracted from event source',
      url: absoluteUrl,
    });

    if (result.length >= 30) break;
  }

  return result;
}

function cleanDeadlines(values: unknown): AnalyzedDeadline[] {
  if (!Array.isArray(values)) return [];

  const seen = new Map<string, AnalyzedDeadline>();

  for (const raw of values) {
    if (!raw || typeof raw !== 'object') continue;

    const item = raw as GeminiDeadline;
    const title = cleanText(String(item.title ?? ''));
    const date = normalizeDateValue(item.date);

    if (!title || !date) continue;

    const key = title
      .toLowerCase()
      .replace(/registration.*close|application.*close/, 'registration-close')
      .replace(/code freeze.*submission|final submission|submission deadline/, 'final-submission')
      .replace(/\s+/g, ' ')
      .trim();

    seen.set(key || title.toLowerCase(), {
      title: title.slice(0, 120),
      date,
      type: 'official',
      verified: item.verified !== false,
    });
  }

  return [...seen.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 50);
}

function choosePrimaryDeadline(
  deadlines: AnalyzedDeadline[],
  primary?: GeminiExtraction['primaryDeadline']
): string {
  const explicit = normalizeDateValue(primary?.date);
  if (explicit) return explicit;

  const scored = deadlines.map((deadline) => {
    const title = deadline.title.toLowerCase();
    let score = 0;

    if (/final submission|submission deadline|code freeze|project due/.test(title)) score += 100;
    else if (/submission|deliverable|project deadline/.test(title)) score += 90;
    else if (/registration|application/.test(title) && /deadline|close|closing|last date/.test(title)) score += 60;
    else if (/event end|ends|hackathon ends/.test(title)) score += 30;
    else if (/judging|winner|write.?up/.test(title)) score -= 100;

    return { deadline, score };
  });

  const useful = scored
    .filter(({ deadline }) => !/winner|judging/.test(deadline.title.toLowerCase()))
    .sort((a, b) => b.score - a.score || b.deadline.date.localeCompare(a.deadline.date));

  return useful[0]?.deadline.date || '';
}

function confidenceFrom(value: unknown, fallback: EventAnalysisResult['confidence']['overall']): EventAnalysisResult['confidence']['overall'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return fallback;
}

function extractJsonFromText(value: string): unknown | null {
  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with fenced/embedded JSON recovery.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {
      // Continue.
    }
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');

  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    } catch {
      // Continue.
    }
  }

  return null;
}

function getInteractionOutputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (typeof data?.text === 'string') return data.text;

  const outputs = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];

  for (const item of outputs) {
    if (typeof item?.text === 'string') chunks.push(item.text);
    if (Array.isArray(item?.content)) {
      for (const content of item.content) {
        if (typeof content?.text === 'string') chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

const GEMINI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    event: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        type: {
          type: 'string',
          enum: [...EVENT_TYPE_VALUES],
        },
        description: { type: 'string' },
        organizer: { type: 'string' },
        location: { type: 'string' },
        participation: {
          type: 'object',
          additionalProperties: false,
          properties: {
            minMembers: { type: ['integer', 'null'] },
            maxMembers: { type: ['integer', 'null'] },
            individualAllowed: { type: ['boolean', 'null'] },
            details: { type: ['string', 'null'] },
          },
          required: ['minMembers', 'maxMembers', 'individualAllowed', 'details'],
        },
      },
      required: ['name', 'type', 'description', 'organizer', 'location', 'participation'],
    },
    deadlines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          verified: { type: 'boolean' },
        },
        required: ['title', 'date', 'verified'],
      },
    },
    primaryDeadline: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        date: { type: ['string', 'null'] },
        title: { type: ['string', 'null'] },
      },
      required: ['date', 'title'],
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
    },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['template', 'document', 'link'] },
          fileType: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['name', 'type', 'fileType', 'url'],
      },
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['event', 'deadlines', 'primaryDeadline', 'requirements', 'resources', 'confidence', 'notes'],
};

function buildExtractionPrompt(url: string): string {
  return `You are EventPilot's event-source extraction engine.

Open and inspect the supplied public event URL carefully. Extract reliable facts directly from that source. The input is ONE event URL:
${url}

The application must work for arbitrary public event URLs, not one platform or one event.

Use the supplied URL as the primary source. If the URL is unavailable, incomplete, dynamically rendered, or does not expose enough information, use Google Search only to locate additional public information about the SAME event. Prefer the official event page or organizer source over third-party pages.

Do not invent facts. If a field is not explicitly supported by the source, return null/empty rather than guessing.

Extract:
- event name/title
- event type: hackathon, competition, conference, or workshop
- concise description
- organizer if present
- location / online / offline information if present
- explicit team size minimum and maximum
- whether solo/individual participation is explicitly allowed
- all important official timeline milestones
- the primary actionable deadline, prioritizing final submission/project due/code freeze; registration/application deadline is only the fallback when no submission deadline exists
- submission requirements/deliverables
- linked rulebooks, guidelines, templates, problem statements, starter kits, documentation and other useful event resources

IMPORTANT deadline rules:
- Preserve each milestone separately.
- Do not use the latest chronological date blindly.
- Do not convert judging, winner announcement, or post-submission dates into the submission deadline.
- If the page contains a registration deadline and a later submission deadline, keep both and use submission as primary.
- If the event only has an application/registration deadline, use that as primary.
- Dates may appear as '25 Sep\\'26', '25 Sep 2026', 'Sep 25, 2026', ISO dates, etc. Normalize returned deadline.date to YYYY-MM-DD.

IMPORTANT team rules:
- Preserve ranges exactly. Example: '1-4 members' => minMembers=1, maxMembers=4.
- Never average a range.
- individualAllowed=true only when solo/individual participation is explicitly allowed.

IMPORTANT requirements/resources rules:
- Return individual requirements, not one giant paragraph.
- Only return linked resources that actually exist on the source or a directly supporting official page.

Return ONLY JSON matching the supplied schema.`;
}

async function callGeminiWebExtraction(url: string): Promise<GeminiExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: buildExtractionPrompt(url),
        tools: [
          { type: 'url_context' },
          { type: 'google_search' },
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: GEMINI_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.log(
        `[event-analysis] Gemini web extraction failed: HTTP ${response.status}${details ? ` ${details.slice(0, 500)}` : ''}`
      );
      return null;
    }

    const data = await response.json();
    const outputText = getInteractionOutputText(data);
    if (!outputText) {
      console.log('[event-analysis] Gemini returned no structured extraction output.');
      return null;
    }

    const parsed = extractJsonFromText(outputText);
    if (!parsed || typeof parsed !== 'object') {
      console.log('[event-analysis] Gemini output was not valid JSON.');
      return null;
    }

    return parsed as GeminiExtraction;
  } catch (error) {
    console.log(
      `[event-analysis] Gemini web extraction error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
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
    if (contentLength > MAX_SOURCE_BYTES) {
      throw new Error('The event page is too large to analyze.');
    }

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_SOURCE_BYTES) {
      throw new Error('The event page is too large to analyze.');
    }

    return {
      html,
      finalUrl: response.url || parsed.toString(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The event page took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function renderUrl(url: string): Promise<{ html: string; text: string; finalUrl: string }> {
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
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    });

    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => undefined);

    for (let attempt = 0; attempt < 10; attempt++) {
      const text = await page
        .locator('body')
        .innerText({ timeout: 5_000 })
        .catch(() => '');

      if (
        text.trim().length >= 500 &&
        !/^loading(?:\s+event)?\.{0,3}$/i.test(text.trim())
      ) {
        const html = await page.content();
        return {
          html: html.slice(0, MAX_SOURCE_BYTES),
          text: text.slice(0, MAX_SOURCE_BYTES),
          finalUrl: page.url() || url,
        };
      }

      await page.waitForTimeout(1_000);
    }

    const text = await page
      .locator('body')
      .innerText({ timeout: 5_000 })
      .catch(() => '');
    const html = await page.content();

    return {
      html: html.slice(0, MAX_SOURCE_BYTES),
      text: text.slice(0, MAX_SOURCE_BYTES),
      finalUrl: page.url() || url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/Cannot find module ['"]playwright['"]/.test(message)) {
      throw new Error('Playwright is not installed on the server.');
    }

    if (/Executable doesn't exist|download new browsers/i.test(message)) {
      throw new Error('Chromium is not installed on the server.');
    }

    if (/error while loading shared libraries|missing dependencies|libnss3|libatk/i.test(message)) {
      throw new Error('The server is missing Chromium system libraries.');
    }

    throw new Error(`The event page could not be rendered: ${message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

function buildFromGemini(
  extraction: GeminiExtraction,
  sourceUrl: string,
  rawHtml: string,
  sourceText: string
): EventAnalysisResult {
  const title = cleanText(String(extraction.event?.name ?? '')) || fallbackTitle(rawHtml, sourceUrl);
  const description = cleanText(String(extraction.event?.description ?? '')) ||
    cleanText(extractMeta(rawHtml, 'og:description') || extractMeta(rawHtml, 'description') || '') ||
    sourceText.slice(0, 700);

  const eventType = EVENT_TYPE_VALUES.includes(extraction.event?.type as any)
    ? (extraction.event?.type as EventAnalysisResult['event']['type'])
    : inferType(`${title}\n${description}\n${sourceText}`);

  const deadlines = cleanDeadlines(extraction.deadlines);
  const requirements = cleanRequirements(extraction.requirements, sourceUrl);
  const resources = cleanResources(extraction.resources, sourceUrl);

  const participation = normalizeTeamSize(
    extraction.event?.participation?.minMembers,
    extraction.event?.participation?.maxMembers,
    extraction.event?.participation?.individualAllowed
  );

  const primaryDeadline = choosePrimaryDeadline(deadlines, extraction.primaryDeadline);
  const notes = Array.isArray(extraction.notes)
    ? extraction.notes.map((note) => cleanText(String(note))).filter(Boolean).slice(0, 10)
    : [];

  const warnings = [...notes];

  if (!primaryDeadline) {
    warnings.push('No clearly labelled primary deadline was identified in the source.');
  }

  if (!participation.known) {
    warnings.push('No explicit team-size limit was identified in the source.');
  }

  if (requirements.length === 0) {
    warnings.push('No clear submission requirements or deliverables were identified.');
  }

  if (resources.length === 0) {
    warnings.push('No linked guidelines, templates, or supporting resources were identified.');
  }

  const overall = confidenceFrom(extraction.confidence, 'medium');

  return {
    sourceUrl,
    sourceType: 'url',
    event: {
      name: title,
      type: eventType,
      description: description.slice(0, 5000),
      status: 'on-track',
      finalDeadline: primaryDeadline,
      progress: 0,
      healthScore: 100,
      teamSize: participation.teamSize,
      teamSizeMin: participation.min,
      teamSizeMax: participation.max,
      individualAllowed: participation.individualAllowed,
      participationDetails:
        cleanText(String(extraction.event?.participation?.details ?? '')) ||
        (participation.known
          ? participation.individualAllowed
            ? `Individual or teams of ${participation.min}–${participation.max} members`
            : `Teams of ${participation.min}–${participation.max} members`
          : 'Team size not explicitly detected'),
      nextAction: 'Review extracted event details before creating the workspace',
    },
    deadlines,
    requirements,
    resources,
    teamMembers: [],
    confidence: {
      overall,
      event: title !== 'Untitled Event' ? 'high' : 'low',
      deadlines: deadlines.length > 0 ? 'high' : 'low',
      requirements: requirements.length > 0 ? 'high' : 'low',
      resources: resources.length > 0 ? 'high' : 'low',
    },
    warnings,
  };
}

function fallbackFromPage(
  sourceUrl: string,
  rawHtml: string,
  renderedText: string
): EventAnalysisResult {
  const text = cleanText(renderedText || stripHtml(rawHtml));
  const title = fallbackTitle(rawHtml, sourceUrl);
  const description = cleanText(extractMeta(rawHtml, 'og:description') || extractMeta(rawHtml, 'description') || '') || text.slice(0, 700);
  const eventType = inferType(`${title}\n${description}\n${text}`);
  const deadlineDate = text.match(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})\b/)?.[0];
  const normalized = deadlineDate ? normalizeDateValue(deadlineDate) : null;

  const deadlines: AnalyzedDeadline[] = normalized
    ? [{
        title: 'Event date (verify)',
        date: normalized,
        type: 'official',
        verified: false,
      }]
    : [];

  return {
    sourceUrl,
    sourceType: 'url',
    event: {
      name: title,
      type: eventType,
      description: description.slice(0, 5000),
      status: 'on-track',
      finalDeadline: normalized || '',
      progress: 0,
      healthScore: 100,
      teamSize: 1,
      teamSizeMin: 1,
      teamSizeMax: 1,
      individualAllowed: false,
      participationDetails: 'Team size not explicitly detected',
      nextAction: 'Review extracted event details before creating the workspace',
    },
    deadlines,
    requirements: [],
    resources: [],
    teamMembers: [],
    confidence: {
      overall: 'low',
      event: title !== 'Untitled Event' ? 'medium' : 'low',
      deadlines: normalized ? 'low' : 'low',
      requirements: 'low',
      resources: 'low',
    },
    warnings: [
      'AI web extraction was unavailable or failed; only limited source parsing was possible.',
      'Review all extracted details before creating the workspace.',
    ],
  };
}

export async function analyzeEventSource(input: string): Promise<EventAnalysisResult> {
  const source = input.trim();
  if (!source) throw new Error('Event source is required.');

  const looksLikeUrl = /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(source);
  const isUrl = looksLikeUrl;

  if (!isUrl) {
    const title = source.split(/\r?\n/).map(cleanText).find(Boolean) || 'Untitled Event';
    const description = source.split(/\r?\n/).map(cleanText).filter(Boolean).slice(1).join(' ').slice(0, 5000);

    return {
      sourceType: 'text',
      event: {
        name: title.slice(0, 200),
        type: inferType(source),
        description,
        status: 'on-track',
        finalDeadline: '',
        progress: 0,
        healthScore: 100,
        teamSize: 1,
        teamSizeMin: 1,
        teamSizeMax: 1,
        individualAllowed: false,
        participationDetails: 'Team size not explicitly detected',
        nextAction: 'Review extracted event details before creating the workspace',
      },
      deadlines: [],
      requirements: [],
      resources: [],
      teamMembers: [],
      confidence: {
        overall: 'low',
        event: 'medium',
        deadlines: 'low',
        requirements: 'low',
        resources: 'low',
      },
      warnings: ['Text analysis is limited; provide an event URL for richer extraction.'],
    };
  }

  const urlSource = /^https?:\/\//i.test(source) ? source : `https://${source}`;

  let rawHtml = '';
  let finalUrl = urlSource;
  let renderedText = '';

  try {
    const fetched = await fetchUrl(urlSource);
    rawHtml = fetched.html;
    finalUrl = fetched.finalUrl;
  } catch (error) {
    console.log(
      `[event-analysis] Direct fetch failed; continuing with browser/AI: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  /*
   * AI-first path:
   * Gemini's URL Context + Google Search can inspect arbitrary public event
   * pages and return one structured result. This is the main extraction path.
   */
  const geminiResult = await callGeminiWebExtraction(finalUrl);

  if (geminiResult) {
    const pageText = rawHtml ? stripHtml(rawHtml) : '';
    return buildFromGemini(geminiResult, finalUrl, rawHtml, pageText);
  }

  /*
   * Fallback path:
   * If the web model is unavailable, retain browser rendering so the existing
   * deployment still has a chance to analyze dynamic pages.
   */
  try {
    const rendered = await renderUrl(finalUrl);
    renderedText = rendered.text;
    rawHtml = rendered.html;
    finalUrl = rendered.finalUrl;
  } catch (error) {
    console.log(
      `[event-analysis] Browser fallback failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const text = renderedText.trim() || stripHtml(rawHtml);

  if (!text.trim() || /^loading(?:\s+event)?\.{0,3}$/i.test(text.trim())) {
    throw new Error(
      'I could not read enough public information from that event URL. Please check that the page is publicly accessible, or provide the official event/rules page.'
    );
  }

  return fallbackFromPage(finalUrl, rawHtml, text);
}
