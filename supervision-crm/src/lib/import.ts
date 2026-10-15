// CSV/Excel campaign import: parsing, phone normalization, and DNC-allowlist filtering.
// Ported from the vanilla dialer (dialer/js/owner.js) so behavior matches the existing upload.
// Papa/XLSX are loaded on demand (dynamic import) to keep them out of the main app bundle.
import type { ParseResult } from 'papaparse'

export type Row = Record<string, unknown>
export interface Sheet {
  headers: string[]
  rows: Row[]
}

export const IMPORT_FIELDS = ['owner_name', 'site_address', 'phone', 'city', 'email'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export type Mapping = Record<ImportField, string>

const FIELD_GUESS: Record<ImportField, RegExp> = {
  owner_name: /(owner|name|contact)/i,
  site_address: /(address|situs|street|property)/i,
  phone: /(phone|tel|mobile|cell)/i,
  city: /city/i,
  email: /e-?mail/i,
}

const PHONE_RE = /(phone|tel|mobile|cell)/i

export function emptyMapping(): Mapping {
  return { owner_name: '', site_address: '', phone: '', city: '', email: '' }
}

export function readSheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      void import('papaparse').then(({ default: Papa }) => {
        Papa.parse<Row>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res: ParseResult<Row>) => resolve({ headers: res.meta.fields ?? [], rows: res.data }),
          error: (err: Error) => reject(new Error('Could not read CSV: ' + err.message)),
        })
      })
    })
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      void import('xlsx')
        .then((XLSX) => {
          const wb = XLSX.read(ev.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' })
          const headers = rows.length ? Object.keys(rows[0]) : []
          resolve({ headers, rows })
        })
        .catch((err) => reject(new Error('Could not read Excel: ' + (err as Error).message)))
    }
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsArrayBuffer(file)
  })
}

// Compare numbers by their last 10 digits so formatting never matters.
export function normPhone(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') return d.slice(1)
  if (d.length >= 10) return d.slice(-10)
  return null
}

export function pick(row: Row, col: string): string | null {
  if (!col) return null
  const v = row[col]
  return v === undefined || v === null || v === '' ? null : String(v).trim()
}

export function phoneColumns(headers: string[]): string[] {
  return headers.filter((c) => PHONE_RE.test(c) && !/type/i.test(c))
}

export function guessMapping(headers: string[]): Mapping {
  const map = emptyMapping()
  for (const f of IMPORT_FIELDS) {
    map[f] = headers.find((h) => FIELD_GUESS[f].test(h)) ?? ''
  }
  return map
}

function detectScrubPhoneCol(headers: string[], rows: Row[]): string {
  const llr = headers.find((h) => /llr.*(phone|number)/i.test(h))
  if (llr) return llr
  const byName = headers.find((h) => /phone|number|tel|mobile|cell/i.test(h))
  if (byName) return byName
  let best = headers[0]
  let bestScore = -1
  for (const h of headers) {
    let score = 0
    for (const r of rows.slice(0, 25)) if (normPhone(r[h])) score++
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  }
  return best
}

// Allowlist: a number is dialable only if the scrubber's results file marks it clean (and the line
// type is not invalid). Anything not explicitly clean is withheld. Empty set = no filtering.
export function buildCleanSet(scrub: Sheet): Set<string> {
  const set = new Set<string>()
  if (!scrub.rows.length) return set
  const phoneCol = detectScrubPhoneCol(scrub.headers, scrub.rows)
  const dncCol = scrub.headers.find((h) => /dnc/i.test(h))
  const ltCol = scrub.headers.find((h) => /line.?type/i.test(h))
  for (const r of scrub.rows) {
    const n = normPhone(r[phoneCol])
    if (!n) continue
    const dnc = String((dncCol ? r[dncCol] : '') || '').trim().toLowerCase()
    const lt = String((ltCol ? r[ltCol] : '') || '').trim().toLowerCase()
    const okDnc = dncCol ? dnc === 'clean' : true
    const okLt = lt !== 'invalid'
    if (okDnc && okLt) set.add(n)
  }
  return set
}

export interface CallListInsert {
  campaign_id: string
  owner_name: string | null
  site_address: string | null
  phone: string
  phones: string[]
  city: string | null
  email: string | null
  raw: Row
}

export interface BuildResult {
  rows: CallListInsert[]
  dropped: number
  skipped: number
}

// Collect each contact's numbers (mapped column first, then other phone columns), de-duped.
// When a clean allowlist is supplied, keep only numbers on it; phones[] drives "try the next number".
export function buildCallListRows(
  campaignId: string,
  sheet: Sheet,
  mapping: Mapping,
  cleanSet: Set<string>,
): BuildResult {
  const phoneCols = [
    mapping.phone,
    ...sheet.headers.filter((h) => h !== mapping.phone && PHONE_RE.test(h) && !/type/i.test(h)),
  ]
  const filtering = cleanSet.size > 0
  let dropped = 0
  let skipped = 0
  const rows: CallListInsert[] = []
  for (const r of sheet.rows) {
    const seen = new Set<string>()
    const nums: { display: string; norm: string }[] = []
    for (const c of phoneCols) {
      const v = pick(r, c)
      if (!v) continue
      const n = normPhone(v)
      if (!n || seen.has(n)) continue
      seen.add(n)
      nums.push({ display: v, norm: n })
    }
    const before = nums.length
    const keep = filtering ? nums.filter((x) => cleanSet.has(x.norm)) : nums
    dropped += before - keep.length
    if (keep.length === 0) {
      if (before > 0) skipped++
      continue
    }
    rows.push({
      campaign_id: campaignId,
      owner_name: pick(r, mapping.owner_name),
      site_address: pick(r, mapping.site_address),
      phone: keep[0].display,
      phones: keep.map((x) => x.display),
      city: pick(r, mapping.city),
      email: pick(r, mapping.email),
      raw: r,
    })
  }
  return { rows, dropped, skipped }
}
