#!/usr/bin/env node
// ============================================================
// WHAT DOES THE PUSH CHANNEL ACTUALLY SEND?
//
// Survey items S21 to S24. The three Stage 1 tables were added to the channel
// the database uses to tell open browsers that a row has changed, and set to
// send the whole row on an update. Both are choices that deserve checking
// rather than believing, because the whole point of the channel is that it
// pushes data outward without anybody asking for it.
//
// This connects holding ONLY the public key, the one that ships to every
// browser, subscribes to all three tables, then writes a row using the service
// key and waits. Anything that arrives at the public key's subscription is
// something any visitor to the site could read.
//
// Expected result: nothing arrives, because the public key has no grant on
// these tables. This script exists to turn that expectation into an
// observation.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/check-push-channel.mjs
// ============================================================
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Need SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const TABLES = ['gtcv_questions', 'gtcv_submissions', 'gtcv_room_state']
const WAIT_MS = 6000

// Everything that reached the public key's subscription.
const received = []

const asVisitor = createClient(URL, ANON, {
  realtime: { params: { eventsPerSecond: 20 } },
})
const asServer = createClient(URL, SERVICE, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
})

// Everything that reached the SERVICE key's subscription. This is the control.
// Without it, "nothing arrived at the public key" is unreadable: it could mean
// the channel refused the public key, or it could mean this machine cannot
// hold a websocket at all and neither key would have heard anything.
const receivedAsServer = []

async function main() {
  console.log('subscribing as a visitor holding only the public key...')

  const channel = asVisitor.channel('push-channel-check')
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      received.push({ table, event: payload.eventType, row: payload.new || payload.old })
    })
  }

  const subscribed = await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve('SUBSCRIBED')
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(status)
    })
    setTimeout(() => resolve('NO_STATUS'), 8000)
  })
  console.log('  subscription status:', subscribed)

  const control = asServer.channel('push-channel-check-control')
  for (const table of TABLES) {
    control.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      receivedAsServer.push({ table, event: payload.eventType })
    })
  }
  const controlStatus = await new Promise((resolve) => {
    control.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve('SUBSCRIBED')
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(status)
    })
    setTimeout(() => resolve('NO_STATUS'), 8000)
  })
  console.log('  control subscription status (service key):', controlStatus)

  // Something to notice. Written with the service key, which is what the real
  // participant route will use, so this is the same shape of change a live
  // session produces.
  console.log('writing a row with the service key...')
  // Its own throwaway engagement, removed at the end. Staging has none, and
  // borrowing a real one would mean writing test rows against somebody's work.
  const clientId = `push-check-${Date.now()}`
  const { error: cErr } = await asServer.from('engagement_clients')
    .insert({ id: clientId, name: 'Push channel check' })
  if (cErr) { console.error('could not create a throwaway engagement:', cErr.message); process.exit(2) }
  const client = { id: clientId }

  const { data: q, error: qErr } = await asServer.from('gtcv_questions').insert({
    client_id: client.id,
    gate_id: 'phase_0',
    question_text: 'Push channel check, written by scripts/check-push-channel.mjs',
    question_type: 'collect',
  }).select('id').single()
  if (qErr) { console.error('could not write a question:', qErr.message); process.exit(2) }

  const { error: sErr } = await asServer.from('gtcv_submissions').insert({
    client_id: client.id,
    question_id: q.id,
    participant_id: 'push-channel-check',
    participant_name: 'Push channel check',
    values: { activity: 'Push channel check' },
  })
  if (sErr) { console.error('could not write a submission:', sErr.message) }

  await asServer.from('gtcv_room_state')
    .upsert({ client_id: client.id, open_question_id: q.id }, { onConflict: 'client_id' })

  console.log(`waiting ${WAIT_MS / 1000} seconds for anything to arrive...`)
  await new Promise((r) => setTimeout(r, WAIT_MS))

  // Clean up whatever this script made, whichever way the result went.
  await asServer.from('gtcv_room_state').delete().eq('client_id', client.id)
  await asServer.from('gtcv_questions').delete().eq('id', q.id)
  await asServer.from('engagement_clients').delete().eq('id', client.id)

  console.log('')
  console.log(`control: ${receivedAsServer.length} message(s) reached the service key subscription.`)
  if (receivedAsServer.length === 0) {
    console.log('The control heard nothing either, so this run proves NOTHING about')
    console.log('authorisation: it is equally consistent with this machine being')
    console.log('unable to hold a websocket. Re-run somewhere that can.')
    process.exit(3)
  }

  console.log('')
  if (received.length === 0) {
    console.log('RESULT: nothing arrived at the public key subscription.')
    console.log('The push channel does not deliver these tables to a browser')
    console.log('holding only the public key. S21 to S24 observed, not assumed.')
    process.exit(0)
  }

  console.log(`RESULT: ${received.length} message(s) REACHED THE PUBLIC KEY.`)
  for (const r of received) {
    console.log(`  ${r.table} ${r.event}:`, JSON.stringify(r.row).slice(0, 300))
  }
  console.log('')
  console.log('This is a leak. The Participant Page must not be built on this')
  console.log('channel until it is closed.')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(2) })
