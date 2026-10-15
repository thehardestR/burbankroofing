// Mint a short-lived Telnyx WebRTC login token for the browser softphone. Any authenticated CRM
// user may request one. The Telnyx API key never leaves the server. POST -> { login_token }.
import { serviceClient, requireUser, telnyx, json, preflight, env } from '../_shared/telnyx.ts'

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const sb = serviceClient()
  let uid: string
  try {
    uid = await requireUser(req, sb)
  } catch (e) {
    return json(401, { error: (e as Error).message })
  }

  // Create an on-demand telephony credential on the voice connection, then mint a JWT token for it.
  const credRes = await telnyx('/telephony_credentials', {
    method: 'POST',
    body: JSON.stringify({ connection_id: env('TELNYX_CONNECTION_ID'), name: `webrtc-${uid}-${Date.now()}` }),
  })
  const cred = await credRes.json().catch(() => ({}))
  const credId = cred?.data?.id
  if (!credId) return json(502, { error: 'could not create telephony credential', detail: cred })

  const tokRes = await telnyx(`/telephony_credentials/${credId}/token`, { method: 'POST' })
  const login_token = (await tokRes.text()).trim()
  if (!tokRes.ok || !login_token) return json(502, { error: 'could not mint token' })

  return json(200, { login_token })
})
