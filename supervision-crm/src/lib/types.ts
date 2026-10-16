export type UserRole = 'rmo' | 'contractor_admin' | 'project_manager' | 'field_crew' | 'auditor'

export type PhaseType =
  | 'contract'
  | 'permit'
  | 'material_delivery'
  | 'tearoff'
  | 'decking'
  | 'underlayment'
  | 'city_inspection_presheathing'
  | 'install'
  | 'final_inspection'
  | 'completion'

export type PhaseStatus = 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected'

export interface Contractor {
  id: string
  legal_name: string
  dba: string | null
  cslb_license_no: string | null
  classification: string
  license_status: string | null
  license_expiry: string | null
}

export interface Membership {
  id: string
  contractor_id: string
  role: UserRole
  status: string
  title: string | null
  contractor: Contractor | null
}

export interface Project {
  id: string
  contractor_id: string
  job_number: string | null
  homeowner_name: string | null
  site_address: string | null
  roof_type: string | null
  scope_summary: string | null
  contract_value: number | null
  status: string
  created_at: string
}

export interface JobPhase {
  id: string
  project_id: string
  phase: PhaseType
  status: PhaseStatus
  required_photo_count: number
  sequence: number | null
  completed_at: string | null
}

// Canonical roofing job lifecycle (matches CRM-SUPERVISOR-PLAN.md section 5).
export const STANDARD_PHASES: { phase: PhaseType; label: string; sequence: number }[] = [
  { phase: 'contract', label: 'Contract', sequence: 1 },
  { phase: 'permit', label: 'Permit', sequence: 2 },
  { phase: 'material_delivery', label: 'Material Delivery', sequence: 3 },
  { phase: 'tearoff', label: 'Tearoff', sequence: 4 },
  { phase: 'decking', label: 'Decking / Sheathing', sequence: 5 },
  { phase: 'underlayment', label: 'Underlayment', sequence: 6 },
  { phase: 'city_inspection_presheathing', label: 'Pre-Cover Inspection', sequence: 7 },
  { phase: 'install', label: 'Install', sequence: 8 },
  { phase: 'final_inspection', label: 'Final Inspection', sequence: 9 },
  { phase: 'completion', label: 'Completion', sequence: 10 },
]

export const PHASE_LABELS: Record<PhaseType, string> = STANDARD_PHASES.reduce((acc, p) => {
  acc[p.phase] = p.label
  return acc
}, {} as Record<PhaseType, string>)

// Unified lead/customer lifecycle: one label follows a contact from cold to repeat customer.
export type LifecycleStage =
  | 'cold'
  | 'contacted'
  | 'engaged'
  | 'lead'
  | 'appointment'
  | 'customer'
  | 'repeat_customer'
  | 'lost'

export const LIFECYCLE_STAGES: { stage: LifecycleStage; label: string }[] = [
  { stage: 'cold', label: 'Cold' },
  { stage: 'contacted', label: 'Contacted' },
  { stage: 'engaged', label: 'Engaged' },
  { stage: 'lead', label: 'Lead' },
  { stage: 'appointment', label: 'Appointment' },
  { stage: 'customer', label: 'Customer' },
  { stage: 'repeat_customer', label: 'Repeat Customer' },
  { stage: 'lost', label: 'Lost' },
]

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = LIFECYCLE_STAGES.reduce(
  (acc, s) => {
    acc[s.stage] = s.label
    return acc
  },
  {} as Record<LifecycleStage, string>,
)

export interface Contact {
  id: string
  owner_name: string | null
  site_address: string | null
  city: string | null
  email: string | null
  phones: string[]
  email_opt_out: boolean
  sms_opt_out: boolean
  dnc: boolean
  engagement_score: number
  lifecycle_stage: LifecycleStage
  customer_since: string | null
  projects_count: number
  lifetime_value: number
  last_emailed_at: string | null
  last_called_at: string | null
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  status: string
  created_at: string
}

export interface Appointment {
  id: string
  lead_id: string | null
  contact_id: string | null
  scheduled_at: string
  status: string
  reminder_sent_at: string | null
  notes: string | null
  created_at: string
}

export interface Automation {
  id: string
  key: string
  name: string
  enabled: boolean
  params: Record<string, unknown>
}

export interface MessageTemplate {
  id: string
  kind: 'email' | 'sms'
  key: string
  name: string
  subject: string | null
  body: string
  active: boolean
}

export const APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'completed', 'no_show', 'canceled'] as const
