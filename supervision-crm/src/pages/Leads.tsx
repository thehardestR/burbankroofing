import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { LEAD_STATUSES, type Lead } from '../lib/types'

const fmtSecs = (s: number | null) => {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// datetime-local <-> ISO helpers (keep the picker in the user's local time).
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export default function Leads() {
  const { isPlatformOwner } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [reps, setReps] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Lead | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    const rows = (data ?? []) as Lead[]
    setLeads(rows)
    // Resolve the rep who worked each lead (rep_profile_id -> profile) in one follow-up query.
    const ids = [...new Set(rows.map((r) => r.rep_profile_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email, full_name').in('id', ids)
      const map: Record<string, string> = {}
      for (const p of profs ?? []) map[p.id] = p.full_name || p.email || p.id.slice(0, 8)
      setReps(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isPlatformOwner) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformOwner])

  function edit<K extends keyof Lead>(key: K, value: Lead[K]) {
    setSel((s) => (s ? { ...s, [key]: value } : s))
  }

  async function save() {
    if (!sel) return
    setSaving(true)
    setSavedMsg(null)
    setError(null)
    const { error } = await supabase
      .from('leads')
      .update({
        owner_name: sel.owner_name,
        phone: sel.phone,
        email: sel.email,
        city: sel.city,
        status: sel.status,
        service_type: sel.service_type,
        appointment_at: sel.appointment_at,
        notes: sel.notes,
      })
      .eq('id', sel.id)
    setSaving(false)
    if (error) setError(error.message)
    else {
      setSavedMsg('Saved.')
      void load()
    }
  }

  if (!isPlatformOwner) {
    return (
      <div>
        <h1>Leads</h1>
        <p className="error">Leads are available to the owner account only.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Leads</h1>
      {error && <p className="error">{error}</p>}

      {sel && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Edit lead</h2>
            <button className="secondary" onClick={() => setSel(null)}>
              Close
            </button>
          </div>
          {savedMsg && <p className="ok">{savedMsg}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label>Name</label>
              <input value={sel.owner_name ?? ''} onChange={(e) => edit('owner_name', e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input value={sel.phone ?? ''} onChange={(e) => edit('phone', e.target.value)} />
            </div>
            <div>
              <label>Email</label>
              <input value={sel.email ?? ''} onChange={(e) => edit('email', e.target.value)} />
            </div>
            <div>
              <label>City</label>
              <input value={sel.city ?? ''} onChange={(e) => edit('city', e.target.value)} />
            </div>
            <div>
              <label>Status</label>
              <select value={sel.status} onChange={(e) => edit('status', e.target.value)}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Service type</label>
              <input value={sel.service_type ?? ''} onChange={(e) => edit('service_type', e.target.value)} />
            </div>
            <div>
              <label>Appointment</label>
              <input
                type="datetime-local"
                value={toLocalInput(sel.appointment_at)}
                onChange={(e) => edit('appointment_at', fromLocalInput(e.target.value))}
              />
            </div>
          </div>
          <label style={{ marginTop: 8 }}>Notes</label>
          <textarea rows={4} value={sel.notes ?? ''} onChange={(e) => edit('notes', e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>
          {leads.length} lead{leads.length === 1 ? '' : 's'}
        </h2>
        {loading ? (
          <p>Loading…</p>
        ) : leads.length === 0 ? (
          <p>No leads yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>City</th>
                <th>Status</th>
                <th>Worked by</th>
                <th>Call</th>
                <th>Appointment</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => {
                    setSel({ ...l })
                    setSavedMsg(null)
                  }}
                  style={{ cursor: 'pointer', background: sel?.id === l.id ? '#eff6ff' : undefined }}
                >
                  <td>{l.owner_name ?? '—'}</td>
                  <td>{l.phone ?? '—'}</td>
                  <td>{l.email ?? '—'}</td>
                  <td>{l.city ?? '—'}</td>
                  <td>
                    <span className={`status ${l.status}`}>{l.status}</span>
                  </td>
                  <td>{l.rep_profile_id ? reps[l.rep_profile_id] ?? '…' : '—'}</td>
                  <td>{fmtSecs(l.call_seconds)}</td>
                  <td>{fmtDate(l.appointment_at)}</td>
                  <td style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{l.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && leads.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>Click any lead to edit its info.</p>
        )}
      </div>
    </div>
  )
}
