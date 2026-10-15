import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Project } from '../lib/types'

export default function Projects() {
  const { activeContractorId } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobNumber, setJobNumber] = useState('')
  const [homeowner, setHomeowner] = useState('')
  const [address, setAddress] = useState('')

  async function load() {
    if (!activeContractorId) {
      setProjects([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('contractor_id', activeContractorId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) setError(error.message)
    else setProjects((data ?? []) as Project[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContractorId])

  async function createProject(e: FormEvent) {
    e.preventDefault()
    if (!activeContractorId) return
    setError(null)
    const { error } = await supabase.from('projects').insert({
      contractor_id: activeContractorId,
      job_number: jobNumber || null,
      homeowner_name: homeowner || null,
      site_address: address || null,
    })
    if (error) {
      setError(error.message)
      return
    }
    setJobNumber('')
    setHomeowner('')
    setAddress('')
    void load()
  }

  return (
    <div>
      <h1>Projects</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>New job</h2>
        <form onSubmit={createProject}>
          <label htmlFor="job">Job number</label>
          <input id="job" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. 2026-014" />
          <label htmlFor="owner">Homeowner</label>
          <input id="owner" value={homeowner} onChange={(e) => setHomeowner(e.target.value)} />
          <label htmlFor="addr">Site address</label>
          <input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={!activeContractorId}>
              Create job
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Jobs</h2>
        {loading ? (
          <p>Loading…</p>
        ) : projects.length === 0 ? (
          <p>No jobs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Job #</th>
                <th>Homeowner</th>
                <th>Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>{p.job_number ?? p.id.slice(0, 8)}</Link>
                  </td>
                  <td>{p.homeowner_name ?? '—'}</td>
                  <td>{p.site_address ?? '—'}</td>
                  <td>
                    <span className={`status ${p.status}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
