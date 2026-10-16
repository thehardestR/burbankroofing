import { useEffect, useState } from 'react'
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
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 200

  async function load() {
    setLoading(true)
    setError(null)
    const from = page * PAGE_SIZE
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (stage !== 'all') query = query.eq('lifecycle_stage', stage)
    // Strip characters that have meaning inside a PostgREST or()/ilike filter before interpolating.
    const q = appliedSearch.trim().replace(/[%,()*]/g, '')
    if (q) query = query.or(`owner_name.ilike.%${q}%,email.ilike.%${q}%,site_address.ilike.%${q}%,city.ilike.%${q}%`)
    const { data, error, count } = await query
    setLoading(false)
    if (error) setError(error.message)
    else {
      setContacts((data ?? []) as Contact[])
      setTotal(count ?? 0)
    }
  }

  function applySearch() {
    setPage(0)
    setAppliedSearch(search)
  }

  async function updateStage(id: string, next: LifecycleStage) {
    const { error } = await supabase.rpc('set_lifecycle_stage', { p_contact: id, p_stage: next })
    if (error) setError(error.message)
    else setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, lifecycle_stage: next } : c)))
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, page, appliedSearch])

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
            <select
              id="stage"
              value={stage}
              onChange={(e) => {
                setPage(0)
                setStage(e.target.value as LifecycleStage | 'all')
              }}
            >
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
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="Name, email, address, city…"
            />
          </div>
          <button onClick={applySearch} disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>
          {total.toLocaleString()} contact{total === 1 ? '' : 's'}
          {stage !== 'all' ? ` · ${LIFECYCLE_LABELS[stage]}` : ''}
          {total > PAGE_SIZE && (
            <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.7 }}>
              {' '}· showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + contacts.length}
            </span>
          )}
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
                    <select
                      className={`stage ${c.lifecycle_stage}`}
                      value={c.lifecycle_stage}
                      onChange={(e) => void updateStage(c.id, e.target.value as LifecycleStage)}
                      style={{ width: 'auto', padding: '2px 6px' }}
                      title="Set lifecycle stage"
                    >
                      {LIFECYCLE_STAGES.map((s) => (
                        <option key={s.stage} value={s.stage}>
                          {s.label}
                        </option>
                      ))}
                    </select>
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
        {total > PAGE_SIZE && (
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
              ← Prev
            </button>
            <span style={{ fontSize: 13 }}>
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <button
              className="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
