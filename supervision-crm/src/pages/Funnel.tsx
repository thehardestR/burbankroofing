import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { LIFECYCLE_LABELS, LIFECYCLE_STAGES, type LifecycleStage } from '../lib/types'

type Build = (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>
function baseQuery(table: string) {
  return supabase.from(table).select('id', { count: 'exact', head: true })
}
async function countRows(table: string, build?: Build): Promise<number> {
  let q = baseQuery(table)
  if (build) q = build(q)
  const { count } = await q
  return count ?? 0
}

interface Stats {
  contacts: number
  campaigns: number
  leads: number
  pending: number
  good: number
  noAnswer: number
  emailsSent: number
  opened: number
  clicked: number
  replied: number
  smsSent: number
  apptUpcoming: number
  stages: Record<string, number>
}

export default function Funnel() {
  const { isPlatformOwner } = useAuth()
  const [s, setS] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const nowIso = new Date().toISOString()
    const [
      contacts, campaigns, leads, pending, good, noAnswer,
      emailsSent, opened, clicked, replied, smsSent, apptUpcoming,
    ] = await Promise.all([
      countRows('contacts'),
      countRows('campaigns'),
      countRows('leads'),
      countRows('call_list', (q) => q.eq('status', 'pending')),
      countRows('call_list', (q) => q.eq('status', 'good')),
      countRows('call_list', (q) => q.eq('status', 'no_answer')),
      countRows('email_messages'),
      countRows('email_messages', (q) => q.not('opened_at', 'is', null)),
      countRows('email_messages', (q) => q.not('clicked_at', 'is', null)),
      countRows('email_messages', (q) => q.not('replied_at', 'is', null)),
      countRows('sms_messages', (q) => q.eq('direction', 'outbound')),
      countRows('appointments', (q) => q.gte('scheduled_at', nowIso)),
    ])
    const stageEntries = await Promise.all(
      LIFECYCLE_STAGES.map(async (st) => [st.stage, await countRows('contacts', (q) => q.eq('lifecycle_stage', st.stage))] as const),
    )
    setS({
      contacts, campaigns, leads, pending, good, noAnswer,
      emailsSent, opened, clicked, replied, smsSent, apptUpcoming,
      stages: Object.fromEntries(stageEntries),
    })
    setLoading(false)
  }

  useEffect(() => {
    if (isPlatformOwner) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformOwner])

  if (!isPlatformOwner) {
    return (
      <div>
        <h1>Funnel</h1>
        <p className="error">The funnel dashboard is available to the owner account only.</p>
      </div>
    )
  }

  const kpi = (num: number, label: string) => (
    <div className="kpi" key={label}>
      <div className="num">{num.toLocaleString()}</div>
      <div className="label">{label}</div>
    </div>
  )

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Funnel</h1>
        <button className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {!s ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="card">
            <h2>Pipeline</h2>
            <div className="kpis">
              {kpi(s.contacts, 'Contacts')}
              {kpi(s.campaigns, 'Campaigns')}
              {kpi(s.pending, 'To call')}
              {kpi(s.good, 'Good calls')}
              {kpi(s.leads, 'Leads')}
              {kpi(s.apptUpcoming, 'Upcoming appts')}
            </div>
          </div>

          <div className="card">
            <h2>Email engagement</h2>
            <div className="kpis">
              {kpi(s.emailsSent, 'Sent')}
              {kpi(s.opened, 'Opened')}
              {kpi(s.clicked, 'Clicked')}
              {kpi(s.replied, 'Replied')}
              {kpi(s.smsSent, 'SMS sent')}
              {kpi(s.noAnswer, 'No answer')}
            </div>
          </div>

          <div className="card">
            <h2>Lifecycle</h2>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {LIFECYCLE_STAGES.map((st) => (
                  <tr key={st.stage}>
                    <td>
                      <span className={`stage ${st.stage}`}>{LIFECYCLE_LABELS[st.stage as LifecycleStage]}</span>
                    </td>
                    <td>{s.stages[st.stage] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
