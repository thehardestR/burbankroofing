import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Lead } from '../lib/types'

const fmtSecs = (s: number | null) => {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function Leads() {
  const { isPlatformOwner } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [reps, setReps] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    // Temporary diagnostics: raw payload + whether the server treats this account as platform owner.
    const ownerCheck = await supabase.rpc('is_platform_owner')
    // eslint-disable-next-line no-console
    console.log('[Leads] is_platform_owner =', ownerCheck.data, '| rows =', data?.length, '| error =', error, '| data =', data)
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
                <tr key={l.id}>
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
      </div>
    </div>
  )
}
