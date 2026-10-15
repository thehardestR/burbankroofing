// Telnyx email webhook: records delivered/opened/clicked/bounced/complained/replied events and
// (via record_email_event) scores engagement into call_list.priority + the contact lifecycle.
import { serviceClient, verifyTelnyxSignature, json } from '../_shared/telnyx.ts'

Deno.serve(async (req) => {
  const raw = await req.text()
  const ok = await verifyTelnyxSignature(
    raw,
    req.headers.get('telnyx-signature-ed25519') ?? '',
    req.headers.get('telnyx-timestamp') ?? '',
  )
  if (!ok) return json(401, { error: 'bad signature' })

  let evt: Record<string, unknown>
  try {
    evt = JSON.parse(raw)
  } catch {
    return json(400, { error: 'bad json' })
  }

  const data = (evt?.data ?? {}) as Record<string, unknown>
  const payload = (data?.payload ?? {}) as Record<string, unknown>
  // Event names arrive like "email.delivered", "email.opened", ... — strip the prefix.
  const type = String(data?.event_type ?? '').replace(/^email\./, '')
  const messageId = payload?.message_id ?? payload?.id ?? data?.id
  if (!messageId || !type) return json(200, { ignored: true })

  const sb = serviceClient()
  await sb.rpc('record_email_event', { p_telnyx_id: String(messageId), p_type: type, p_payload: payload })
  return json(200, { ok: true })
})
