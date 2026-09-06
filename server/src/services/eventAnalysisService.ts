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

function inferTeamSize(text: string): number {
  const patterns = [
    /team(?:\s+size|\s+of)?\s*[:=-]?\s*(\d+)\s*(?:-|to)\s*(\d+)/i,
    /teams?\s+of\s+(\d+)\s*(?:-|to)\s*(\d+)/i,
    /(?:maximum|max\.?|up\s+to)\s*(\d+)\s*(?:members?|participants?)/i,
    /(?:minimum|min\.?)\s*(\d+)\s*(?:members?|participants?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const a = Number(match[1]);
    const b = match[2] ? Number(match[2]) : a;
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(1, Math.round((a + b) / 2));
  }
  return 1;
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
  const lines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
  const sourceYear = inferSourceYear(text);
  const candidates: Array<AnalyzedDeadline & { key: string; priority: number; order: number }> = [];
  const keyword = /registration|application|submission|deadline|closing|close|proposal|abstract|presentation|speaker|final|last date|due|event start|event end/i;

  const addCandidate = (labelSource: string, rawDate: string, order: number) => {
    const date = parseDateCandidate(rawDate, sourceYear);
    if (!date || Number.isNaN(date.getTime())) return;

    const title = extractDeadlineTitle(labelSource.replace(rawDate, '').trim());
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

  // First handle labels and dates rendered on separate DOM lines. We allow a
  // few intermediate UI lines, but never cross another semantic milestone.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!keyword.test(line)) continue;

    const sameLineDates = line.match(dateRegex()) || [];
    if (sameLineDates.length) {
      for (const raw of sameLineDates) addCandidate(line, raw, i);
      continue;
    }

    for (let offset = 1; offset <= 6; offset++) {
      const next = lines[i + offset];
      if (!next) break;

      const match = next.match(dateRegex());
      if (match?.length) {
        addCandidate(line, match[0], i);
        break;
      }

      // Ignore time-only rows such as "11:59 PM" and continue searching.
      if (/^\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*$/i.test(next)) continue;

      // Another milestone means the previous label no longer owns later dates.
      if (offset > 1 && keyword.test(next)) break;
    }
  }

  // Catch flattened sentences such as "Registration closes on Sep 15, 2026".
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!keyword.test(line)) continue;
    for (const rawDate of line.match(dateRegex()) || []) {
      addCandidate(line, rawDate, i);
    }
  }

  // One canonical deadline per logical milestone. Repeated banners/cards are
  // common on event sites, so keep the latest date and strongest label.
  const best = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.key);
    if (!existing || candidate.date > existing.date ||
        (candidate.date === existing.date && candidate.priority > existing.priority)) {
      best.set(candidate.key, candidate);
    }
  }

  return [...best.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20)
    .map(({ key: _key, priority: _priority, order: _order, ...deadline }) => deadline);
}

function extractRequirements(text: string, sourceUrl?: string): AnalyzedRequirement[] {
  const lines = text.split('\n').map(cleanText).filter(Boolean);
  const found = new Map<string, AnalyzedRequirement>();
  const heading = /requirement|eligib|what to submit|submission checklist|deliverable|documents required|judging criteria|evaluation criteria/i;
  let inSection = false;
  let sectionTitle = 'Event Requirements';
  let remaining = 0;

  for (const line of lines) {
    if (heading.test(line) && line.length < 120) {
      inSection = true;
      sectionTitle = line;
      remaining = 25;
      continue;
    }
    if (inSection && remaining-- > 0) {
      if (/^(deadline|schedule|contact|faq|about|prizes?)\b/i.test(line)) {
        inSection = false;
        continue;
      }
      const candidate = line.replace(/^[\s•*\-–—✓✔☐☑\d.)]+\s*/, '').trim();
      if (candidate.length < 4 || candidate.length > 160) continue;
      if (!/[A-Za-z]/.test(candidate)) continue;
      if (/^(?:official\s+)?(?:guidelines?|rulebook|rules|template|starter\s+kit|handbook|brochure|schedule|resource|download)\b/i.test(candidate)) continue;
      if (/^(requirements?|eligibility|submission|details?)$/i.test(candidate)) continue;
      const key = candidate.toLowerCase();
      found.set(key, {
        title: candidate,
        completed: false,
        requiredBy: sectionTitle,
        ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
        verified: true,
      });
    }
  }

  // A second pass catches common "must submit / submit X" statements outside headings.
  for (const line of lines) {
    const match = line.match(/(?:must\s+(?:submit|provide|upload)|submit|provide|upload)\s+([^.;]{4,120})/i);
    if (!match) continue;
    const candidate = match[1].trim().replace(/[.!]+$/, '');
    if (/^(your|the)\s+(application|details|information)$/i.test(candidate)) continue;
    const key = candidate.toLowerCase();
    if (!found.has(key)) {
      found.set(key, {
        title: candidate,
        completed: false,
        requiredBy: 'Submission Instructions',
        ...(sourceUrl ? { sourceLink: sourceUrl } : {}),
        verified: true,
      });
    }
  }

  return [...found.values()].slice(0, 30);
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
        'User-Agent': 'EventPilot/1.0 (+event-analysis)',
        Accept: 'text/html,application/xhtml+xml',
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
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36 EventPilot/1.0',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
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
    throw new Error(`The event page could not be rendered: ${message}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
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

      // Many modern event platforms populate the timeline through client-side JS.
      if (extractDeadlines(stripHtml(html)).length === 0) {
        const rendered = await renderUrl(finalUrl);
        html = rendered.html;
        renderedText = rendered.text;
        finalUrl = rendered.finalUrl;
      }
    } catch (error) {
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

  const visibleText = renderedText?.trim() || stripHtml(html);
  const firstTextLine = visibleText.split('\n').map(cleanText).find(Boolean) || 'Untitled Event';
  const title = isUrl ? extractTitle(html, finalUrl) : firstTextLine.slice(0, 200);
  const description = isUrl ? (extractDescription(html) || visibleText.slice(0, 500)) : visibleText.split('\n').slice(1).join(' ').slice(0, 5000);
  const combined = `${title}\n${description}\n${visibleText}`;
  const type = inferType(combined);
  const deadlines = extractDeadlines(visibleText);

  // JSON-LD dates are useful only as additional event dates. They are not labelled deadlines,
  // so they never get silently converted into a submission deadline.
  const structuredDates = extractStructuredDates(html)
    .map((value) => parseDateCandidate(value)?.getTime())
    .filter((value): value is number => Number.isFinite(value));
  if (deadlines.length === 0 && structuredDates.length > 0) {
    throw new Error('I found event dates, but no clearly labelled submission/registration deadline. Please verify the deadline manually before creating the workspace.');
  }
  if (deadlines.length === 0) {
    throw new Error('I could not find a clearly labelled event deadline on that page. Try the specific event page, upload its rulebook, or use Add Manually.');
  }

  const finalCandidates = deadlines.filter((d) => /final|submission|deadline|closing|last/i.test(d.title));
  const sortedFinalCandidates = [...(finalCandidates.length ? finalCandidates : deadlines)]
    .sort((a, b) => a.date.localeCompare(b.date));
  const finalDeadline = sortedFinalCandidates[sortedFinalCandidates.length - 1].date;


  const requirements = extractRequirements(visibleText, finalUrl);
  const resources = finalUrl ? extractResources(html, finalUrl) : [];
  const teamSize = inferTeamSize(combined);

  const warnings: string[] = [];
  if (!extractMeta(html, 'og:title') && !/<title/i.test(html)) warnings.push('Event name came from the page URL.');
  if (requirements.length === 0) warnings.push('No clear requirements section was found; review the event page before creating the workspace.');
  if (resources.length === 0) warnings.push('No linked guidelines/templates were detected on the page.');
  if (teamSize === 1 && !/\b1\s*(?:member|participant)|individual|solo/i.test(combined)) warnings.push('No explicit team-size limit was detected.');

  const confidenceScore = (deadlines.length > 0 ? 1 : 0) + (requirements.length > 0 ? 1 : 0) + (resources.length > 0 ? 1 : 0) + (title !== 'Untitled Event' ? 1 : 0);
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
