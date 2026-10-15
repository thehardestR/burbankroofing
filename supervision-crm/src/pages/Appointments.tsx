import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APPOINTMENT_STATUSES, type Appointment } from '../lib/types'

type Row = Appointment & {
  contact: { owner_name: string | null; phones: string[]; city: string | null } | null
}

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function Appointments() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('appointments')
      .select('*, contact:contacts(owner_name, phones, city)')
      .order('scheduled_at', { ascending: true })
    setLoading(false)
    if (error) setError(error.message)
    else setRows((data ?? []) as Row[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) setError(error.message)
    else void load()
  }

  const now = Date.now()
  const upcoming = rows.filter((r) => Date.parse(r.scheduled_at) >= now)
  const past = rows.filter((r) => Date.parse(r.scheduled_at) < now)

  const renderTable = (list: Row[]) => (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>Contact</th>
          <th>Phone</th>
          <th>City</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id}>
            <td>{fmt(r.scheduled_at)}</td>
            <td>{r.contact?.owner_name ?? '—'}</td>
            <td>{r.contact?.phones?.[0] ?? '—'}</td>
            <td>{r.contact?.city ?? '—'}</td>
            <td>
              <select value={r.status} onChange={(e) => void setStatus(r.id, e.target.value)} style={{ width: 'auto' }}>
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div>
      <h1>Appointments</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>Upcoming ({upcoming.length})</h2>
        {loading ? <p>Loading…</p> : upcoming.length === 0 ? <p>No upcoming appointments.</p> : renderTable(upcoming)}
      </div>

      {past.length > 0 && (
        <div className="card">
          <h2>Past ({past.length})</h2>
          {renderTable(past)}
        </div>
      )}
    </div>
  )
}
