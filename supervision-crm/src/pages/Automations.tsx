import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Automation, MessageTemplate } from '../lib/types'

export default function Automations() {
  const { isPlatformOwner } = useAuth()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    const [a, t] = await Promise.all([
      supabase.from('automations').select('*').order('name'),
      supabase.from('message_templates').select('*').order('kind'),
    ])
    if (a.error) setError(a.error.message)
    else setAutomations((a.data ?? []) as Automation[])
    if (!t.error) setTemplates((t.data ?? []) as MessageTemplate[])
  }

  useEffect(() => {
    if (isPlatformOwner) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformOwner])

  async function toggle(a: Automation) {
    const { error } = await supabase.from('automations').update({ enabled: !a.enabled }).eq('id', a.id)
    if (error) setError(error.message)
    else void load()
  }

  if (!isPlatformOwner) {
    return (
      <div>
        <h1>Automations</h1>
        <p className="error">Automations are available to the owner account only.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Automations</h1>
      {error && <p className="error">{error}</p>}
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        Built-in funnel automations run server-side (Telnyx). SMS steps need a 10DLC-registered number before they send.
      </p>

      <div className="card">
        <h2>Funnel automations</h2>
        <table>
          <thead>
            <tr>
              <th>Automation</th>
              <th>Settings</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {automations.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td style={{ fontSize: 12, color: '#64748b' }}>
                  {Object.entries(a.params ?? {})
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(' · ') || '—'}
                </td>
                <td>
                  <button className={a.enabled ? 'secondary' : undefined} onClick={() => void toggle(a)}>
                    {a.enabled ? 'On' : 'Off'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Message templates</h2>
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Name</th>
              <th>Subject / preview</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.kind}</td>
                <td>{t.name}</td>
                <td style={{ fontSize: 12, color: '#64748b' }}>
                  {t.subject ?? t.body.replace(/<[^>]+>/g, '').slice(0, 70)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
