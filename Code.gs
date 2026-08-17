/**
 * Scope Deviation Tracker — Apps Script backend
 *
 * Reads/writes the Jobs and Items tabs, and proxies AI parsing calls to
 * Claude so the API key never touches the front-end.
 *
 * SETUP:
 * 1. Extensions > Apps Script from inside your Sheet, paste this whole file in.
 * 2. Project Settings > Script Properties, add two properties:
 *      ANTHROPIC_API_KEY   = your real key from platform.claude.com
 *      APP_TOKEN           = any string you make up (acts as a basic access gate)
 *    IMPORTANT: if APP_TOKEN has ever been committed to a public repo, rotate it —
 *    generate a fresh long random value here AND in index.html before deploying.
 * 3. Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the Web app URL it gives you — that's what the front-end will call.
 *
 * NOTE ON RATE LIMITING: Apps Script web apps do not expose the caller's IP
 * address or Origin/Referer headers to script code, so limits below are
 * global (shared across all callers, not per-caller). That's fine for a
 * one-or-two-person internal tool — it still stops a scraped token from
 * being hammered in a loop, it just can't distinguish who's hammering it.
 */

const SHEET_ID = '1onCx7sKxt0zQB4EmulWZ0mcqkqCc9NFUDSThIKGLnRk';
const JOBS_SHEET = 'Jobs';
const ITEMS_SHEET = 'Items';
const CLAUDE_MODEL = 'claude-sonnet-5'; // swap to 'claude-haiku-4-5-20251001' anytime to test cost/accuracy

const COMM_METHODS = ['email', 'text', 'coconstruct'];

// ---------- Rate limiting ----------
// CacheService buckets reset every RATE_LIMIT_WINDOW_SEC seconds. Reads are
// cheap and generous; writes are tighter since they mutate data; AI calls are
// strictest since each one costs real Anthropic API spend. There's also a
// separate PER-DAY ceiling on AI calls (stored in Script Properties, since
// CacheService can't hold a counter for a full day) so a leaked token left
// running overnight can't run up a large bill.

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX_READS = 60;   // listJobs / getJob
const RATE_LIMIT_MAX_WRITES = 20;  // createJob / saveJob / deleteJob
const RATE_LIMIT_MAX_AI = 10;      // parseIntake / parseFollowup, per minute
const AI_DAILY_CAP = 150;          // parseIntake / parseFollowup, per calendar day

function checkRateLimit(bucket, max) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + bucket;
  const count = Number(cache.get(key) || 0);
  if (count >= max) {
    throw new Error('Rate limit exceeded — too many requests, try again in a minute.');
  }
  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW_SEC);
}

function checkDailyAiCap() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const key = 'ai_count_' + today;
  const count = Number(props.getProperty(key) || 0);
  if (count >= AI_DAILY_CAP) {
    throw new Error('Daily AI request limit reached — resets tomorrow. If this wasn\'t you, rotate APP_TOKEN.');
  }
  props.setProperty(key, String(count + 1));
}

// ---------- Entry points ----------

function doGet(e) {
  try {
    checkToken(e.parameter.token);
    checkRateLimit('read', RATE_LIMIT_MAX_READS);
    const action = e.parameter.action;
    if (action === 'listJobs') return respond(listJobs());
    if (action === 'getJob') return respond(getJob(e.parameter.slug));
    return respond({ error: 'Unknown action' }, 400);
  } catch (err) {
    return respond({ error: err.message }, 401);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    checkToken(body.token);
    const action = body.action;

    if (action === 'createJob') { checkRateLimit('write', RATE_LIMIT_MAX_WRITES); return respond(createJob(body.job)); }
    if (action === 'saveJob') { checkRateLimit('write', RATE_LIMIT_MAX_WRITES); return respond(saveJob(body.job)); }
    if (action === 'deleteJob') { checkRateLimit('write', RATE_LIMIT_MAX_WRITES); return respond(deleteJob(body.slug)); }
    if (action === 'parseIntake') {
      checkRateLimit('ai', RATE_LIMIT_MAX_AI);
      checkDailyAiCap();
      return respond(parseIntake(body.dictation, body.categories));
    }
    if (action === 'parseFollowup') {
      checkRateLimit('ai', RATE_LIMIT_MAX_AI);
      checkDailyAiCap();
      return respond(parseFollowup(body.dictation, body.itemSummaries));
    }
    return respond({ error: 'Unknown action' }, 400);
  } catch (err) {
    return respond({ error: err.message }, 401);
  }
}

function checkToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!token || token !== expected) throw new Error('Invalid or missing token');
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sheet helpers ----------

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).filter((row) => row[0] !== '').map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

// ---------- Jobs ----------

function listJobs() {
  const sheet = getSheet(JOBS_SHEET);
  return sheetToObjects(sheet).map((j) => ({ slug: j.slug, address: j.address, createdAt: j.createdAt }));
}

function createJob(job) {
  const sheet = getSheet(JOBS_SHEET);
  sheet.appendRow([job.slug, job.address, job.createdAt, job.categories.join(','), new Date().toISOString()]);
  return { ok: true };
}

function getJob(slug) {
  const jobsSheet = getSheet(JOBS_SHEET);
  const jobs = sheetToObjects(jobsSheet);
  const jobRow = jobs.find((j) => j.slug === slug);
  if (!jobRow) return { error: 'Job not found' };

  const itemsSheet = getSheet(ITEMS_SHEET);
  const items = sheetToObjects(itemsSheet)
    .filter((r) => r.jobSlug === slug)
    .map(rowToItem);

  return {
    slug: jobRow.slug,
    address: jobRow.address,
    createdAt: jobRow.createdAt,
    categories: jobRow.categories.split(',').map((c) => c.trim()).filter(Boolean),
    lastUpdated: jobRow.lastUpdated,
    items,
  };
}

function saveJob(job) {
  // saveJob fully replaces a job's Items rows (delete-all-then-append), so
  // two overlapping requests must never interleave that delete/append pair —
  // one would delete rows the other just wrote, or both would append on top
  // of a stale read, losing whichever wrote first. LockService serializes
  // concurrent doPost executions so each saveJob call runs start-to-finish
  // before the next one begins.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Update the Jobs row
    const jobsSheet = getSheet(JOBS_SHEET);
    const jobsData = jobsSheet.getDataRange().getValues();
    for (let i = 1; i < jobsData.length; i++) {
      if (jobsData[i][0] === job.slug) {
        jobsSheet.getRange(i + 1, 2, 1, 4).setValues([
          [job.address, job.createdAt, job.categories.join(','), new Date().toISOString()],
        ]);
        break;
      }
    }

    // Replace all Items rows for this job with the current set
    const itemsSheet = getSheet(ITEMS_SHEET);
    const itemsData = itemsSheet.getDataRange().getValues();
    for (let i = itemsData.length - 1; i >= 1; i--) {
      if (itemsData[i][1] === job.slug) itemsSheet.deleteRow(i + 1);
    }
    job.items.forEach((it) => itemsSheet.appendRow(itemToRow(it, job.slug)));

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteJob(slug) {
  const jobsSheet = getSheet(JOBS_SHEET);
  const jobsData = jobsSheet.getDataRange().getValues();
  for (let i = jobsData.length - 1; i >= 1; i--) {
    if (jobsData[i][0] === slug) jobsSheet.deleteRow(i + 1);
  }
  const itemsSheet = getSheet(ITEMS_SHEET);
  const itemsData = itemsSheet.getDataRange().getValues();
  for (let i = itemsData.length - 1; i >= 1; i--) {
    if (itemsData[i][1] === slug) itemsSheet.deleteRow(i + 1);
  }
  return { ok: true };
}

// ---------- Item <-> row mapping ----------

function itemToRow(it, jobSlug) {
  return [
    it.id,
    jobSlug,
    it.category,
    it.sub || '',
    it.item,
    it.source || '',
    it.notes || '',
    it.markedOut.done,
    it.markedOut.date || '',
    it.communicated.email.done,
    it.communicated.email.date || '',
    it.communicated.text.done,
    it.communicated.text.date || '',
    it.communicated.coconstruct.done,
    it.communicated.coconstruct.date || '',
    it.createdAt,
  ];
}

function formatSheetDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'MMM d, yyyy');
  }
  return v; // already a plain string
}

function rowToItem(r) {
  return {
    id: r.id,
    category: r.category,
    sub: r.sub || null,
    item: r.item,
    source: r.source || null,
    notes: r.notes || null,
    markedOut: { done: !!r.markedOutDone, date: formatSheetDate(r.markedOutDate) },
    communicated: {
      email: { done: !!r.emailDone, date: formatSheetDate(r.emailDate) },
      text: { done: !!r.textDone, date: formatSheetDate(r.textDate) },
      coconstruct: { done: !!r.coconstructDone, date: formatSheetDate(r.coconstructDate) },
    },
    createdAt: r.createdAt,
  };
}

// ---------- Claude calls ----------

function callClaude(systemPrompt, userText) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(response.getContentText());
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No response from Claude: ' + response.getContentText());
  let clean = textBlock.text.trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(clean);
}

function parseIntake(dictation, categories) {
  const system = `You are helping a residential home builder superintendent extract scope deviations (change orders, amendments, non-standard items) from spoken or typed notes about a sold home. The superintendent will dictate freeform, messy, stream-of-consciousness notes as they read a contract or amendment. Extract EVERY distinct change item mentioned.

Existing trade categories for this job: ${JSON.stringify(categories)}.
Use one of these categories if it fits. If nothing fits well, invent a short, sensible new category name.

Return ONLY a JSON array, no prose, no markdown fences. Each element:
{"category": string, "sub": string or null, "item": string, "source": string or null, "notes": string or null}`;
  return callClaude(system, dictation);
}

function parseFollowup(dictation, itemSummaries) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy');
  const system = `You are helping a residential home builder superintendent log follow-up on scope deviation items for a sold home. They will narrate what happened for specific items. Nothing is ever discussed in person — in-person contact is only for reviewing what's already documented, never a way an item gets communicated, so never infer "in person" as a communication method.

Here are the existing items for this job. "communicated" shows which methods have already been used for each item (independent flags, not exclusive):
${JSON.stringify(itemSummaries)}

Today's date is ${today}.

Valid communication methods: "email", "text", "coconstruct". An item can have more than one method marked at once — only include methods newly done in this narration.

Match the narration to the correct item id(s). Return ONLY a JSON object, no prose, no markdown fences:
{"updates": [{"id": string, "markedOut": true/false or omit, "communicatedMethods": ["email","coconstruct"] or omit, "note": string or omit}], "unmatched": [string]}`;
  return callClaude(system, dictation);
}
