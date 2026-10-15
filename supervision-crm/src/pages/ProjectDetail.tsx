import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PHASE_LABELS, STANDARD_PHASES } from '../lib/types'
import type { JobPhase, Project } from '../lib/types'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [phases, setPhases] = useState<JobPhase[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    const { data: p, error: pe } = await supabase.from('projects').select('*').eq('id', id).single()
    if (pe) {
      setError(pe.message)
      return
    }
    setProject((p as Project) ?? null)
    const { data: ph, error: he } = await supabase
      .from('job_phases')
      .select('*')
      .eq('project_id', id)
      .order('sequence', { ascending: true })
    if (he) {
      setError(he.message)
      return
    }
    setPhases((ph ?? []) as JobPhase[])
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function createStandardPhases() {
    if (!id) return
    const rows = STANDARD_PHASES.map((p) => ({ project_id: id, phase: p.phase, sequence: p.sequence }))
    const { error } = await supabase.from('job_phases').insert(rows)
    if (error) {
      setError(error.message)
      return
    }
    void load()
  }

  if (!project) {
    return <div>{error ? <p className="error">{error}</p> : <p>Loading…</p>}</div>
  }

  return (
    <div>
      <h1>{project.job_number ?? 'Job'}</h1>
      <div className="card">
        <div>
          <strong>Homeowner:</strong> {project.homeowner_name ?? '—'}
        </div>
        <div>
          <strong>Address:</strong> {project.site_address ?? '—'}
        </div>
        <div>
          <strong>Roof type:</strong> {project.roof_type ?? '—'}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Phases</h2>
          {phases.length === 0 && <button onClick={createStandardPhases}>Create standard phases</button>}
        </div>
        {error && <p className="error">{error}</p>}
        {phases.length === 0 ? (
          <p>No phases yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Phase</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((ph) => (
                <tr key={ph.id}>
                  <td>{ph.sequence}</td>
                  <td>{PHASE_LABELS[ph.phase]}</td>
                  <td>
                    <span className={`status ${ph.status}`}>{ph.status}</span>
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
