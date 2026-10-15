import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/supabase'

export default function Dashboard() {
  const { memberships, session } = useAuth()

  return (
    <div>
      {!isConfigured && (
        <div className="banner">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>, set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
        </div>
      )}
      <h1>Dashboard</h1>
      <p>
        Signed in as <strong>{session?.user.email}</strong>
      </p>
      <div className="card">
        <h2>Your contractors</h2>
        {memberships.length === 0 ? (
          <p>No contractor memberships yet.</p>
        ) : (
          <ul>
            {memberships.map((m) => (
              <li key={m.id}>
                {m.contractor?.legal_name ?? m.contractor_id} — <em>{m.role}</em>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
