// Drains due automation_jobs: no-answer SMS, appointment confirmation/reminder, campaign recycling.
// Schedule via pg_cron + pg_net (every 1-5 min) or Supabase scheduled functions. Idempotent per job.
import { serviceClient, telnyx, render, firstName, json, optEnv } from '../_shared/telnyx.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const sb = serviceClient()
  const { data: jobs } = await sb
    .from('automation_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(50)

  let done = 0
  for (const job of jobs ?? []) {
    try {
      if (job.kind === 'recycle_campaign') {
        await sb.rpc('recycle_campaign', { p_campaign: job.payload.campaign_id, p_max_passes: job.payload.max_passes ?? 3 })
      } else {
        await sendTemplatedSms(sb, job.payload?.contact_id, job.payload?.template_key, job.payload?.vars ?? {})
      }
      await sb.from('automation_jobs').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', job.id)
      done++
    } catch (e) {
      await sb
        .from('automation_jobs')
        .update({ status: 'failed', last_error: String((e as Error)?.message ?? e), processed_at: new Date().toISOString() })
        .eq('id', job.id)
    }
  }
  return json(200, { processed: done, found: (jobs ?? []).length })
})

async function sendTemplatedSms(
  sb: SupabaseClient,
  contactId: string | undefined,
  templateKey: string | undefined,
  vars: Record<string, string>,
): Promise<void> {
  if (!contactId || !templateKey) return
  const { data: contact } = await sb.from('contacts').select('*').eq('id', contactId).single()
  if (!contact || contact.sms_opt_out || contact.dnc) return
  const to = contact.phones?.[0]
  if (!to) return
  const { data: tpl } = await sb.from('message_templates').select('*').eq('key', templateKey).eq('kind', 'sms').single()
  if (!tpl) return

  const text = render(tpl.body, { first_name: firstName(contact.owner_name), ...vars })
  const from = optEnv('TELNYX_FROM_NUMBER')
  const res = await telnyx('/messages', {
    method: 'POST',
    body: JSON.stringify({ from, to, text, messaging_profile_id: optEnv('TELNYX_MESSAGING_PROFILE_ID') }),
  })
  const b = await res.json().catch(() => ({}))
  await sb.from('sms_messages').insert({
    contact_id: contactId,
    to_number: to,
    from_number: from,
    body: text,
    telnyx_message_id: b?.data?.id ?? null,
    status: res.ok ? 'sent' : 'failed',
    sent_at: res.ok ? new Date().toISOString() : null,
  })
}
