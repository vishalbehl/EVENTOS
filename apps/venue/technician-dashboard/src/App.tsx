import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Command, Monitor, RefreshCw, Server, Timer, Wrench } from 'lucide-react'

type Item = { id: string; status: string; session: { code: string; title: string }; speaker: { name: string }; file: { id: string; filename: string; format: string; version: number; download_url: string; local_sync_status: string; delivery_status: string; delivery_id?: string | null; delivery_target_node?: string | null; delivery_target_type?: string | null; checksum?: string | null } | null }
type Runtime = { room: { name: string }; server_sequence?: number; current_session: { code: string; title: string; is_active: boolean } | null; next_session: { code: string; title: string; is_active: boolean } | null; queue: Item[]; timer?: { status?: string; visible?: boolean; running?: boolean; remaining_seconds?: number | null }; emergency_message?: string | null; devices: Array<{ id: string; name: string; type: string; status: string; last_heartbeat_at?: string | null }> }

let deviceAccessToken: string | null = null

const ensureDeviceAccessToken = async () => {
  const deviceId = import.meta.env.VITE_DEVICE_ID as string | undefined
  const enrollmentToken = import.meta.env.VITE_DEVICE_TOKEN as string | undefined
  if (!deviceId || !enrollmentToken || deviceAccessToken) return
  const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
  const response = await fetch(`${base}/api/v1/auth/device/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId, enrollment_token: enrollmentToken }) })
  if (!response.ok) throw new Error(`Technical device enrollment failed (${response.status})`)
  const result = await response.json() as { access_token?: string }
  if (!result.access_token) throw new Error('Venue Server did not issue a Technical device access token')
  deviceAccessToken = result.access_token
}

const request = async (path: string, init?: RequestInit, retry = true): Promise<any> => {
  const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(import.meta.env.VITE_VENUE_KEY ? { 'X-Venue-Key': import.meta.env.VITE_VENUE_KEY } : {}), ...(import.meta.env.VITE_DEVICE_ID ? { 'X-Venue-Device-Id': import.meta.env.VITE_DEVICE_ID } : {}), ...(import.meta.env.VITE_DEVICE_TOKEN ? { 'X-Device-Token': deviceAccessToken || import.meta.env.VITE_DEVICE_TOKEN } : {}), ...(init?.headers as Record<string, string> || {}) }
  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (response.status === 401 && retry && import.meta.env.VITE_DEVICE_ID && import.meta.env.VITE_DEVICE_TOKEN) {
    deviceAccessToken = null
    await ensureDeviceAccessToken()
    return request(path, init, false)
  }
  if (!response.ok) throw new Error(await response.text() || `Venue Server returned ${response.status}`)
  return response.json()
}

const downloadProtectedFile = async (url: string, retry = true): Promise<Response> => {
  await ensureDeviceAccessToken()
  const headers: Record<string, string> = { ...(import.meta.env.VITE_DEVICE_ID ? { 'X-Venue-Device-Id': import.meta.env.VITE_DEVICE_ID } : {}), ...(import.meta.env.VITE_DEVICE_TOKEN ? { 'X-Device-Token': deviceAccessToken || import.meta.env.VITE_DEVICE_TOKEN } : {}) }
  const response = await fetch(url, { headers })
  if (response.status === 401 && retry && import.meta.env.VITE_DEVICE_ID && import.meta.env.VITE_DEVICE_TOKEN) {
    deviceAccessToken = null
    return downloadProtectedFile(url, false)
  }
  return response
}

function App() {
  const roomId = import.meta.env.VITE_ROOM_ID as string | undefined
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const displayedSession = runtime?.current_session || runtime?.next_session || null
  const load = useCallback(async () => { if (!roomId) { setError('This Technical App is not configured with a room ID.'); return } try { await ensureDeviceAccessToken(); setRuntime(await request(`/api/v1/venue/rooms/${roomId}/runtime`)); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Venue Server unavailable') } }, [roomId])
  useEffect(() => {
    void load(); const timer = window.setInterval(() => void load(), 5000)
    const heartbeat = roomId && import.meta.env.VITE_DEVICE_ID ? window.setInterval(() => void request(`/api/v1/venue/rooms/${roomId}/devices/${import.meta.env.VITE_DEVICE_ID}/heartbeat`, { method: 'POST', body: JSON.stringify({ status: 'online', app_version: import.meta.env.VITE_APP_VERSION || undefined, last_server_sequence: runtime?.server_sequence ?? null }) }).catch(() => undefined), 20000) : undefined
    return () => { window.clearInterval(timer); if (heartbeat) window.clearInterval(heartbeat) }
  }, [load, roomId, runtime?.server_sequence])
  const acknowledgeFile = async (item: Item) => {
    const file = item.file
    if (!file?.delivery_id || !file.delivery_target_node || !file.delivery_target_type) throw new Error('No delivery target is configured for this technical device')
    await request(`/api/v1/venue/distribution/${file.delivery_id}/claim`, { method: 'POST', body: JSON.stringify({ owner: `technical:${import.meta.env.VITE_DEVICE_ID || roomId}` }) })
    const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
    const response = await downloadProtectedFile(`${base}${file.download_url}`)
    if (!response.ok) throw new Error(`Presentation download failed (${response.status})`)
    const bytes = await response.arrayBuffer()
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
    await request(`/api/v1/venue/distribution/${file.delivery_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ target_node: file.delivery_target_node, target_type: file.delivery_target_type, file_id: file.id, version_number: file.version, sha256: digest, size_bytes: bytes.byteLength }) })
  }
  const command = async (name: string, item?: Item, payloadOverride?: Record<string, unknown>) => {
    if (!roomId) return
    try {
      if (name === 'prepare_now') {
        if (!item) throw new Error('Select a queued presentation before preparing the room.')
        await acknowledgeFile(item)
      }
      const stageCommand = new Set(['launch_presentation', 'pause', 'stop', 'reload', 'show_timer', 'hide_timer', 'start_timer', 'pause_timer', 'reset_timer', 'emergency_message']).has(name)
      const stage = runtime?.devices.find(device => ['presentation_pc', 'stage_app', 'stage'].includes(device.type))
      if (stageCommand && !stage) throw new Error('No enrolled Stage App is available in this room.')
      const targetDeviceId = stageCommand ? stage?.id : name === 'switch_session' ? undefined : import.meta.env.VITE_DEVICE_ID || undefined
      const result = await request(`/api/v1/venue/rooms/${roomId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ command: name, device_id: targetDeviceId, idempotency_key: crypto.randomUUID(), payload: payloadOverride || (item ? { queue_entry_id: item.id } : {}), reason: `Technical App requested ${name}` }),
      })
      if (result.command_id && targetDeviceId === import.meta.env.VITE_DEVICE_ID) {
        const executed = name === 'prepare_now'
        await request(`/api/v1/venue/rooms/${roomId}/commands/${result.command_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: executed ? 'executed' : 'acknowledged', result: { source: 'technical_app', ...(executed && item?.file ? { file_id: item.file.id, file_version: item.file.version, delivery_status: 'verified' } : {}) } }) })
      }
      setMessage(stageCommand ? `${name.replaceAll('_', ' ')} sent to Stage App` : `${name.replaceAll('_', ' ')} ${['prepare_now', 'switch_session'].includes(name) ? 'completed' : 'acknowledged'}`)
      setTimeout(() => setMessage(null), 2500)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Command failed') }
  }
  const connectionLabel = error ? 'Offline' : !import.meta.env.VITE_DEVICE_ID ? 'Device not configured' : runtime ? 'Connected' : 'Connecting'
  return <main className="min-h-screen bg-zinc-950 p-8 text-white"><header className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 pb-6"><div><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Room Technical App</p><h1 className="mt-2 text-3xl font-semibold">{runtime?.room.name || 'Room not configured'}</h1><p className="mt-2 text-sm text-zinc-400">Presentation preparation, stage control, timer, and device evidence</p></div><div className="flex items-center gap-3"><span className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${error ? 'border-red-500/40 text-red-300' : !import.meta.env.VITE_DEVICE_ID ? 'border-amber-500/40 text-amber-300' : 'border-emerald-500/40 text-emerald-300'}`}><Server size={14} />{connectionLabel}</span><button onClick={() => void load()} className="rounded-lg border border-white/15 p-2"><RefreshCw size={17} /></button></div></header>{message && <div className="mx-auto mt-5 max-w-7xl rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-200">{message}</div>}{error ? <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-6"><h2 className="font-semibold">Venue Server unavailable</h2><p className="mt-2 text-sm text-red-200">{error}</p></section> : <section className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[1fr_320px]"><div className="space-y-4"><div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-6"><p className="text-xs uppercase tracking-widest text-cyan-300">{displayedSession?.is_active ? 'Live session' : displayedSession ? 'Next session' : 'No session configured'}</p><h2 className="mt-2 text-2xl font-semibold">{displayedSession?.title || 'No scheduled session'}</h2><p className="mt-1 text-sm text-zinc-400">{displayedSession?.code || 'No session evidence'}</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void command('prepare_now', runtime?.queue[0])} disabled={!runtime?.queue[0]} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm disabled:bg-zinc-700"><Wrench size={16} />Prepare room</button><button onClick={() => void command('start_timer', undefined, { duration_seconds: 1200 })} className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm"><Timer size={16} />Start 20 min</button><button onClick={() => void command('pause_timer')} className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm">Pause timer</button><button onClick={() => void command('reset_timer')} className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm">Reset timer</button><button onClick={() => void command('reload')} className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm"><Command size={16} />Reload stage</button><input id="emergency-message" aria-label="Emergency message" placeholder="Emergency message" className="min-w-48 rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-sm" /><button onClick={() => { const input = document.getElementById('emergency-message') as HTMLInputElement | null; void command('emergency_message', undefined, { message: input?.value.trim() || '' }) }} className="rounded-lg border border-red-400/40 px-4 py-3 text-sm text-red-200">Send emergency</button></div></div>{runtime?.queue.map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-cyan-300">{item.session.code} · {item.speaker.name}</p><h3 className="mt-1 text-lg font-medium">{item.file?.filename || 'File unavailable'}</h3><p className="mt-1 text-sm text-zinc-400">{item.file ? `${item.file.format.toUpperCase()} · v${item.file.version} · delivery ${item.file.delivery_status}` : 'No current file'}</p></div><span className="rounded-full border border-white/15 px-2 py-1 text-xs">{item.status}</span></div><div className="mt-4 flex gap-2"><button onClick={() => void command('prepare_now', item)} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Prepare</button><button onClick={() => void command('launch_presentation', item)} disabled={!item.file || item.file.delivery_status !== 'verified'} className="rounded-lg bg-cyan-600 px-3 py-2 text-sm disabled:bg-zinc-700">Launch on stage</button><button onClick={() => void command('switch_session', item)} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Make current</button></div></article>)}{!runtime?.queue.length && <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-zinc-400">No presentations are queued for this room.</p>}</div><aside className="space-y-4"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="flex items-center gap-2 font-semibold"><Monitor size={17} />Room devices</h2><div className="mt-4 space-y-3">{runtime?.devices.map(device => { const online = device.status === 'online'; return <div key={device.id} className="rounded-lg border border-white/10 p-3"><div className="flex items-center justify-between"><div><p className="text-sm">{device.name}</p><p className="text-xs text-zinc-500">{device.type}</p></div><span className={`flex items-center gap-1 text-xs ${online ? 'text-emerald-300' : device.status === 'error' ? 'text-red-300' : 'text-amber-300'}`}><CheckCircle2 size={13} />{device.status}</span></div><p className="mt-2 text-xs text-zinc-500">Last heartbeat: {device.last_heartbeat_at ? new Date(device.last_heartbeat_at).toLocaleString() : 'No heartbeat evidence'}</p></div>})}</div></div><div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5"><h2 className="font-semibold text-amber-200">Timer</h2><p className="mt-2 text-sm text-amber-100/70">Timer state is controlled by Stage App commands and shown after acknowledgement.</p></div></aside></section>}</main>
}

export default App
