import type { SupabaseClient } from '@supabase/supabase-js'
import { getKv, getRecording, getRecordings, putRecording, setKv, type Recording } from '../storage/db'

/**
 * Recordings in a private Supabase Storage bucket: <user id>/<surah>.<ext>
 * for the audio and <user id>/<surah>.json for its details. Row-level
 * security on storage lets only the owner read or change them.
 */

const BUCKET = 'recitations'

/** What the account holds, known without downloading the audio. */
export interface RemoteRecording {
  surah: number
  mime: string
  durationMs: number
  timings: number[]
  recordedAt: number
  path: string
}

const ext = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm')

export async function uploadRecording(client: SupabaseClient, userId: string, rec: Recording): Promise<void> {
  const path = `${userId}/${rec.surah}.${ext(rec.mime)}`
  const audio = await client.storage
    .from(BUCKET)
    .upload(path, rec.blob, { upsert: true, contentType: rec.mime.split(';')[0] })
  if (audio.error) throw audio.error
  const meta: RemoteRecording = {
    surah: rec.surah,
    mime: rec.mime,
    durationMs: rec.durationMs,
    timings: rec.timings,
    recordedAt: rec.recordedAt,
    path,
  }
  const json = await client.storage
    .from(BUCKET)
    .upload(`${userId}/${rec.surah}.json`, new Blob([JSON.stringify(meta)], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
    })
  if (json.error) throw json.error
  await putRecording({ ...rec, uploaded: 1 })
}

/** Uploads local recordings not yet in the account, and refreshes the list of remote ones. */
export async function syncRecordings(client: SupabaseClient, userId: string): Promise<RemoteRecording[]> {
  for (const rec of await getRecordings()) {
    if (!rec.uploaded) await uploadRecording(client, userId, rec)
  }
  const { data, error } = await client.storage.from(BUCKET).list(userId, { limit: 300 })
  if (error) {
    // The bucket doesn't exist until the recitations migration is run.
    if (/not found|does not exist/i.test(error.message)) return []
    throw error
  }
  const remote: RemoteRecording[] = []
  for (const f of data ?? []) {
    if (!f.name.endsWith('.json')) continue
    const dl = await client.storage.from(BUCKET).download(`${userId}/${f.name}`)
    if (dl.error || !dl.data) continue
    try {
      remote.push(JSON.parse(await dl.data.text()) as RemoteRecording)
    } catch {
      // ignore a damaged details file
    }
  }
  await setKv('remoteRecordings', remote)
  return remote
}

export async function getRemoteRecordings(): Promise<RemoteRecording[]> {
  return (await getKv<RemoteRecording[]>('remoteRecordings')) ?? []
}

/** Fetches a recording from the account and keeps it on this device. */
export async function downloadRecording(client: SupabaseClient, remote: RemoteRecording): Promise<Recording> {
  const local = await getRecording(remote.surah)
  if (local && local.recordedAt >= remote.recordedAt) return local
  const { data, error } = await client.storage.from(BUCKET).download(remote.path)
  if (error || !data) throw error ?? new Error('download failed')
  const rec: Recording = {
    surah: remote.surah,
    blob: data,
    mime: remote.mime,
    durationMs: remote.durationMs,
    timings: remote.timings,
    recordedAt: remote.recordedAt,
    uploaded: 1,
  }
  await putRecording(rec)
  return rec
}

export async function deleteRemoteRecording(client: SupabaseClient, userId: string, surah: number): Promise<void> {
  const { data } = await client.storage.from(BUCKET).list(userId, { limit: 300 })
  const names = (data ?? []).filter((f) => f.name.startsWith(`${surah}.`)).map((f) => `${userId}/${f.name}`)
  if (names.length) {
    const { error } = await client.storage.from(BUCKET).remove(names)
    if (error) throw error
  }
  const remote = (await getRemoteRecordings()).filter((r) => r.surah !== surah)
  await setKv('remoteRecordings', remote)
}

/** Removes every recording this user has in the account. */
export async function deleteAllRemoteRecordings(client: SupabaseClient, userId: string): Promise<void> {
  const { data } = await client.storage.from(BUCKET).list(userId, { limit: 300 })
  const names = (data ?? []).map((f) => `${userId}/${f.name}`)
  if (names.length) await client.storage.from(BUCKET).remove(names)
  await setKv('remoteRecordings', [])
}
