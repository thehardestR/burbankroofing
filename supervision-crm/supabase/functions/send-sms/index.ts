// Send a single SMS to an engaged contact (no-answer follow-up, appointment confirmation, etc.).
// POST { contact_id, template_key?, body?, vars? } — owner only. Enforces opt-out/DNC suppression.
// Requires a 10DLC-registered TELNYX_FROM_NUMBER + messaging profile before it will deliver.
import { serviceClient, requireOwner, telnyx, render, firstName, json, preflight, optEnv } from '../_shared/telnyx.ts'

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const sb = serviceClient()
  try {
    await requireOwner(req, sb)
  } catch (e) {
    return json((e as Error).message === 'forbidden' ? 403 : 401, { error: (e as Error).message })
  }

  const { contact_id, template_key, body: rawBody, vars } = await req.json().catch(() => ({}))
  if (!contact_id) return json(400, { error: 'contact_id required' })

  const { data: contact } = await sb.from('contacts').select('*').eq('id', contact_id).single()
  if (!contact) return json(404, { error: 'contact not found' })
  if (contact.sms_opt_out || contact.dnc) return json(200, { skipped: 'contact opted out' })

  const to = contact.phones?.[0]
  if (!to) return json(400, { error: 'contact has no phone' })

  let text: string | null = rawBody ?? null
  if (!text && template_key) {
    const { data: tpl } = await sb.from('message_templates').select('*').eq('key', template_key).eq('kind', 'sms').single()
    text = tpl ? render(tpl.body, { first_name: firstName(contact.owner_name), ...(vars ?? {}) }) : null
  }
  if (!text) return json(400, { error: 'no message body' })

  const from = optEnv('TELNYX_FROM_NUMBER')
  const res = await telnyx('/messages', {
    method: 'POST',
    body: JSON.stringify({ from, to, text, messaging_profile_id: optEnv('TELNYX_MESSAGING_PROFILE_ID') }),
  })
  const b = await res.json().catch(() => ({}))
  const { data: row } = await sb
    .from('sms_messages')
    .insert({
      contact_id,
      to_number: to,
      from_number: from,
      body: text,
      telnyx_message_id: b?.data?.id ?? null,
      status: res.ok ? 'sent' : 'failed',
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  return json(res.ok ? 200 : 502, { ok: res.ok, sms_id: row?.id ?? null, detail: res.ok ? undefined : b })
})
