import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { LIFECYCLE_LABELS, LIFECYCLE_STAGES, type Contact, type LifecycleStage } from '../lib/types'

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function Contacts() {
  const { isPlatformOwner } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<LifecycleStage | 'all'>('all')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    let query = supabase.from('contacts').select('*').order('updated_at', { ascending: false }).limit(200)
    if (stage !== 'all') query = query.eq('lifecycle_stage', stage)
    // Strip characters that have meaning inside a PostgREST or()/ilike filter before interpolating.
    const q = search.trim().replace(/[%,()*]/g, '')
    if (q) query = query.or(`owner_name.ilike.%${q}%,email.ilike.%${q}%,site_address.ilike.%${q}%,city.ilike.%${q}%`)
    const { data, error } = await query
    setLoading(false)
    if (error) setError(error.message)
    else setContacts((data ?? []) as Contact[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const counts = useMemo(() => {
    const by: Record<string, number> = {}
    for (const c of contacts) by[c.lifecycle_stage] = (by[c.lifecycle_stage] ?? 0) + 1
    return by
  }, [contacts])

  if (!isPlatformOwner) {
    return (
      <div>
        <h1>Contacts</h1>
        <p className="error">Contacts are available to the owner account only.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Contacts</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="stage">Lifecycle stage</label>
            <select id="stage" value={stage} onChange={(e) => setStage(e.target.value as LifecycleStage | 'all')}>
              <option value="all">All stages</option>
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s.stage} value={s.stage}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void load()}
              placeholder="Name, email, address, city…"
            />
          </div>
          <button onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>
          {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          {stage !== 'all' ? ` · ${LIFECYCLE_LABELS[stage]}` : ''}
        </h2>
        {loading ? (
          <p>Loading…</p>
        ) : contacts.length === 0 ? (
          <p>No contacts yet. Import a list from the Campaigns screen to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>City</th>
                <th>Stage</th>
                <th>Jobs</th>
                <th>Lifetime value</th>
                <th>Consent</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.owner_name ?? '—'}</td>
                  <td>{c.phones?.[0] ?? '—'}</td>
                  <td>{c.city ?? '—'}</td>
                  <td>
                    <span className={`stage ${c.lifecycle_stage}`}>{LIFECYCLE_LABELS[c.lifecycle_stage]}</span>
                  </td>
                  <td>{c.projects_count}</td>
                  <td>{c.projects_count > 0 ? money(c.lifetime_value) : '—'}</td>
                  <td>
                    {c.dnc && <span className="flag danger" title="Do not call">DNC</span>}
                    {c.email_opt_out && <span className="flag" title="Email opt-out">No email</span>}
                    {c.sms_opt_out && <span className="flag" title="SMS opt-out">No SMS</span>}
                    {!c.dnc && !c.email_opt_out && !c.sms_opt_out && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {Object.keys(counts).length > 1 && (
          <p style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
            {LIFECYCLE_STAGES.filter((s) => counts[s.stage]).map((s) => `${s.label}: ${counts[s.stage]}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
