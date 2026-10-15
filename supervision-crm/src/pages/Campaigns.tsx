import { type ChangeEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Campaign } from '../lib/types'
import {
  type Mapping,
  type Sheet,
  IMPORT_FIELDS,
  buildCallListRows,
  buildCleanSet,
  emptyMapping,
  guessMapping,
  readSheet,
} from '../lib/import'

const FIELD_LABELS: Record<(typeof IMPORT_FIELDS)[number], string> = {
  owner_name: 'Owner / contact name',
  site_address: 'Site address',
  phone: 'Phone (required)',
  city: 'City',
  email: 'Email',
}

interface Msg {
  text: string
  kind?: 'error' | 'ok'
}

type CampaignRow = Campaign & { contacts: number }

export default function Campaigns() {
  const { isPlatformOwner, session } = useAuth()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [name, setName] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapping, setMapping] = useState<Mapping>(emptyMapping())
  const [cleanSet, setCleanSet] = useState<Set<string>>(new Set())
  const [scrubInfo, setScrubInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)

  async function loadCampaigns() {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id,name,status,created_at')
      .order('created_at', { ascending: false })
    if (error) {
      setMsg({ text: error.message, kind: 'error' })
      return
    }
    const camps = (data ?? []) as Campaign[]
    const withCounts = await Promise.all(
      camps.map(async (c) => {
        const { count } = await supabase
          .from('call_list')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)
        return { ...c, contacts: count ?? 0 }
      }),
    )
    setCampaigns(withCounts)
  }

  useEffect(() => {
    if (isPlatformOwner) void loadCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformOwner])

  async function onMainFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg({ text: 'Reading file…' })
    try {
      const s = await readSheet(file)
      setSheet(s)
      setMapping(guessMapping(s.headers))
      setMsg(null)
    } catch (err) {
      setMsg({ text: (err as Error).message, kind: 'error' })
    }
  }

  async function onScrubFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setCleanSet(new Set())
      setScrubInfo('')
      return
    }
    try {
      const s = await readSheet(file)
      const set = buildCleanSet(s)
      setCleanSet(set)
      setScrubInfo(
        `Clean results: ${s.rows.length} numbers checked · ${set.size} clean (only these will be dialed).` +
          (set.size === 0 ? ' ⚠ none marked clean — check the file’s columns.' : ''),
      )
    } catch (err) {
      setScrubInfo((err as Error).message)
    }
  }

  async function upload() {
    if (!sheet || !session) return
    const nm = name.trim()
    if (!nm) {
      setMsg({ text: 'Give the campaign a name.', kind: 'error' })
      return
    }
    if (!mapping.phone) {
      setMsg({ text: 'Pick which column holds the phone number.', kind: 'error' })
      return
    }
    setBusy(true)
    setMsg({ text: 'Creating campaign…' })
    const { data: camp, error: cErr } = await supabase
      .from('campaigns')
      .insert({ name: nm, source: 'telemarketer', created_by: session.user.id })
      .select('id')
      .single()
    if (cErr || !camp) {
      setBusy(false)
      setMsg({ text: 'Upload failed: ' + (cErr?.message ?? 'unknown error'), kind: 'error' })
      return
    }

    const { rows, dropped, skipped } = buildCallListRows(camp.id, sheet, mapping, cleanSet)
    if (rows.length === 0) {
      setBusy(false)
      setMsg({ text: 'No contacts with a usable phone number to upload.', kind: 'error' })
      return
    }

    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const { error } = await supabase.from('call_list').insert(chunk)
      if (error) {
        setBusy(false)
        setMsg({ text: `Uploaded ${i} rows, then failed: ${error.message}`, kind: 'error' })
        return
      }
      setMsg({ text: `Uploading… ${Math.min(i + BATCH, rows.length)}/${rows.length}` })
    }

    let summary = `Campaign “${nm}” uploaded with ${rows.length} contacts.`
    if (cleanSet.size > 0) {
      summary += ` Clean numbers only — removed ${dropped} non-clean, skipped ${skipped} with no clean number.`
    }
    setName('')
    setSheet(null)
    setMapping(emptyMapping())
    setCleanSet(new Set())
    setScrubInfo('')
    setBusy(false)
    setMsg({ text: summary, kind: 'ok' })
    void loadCampaigns()
  }

  if (!isPlatformOwner) {
    return (
      <div>
        <h1>Campaigns</h1>
        <p className="error">Campaigns are available to the owner account only.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Campaigns</h1>
      {msg && <p className={msg.kind === 'error' ? 'error' : msg.kind === 'ok' ? 'ok' : undefined}>{msg.text}</p>}

      <div className="card">
        <h2>New campaign</h2>
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
          Upload your list <strong>after DNC screening</strong>. Optionally attach the scrubber’s clean-results
          file to dial only numbers it marked clean. Imported contacts are auto-deduped into Contacts.
        </p>

        <label htmlFor="camp-name">Campaign name</label>
        <input
          id="camp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Burbank — March 2026"
        />

        <label htmlFor="camp-file">Contact list (CSV or Excel)</label>
        <input id="camp-file" type="file" accept=".csv,.xlsx,.xls" onChange={onMainFile} />

        <label htmlFor="scrub-file">Clean / DNC results file (optional)</label>
        <input id="scrub-file" type="file" accept=".csv,.xlsx,.xls" onChange={onScrubFile} />
        {scrubInfo && <p style={{ fontSize: 13, opacity: 0.8 }}>{scrubInfo}</p>}

        {sheet && (
          <>
            <p style={{ marginTop: 12 }}>
              <strong>{sheet.rows.length}</strong> rows found. Map the columns:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {IMPORT_FIELDS.map((f) => (
                <div key={f}>
                  <label htmlFor={`map-${f}`}>{FIELD_LABELS[f]}</label>
                  <select
                    id={`map-${f}`}
                    value={mapping[f]}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                  >
                    <option value="">— none —</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={() => void upload()} disabled={busy || !mapping.phone}>
                {busy ? 'Uploading…' : 'Upload campaign'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Campaigns</h2>
        {campaigns.length === 0 ? (
          <p>No campaigns yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Contacts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`status ${c.status}`}>{c.status}</span>
                  </td>
                  <td>{c.contacts}</td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
