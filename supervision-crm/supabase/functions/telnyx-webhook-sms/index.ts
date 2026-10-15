// Telnyx messaging webhook: records delivery status and inbound replies, and honors STOP opt-outs.
import { serviceClient, verifyTelnyxSignature, json } from '../_shared/telnyx.ts'

const STOP = /^\s*(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/i

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
  const payload = data?.payload ?? {}
  const sb = serviceClient()

  if (type === 'message.received') {
    const fromNum: string = payload?.from?.phone_number ?? ''
    const text: string = payload?.text ?? ''
    const isStop = STOP.test(text)
    await sb.from('sms_messages').insert({
      direction: 'inbound',
      from_number: fromNum,
      to_number: payload?.to?.[0]?.phone_number ?? null,
      body: text,
      telnyx_message_id: payload?.id ?? null,
      status: 'received',
      received_at: new Date().toISOString(),
      is_opt_out: isStop,
    })
    if (isStop) {
      const last10 = fromNum.replace(/\D/g, '').slice(-10)
      if (last10) await sb.rpc('mark_sms_opt_out', { p_phone_last10: last10 })
    }
    return json(200, { ok: true })
  }

  // Outbound delivery status (message.sent / message.finalized).
  const id = payload?.id
  if (id) {
    const status = payload?.to?.[0]?.status ?? type
    await sb
      .from('sms_messages')
      .update({ status, delivered_at: status === 'delivered' ? new Date().toISOString() : null })
      .eq('telnyx_message_id', id)
  }
  return json(200, { ok: true })
})
