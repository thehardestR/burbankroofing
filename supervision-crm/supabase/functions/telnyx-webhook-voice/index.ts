// Telnyx Call Control webhook: logs call lifecycle events from the WebRTC softphone into call_log.
import { serviceClient, verifyTelnyxSignature, json } from '../_shared/telnyx.ts'

Deno.serve(async (req) => {
  const raw = await req.text()
  const ok = await verifyTelnyxSignature(
    raw,
    req.headers.get('telnyx-signature-ed25519') ?? '',
    req.headers.get('telnyx-timestamp') ?? '',
  )
  if (!ok) return json(401, { error: 'bad signature' })

  const evt = JSON.parse(raw)
  const data = evt?.data ?? {}
  const type = data?.event_type as string
  const p = data?.payload ?? {}
  const ccid = p?.call_control_id
  if (!ccid) return json(200, { ignored: true })

  const sb = serviceClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  if (type === 'call.initiated') {
    patch.status = 'initiated'
    patch.started_at = now
  } else if (type === 'call.answered') {
    patch.status = 'answered'
    patch.answered_at = now
  } else if (type === 'call.hangup') {
    patch.status = p?.hangup_cause === 'normal_clearing' ? 'completed' : (p?.hangup_cause ?? 'completed')
    patch.ended_at = now
  } else {
    return json(200, { ignored: type })
  }

  const { data: existing } = await sb
    .from('call_log')
    .select('id, answered_at')
    .eq('telnyx_call_control_id', ccid)
    .maybeSingle()

  if (existing) {
    if (patch.ended_at && existing.answered_at) {
      patch.duration_seconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(existing.answered_at)) / 1000))
    }
    await sb.from('call_log').update(patch).eq('id', existing.id)
  } else {
    await sb.from('call_log').insert({ telnyx_call_control_id: ccid, to_number: p?.to ?? null, from_number: p?.from ?? null, ...patch })
  }
  return json(200, { ok: true })
})
