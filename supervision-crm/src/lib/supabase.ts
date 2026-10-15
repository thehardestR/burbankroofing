import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// True only when both env values are present; the UI uses this to show a setup hint.
export const isConfigured = Boolean(url && anon)

// Placeholders keep createClient from throwing before .env is filled in.
export const supabase = createClient(url || 'http://localhost:54321', anon || 'anon-placeholder')
