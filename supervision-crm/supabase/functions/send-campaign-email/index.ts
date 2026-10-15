// Send a templated email blast to a campaign's contacts (or all emailable contacts).
// Used for both the intro campaign and the storm-alert re-engagement blast.
// POST { campaign_id?, template_key, } — owner only. Suppresses email opt-outs.
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

  const { campaign_id, template_key } = await req.json().catch(() => ({}))
  if (!template_key) return json(400, { error: 'template_key required' })

  const { data: tpl } = await sb.from('message_templates').select('*').eq('key', template_key).eq('kind', 'email').single()
  if (!tpl) return json(400, { error: 'email template not found' })

  // Audience = contacts in the campaign (via call_list) or all emailable contacts; minus opt-outs.
  let contactIds: string[] | null = null
  if (campaign_id) {
    const { data: cl } = await sb.from('call_list').select('contact_id').eq('campaign_id', campaign_id).not('contact_id', 'is', null)
    contactIds = [...new Set((cl ?? []).map((r: { contact_id: string }) => r.contact_id))]
    if (contactIds.length === 0) return json(200, { sent: 0, total: 0 })
  }

  let q = sb.from('contacts').select('id, owner_name, email, site_address, city').eq('email_opt_out', false).not('email', 'is', null)
  if (contactIds) q = q.in('id', contactIds)
  const { data: contacts } = await q.limit(2000)

  const from = optEnv('TELNYX_EMAIL_FROM') ?? 'Burbank Roofing <[email protected]>'
  const ctaBase = optEnv('CAMPAIGN_CTA_URL') ?? 'https://burbankroofing.com/free-inspection.html'

  let sent = 0
  for (const c of contacts ?? []) {
    const vars = {
      first_name: firstName(c.owner_name),
      site_address: c.site_address ?? '',
      city: c.city ?? '',
      cta_url: `${ctaBase}?c=${c.id}`,
    }
    const subject = render(tpl.subject ?? '', vars)
    const res = await telnyx('/emails', {
      method: 'POST',
      body: JSON.stringify({ from, to: [c.email], subject, html: render(tpl.body, vars) }),
    })
    const body = await res.json().catch(() => ({}))
    await sb.from('email_messages').insert({
      campaign_id: campaign_id ?? null,
      contact_id: c.id,
      telnyx_message_id: body?.data?.id ?? null,
      template_key,
      to_email: c.email,
      subject,
      status: res.ok ? 'sent' : 'failed',
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    await sb.from('contacts').update({ last_emailed_at: new Date().toISOString() }).eq('id', c.id)
    if (res.ok) sent++
  }

  return json(200, { ok: true, sent, total: (contacts ?? []).length })
})
