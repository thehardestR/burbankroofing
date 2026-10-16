import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { memberships, isPlatformOwner, activeContractorId, setActiveContractorId, signOut } = useAuth()
  const active = memberships.find((m) => m.contractor_id === activeContractorId)

  return (
    <div>
      <header className="topbar">
        <div className="brand">Supervision CRM</div>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/projects">Projects</Link>
          {isPlatformOwner && <Link to="/contacts">Contacts</Link>}
          {isPlatformOwner && <Link to="/campaigns">Campaigns</Link>}
          {isPlatformOwner && <Link to="/funnel">Funnel</Link>}
          {isPlatformOwner && <Link to="/automations">Automations</Link>}
          <Link to="/appointments">Appointments</Link>
        </nav>
        <div className="spacer" />
        {memberships.length > 0 && (
          <select
            value={activeContractorId ?? ''}
            onChange={(e) => setActiveContractorId(e.target.value)}
            aria-label="Active contractor"
          >
            {memberships.map((m) => (
              <option key={m.contractor_id} value={m.contractor_id}>
                {m.contractor?.legal_name ?? m.contractor_id}
              </option>
            ))}
          </select>
        )}
        {active && <span className="role-badge">{active.title ?? active.role}</span>}
        <button className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
