// Shared helpers for the Telnyx + Supabase edge functions.
// Deploy: `supabase functions deploy <name>`. Secrets required (supabase secrets set):
//   TELNYX_API_KEY, TELNYX_PUBLIC_KEY, TELNYX_FROM_NUMBER, TELNYX_MESSAGING_PROFILE_ID,
//   TELNYX_CONNECTION_ID, TELNYX_EMAIL_FROM, CAMPAIGN_CTA_URL,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const TELNYX_API = 'https://api.telnyx.com/v2'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

export function optEnv(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

export function telnyx(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${TELNYX_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('TELNYX_API_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : null
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Verify a Telnyx Ed25519 webhook signature over `timestamp|rawBody`.
export async function verifyTelnyxSignature(rawBody: string, signatureB64: string, timestamp: string): Promise<boolean> {
  try {
    if (!signatureB64 || !timestamp) return false
    const key = await crypto.subtle.importKey('raw', b64ToBytes(env('TELNYX_PUBLIC_KEY')), { name: 'Ed25519' }, false, ['verify'])
    const signed = new TextEncoder().encode(`${timestamp}|${rawBody}`)
    return await crypto.subtle.verify('Ed25519', key, b64ToBytes(signatureB64), signed)
  } catch {
    return false
  }
}

// Resolve the authenticated caller (any valid Supabase user).
export async function requireUser(req: Request, sb: SupabaseClient): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) throw new Error('unauthorized')
  return data.user.id
}

// Require the platform owner (an active 'rmo' membership).
export async function requireOwner(req: Request, sb: SupabaseClient): Promise<string> {
  const uid = await requireUser(req, sb)
  const { data } = await sb.from('memberships').select('id').eq('profile_id', uid).eq('role', 'rmo').eq('status', 'active').limit(1)
  if (!data || data.length === 0) throw new Error('forbidden')
  return uid
}

// Minimal {{var}} template rendering.
export function render(tpl: string, vars: Record<string, string>): string {
  return (tpl ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '')
}

export function firstName(fullName: string | null): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'there'
}
