/**
 * BuildTrack (milestone/bonus/closing) — Google Apps Script backend
 *
 * This is a SEPARATE Apps Script project/deployment from the Scope Deviation
 * backend (Code.gs in this same repo) — different Google Sheet, different
 * SCRIPT_URL, different APP_TOKEN. Do not merge them or reuse the token.
 *
 * SETUP:
 * 1. Extensions > Apps Script from inside this Sheet, paste this whole file in,
 *    replacing whatever's there now.
 * 2. Project Settings > Script Properties, add:
 *      APP_TOKEN = a fresh long random string (do NOT reuse the Scope Deviation
 *      APP_TOKEN — these are two independent gates on two independent backends)
 * 3. Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the Web app URL — it should already match SCRIPT_URL in index.html
 *    since this is an existing deployment; only redeploy if the URL changes.
 * 4. Paste the APP_TOKEN value into BUILDTRACK_APP_TOKEN in index.html.
 *
 * Same accepted tradeoff as the Scope Deviation backend: the token is visible
 * in index.html's source (served from public GitHub Pages) — it's not secret,
 * rate limiting below is the real backstop. See this repo's CLAUDE.md.
 */

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX_READS = 60;   // doGet (full-list load)
const RATE_LIMIT_MAX_WRITES = 20;  // doPost (full-list save)

function checkRateLimit(bucket, max) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + bucket;
  const count = Number(cache.get(key) || 0);
  if (count >= max) {
    throw new Error('Rate limit exceeded — too many requests, try again in a minute.');
  }
  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW_SEC);
}

function checkToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!token || token !== expected) throw new Error('Invalid or missing token');
}

function doGet(e) {
  try {
    checkToken(e.parameter.token);
    checkRateLimit('read', RATE_LIMIT_MAX_READS);
    const sheet = getOrCreateSheet();
    const val = sheet.getRange("A1").getValue();
    const houses = val ? JSON.parse(val) : [];
    return respond({ houses: houses });
  } catch (err) {
    return respond({ houses: [], error: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    checkToken(payload.token);
    checkRateLimit('write', RATE_LIMIT_MAX_WRITES);
    const sheet = getOrCreateSheet();
    sheet.getRange("A1").setValue(JSON.stringify(payload.houses || []));
    return respond({ ok: true });
  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("BuildTrack");
  if (!sheet) sheet = ss.insertSheet("BuildTrack");
  return sheet;
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
