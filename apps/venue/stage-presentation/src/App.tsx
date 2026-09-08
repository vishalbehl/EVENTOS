import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Maximize, Play, RefreshCw, Server } from 'lucide-react'

const nativeHandlerFormats = new Set(['txt', 'doc', 'docx', 'xls', 'xlsx', 'odp'])

type QueueItem = {
  id: string
  status: string
  session: { code: string; title: string }
  speaker: { name: string; affiliation?: string | null }
  file: { id: string; filename: string; format: string; version: number; download_url: string; local_sync_status: string; delivery_status: string; delivery_id?: string | null; delivery_target_node?: string | null; delivery_target_type?: string | null; checksum?: string | null; size_bytes?: number } | null
}
type Runtime = { room: { id: string; name: string }; server_sequence?: number; current_session: { title: string; code: string; is_active: boolean } | null; next_session: { title: string; code: string; is_active: boolean } | null; queue: QueueItem[]; timer?: { visible?: boolean; running?: boolean; remaining_seconds?: number | null }; emergency_message?: string | null }

let deviceAccessToken: string | null = null

const ensureDeviceAccessToken = async () => {
  const deviceId = import.meta.env.VITE_DEVICE_ID as string | undefined
  const enrollmentToken = import.meta.env.VITE_DEVICE_TOKEN as string | undefined
  if (!deviceId || !enrollmentToken || deviceAccessToken) return
  const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
  const response = await fetch(`${base}/api/v1/auth/device/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId, enrollment_token: enrollmentToken }) })
  if (!response.ok) throw new Error(`Stage device enrollment failed (${response.status})`)
  const result = await response.json() as { access_token?: string }
  if (!result.access_token) throw new Error('Venue Server did not issue a Stage device access token')
  deviceAccessToken = result.access_token
}

const api = async (path: string, init?: RequestInit, retry = true): Promise<any> => {
  const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(import.meta.env.VITE_VENUE_KEY ? { 'X-Venue-Key': import.meta.env.VITE_VENUE_KEY } : {}), ...(import.meta.env.VITE_DEVICE_ID ? { 'X-Venue-Device-Id': import.meta.env.VITE_DEVICE_ID } : {}), ...(import.meta.env.VITE_DEVICE_TOKEN ? { 'X-Device-Token': deviceAccessToken || import.meta.env.VITE_DEVICE_TOKEN } : {}), ...(init?.headers as Record<string, string> || {}) }
  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (response.status === 401 && retry && import.meta.env.VITE_DEVICE_ID && import.meta.env.VITE_DEVICE_TOKEN) {
    deviceAccessToken = null
    await ensureDeviceAccessToken()
    return api(path, init, false)
  }
  if (!response.ok) throw new Error(await response.text() || `Venue Server returned ${response.status}`)
  return response.json()
}

const fetchProtectedFile = async (url: string, retry = true): Promise<Response> => {
  await ensureDeviceAccessToken()
  const headers: Record<string, string> = { ...(import.meta.env.VITE_DEVICE_ID ? { 'X-Venue-Device-Id': import.meta.env.VITE_DEVICE_ID } : {}), ...(import.meta.env.VITE_DEVICE_TOKEN ? { 'X-Device-Token': deviceAccessToken || import.meta.env.VITE_DEVICE_TOKEN } : {}), ...(import.meta.env.VITE_VENUE_KEY ? { 'X-Venue-Key': import.meta.env.VITE_VENUE_KEY } : {}) }
  const response = await fetch(url, { headers })
  if (response.status === 401 && retry && import.meta.env.VITE_DEVICE_ID && import.meta.env.VITE_DEVICE_TOKEN) {
    deviceAccessToken = null
    return fetchProtectedFile(url, false)
  }
  return response
}

function App() {
  const roomId = import.meta.env.VITE_ROOM_ID as string | undefined
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [timerVisible, setTimerVisible] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const processingCommands = useRef<Set<string>>(new Set())
  const displayedSession = runtime?.current_session || runtime?.next_session || null
  const load = useCallback(async () => {
    if (!roomId) { setError('This Stage App is not configured with a room ID.'); return }
    try {
      await ensureDeviceAccessToken()
      const nextRuntime = await api(`/api/v1/venue/rooms/${roomId}/runtime`)
      setRuntime(nextRuntime)
      if (nextRuntime.timer) {
        setTimerVisible(Boolean(nextRuntime.timer.visible))
        setTimerRemaining(Math.max(0, Number(nextRuntime.timer.remaining_seconds || 0)))
        setTimerRunning(Boolean(nextRuntime.timer.running))
      }
      setEmergencyMessage(nextRuntime.emergency_message || null)
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Venue Server unavailable') }
  }, [roomId])
  useEffect(() => {
    if (!timerRunning) return
    const timer = window.setInterval(() => {
      setTimerRemaining(value => {
        if (value <= 1) {
          setTimerRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning])
  useEffect(() => {
    let objectUrl: string | null = null
    if (!selected?.file) { setDisplayUrl(null); return }
    const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
    void fetchProtectedFile(`${base}${selected.file.download_url}`).then(async response => {
      if (!response.ok) throw new Error(`Presentation download failed (${response.status})`)
      const bytes = await response.arrayBuffer()
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
      const expected = (response.headers.get('x-file-sha256') || selected.file?.checksum || '').toLowerCase()
      if (!expected || digest !== expected || (selected.file?.size_bytes != null && bytes.byteLength !== selected.file.size_bytes)) {
        throw new Error('Stage App rejected the presentation because its checksum or size does not match the Venue Server version.')
      }
      const blob = new Blob([bytes], { type: response.headers.get('content-type') || 'application/octet-stream' })
      objectUrl = URL.createObjectURL(blob)
      setDisplayUrl(objectUrl)
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Presentation download failed'))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [selected])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    const heartbeat = roomId && import.meta.env.VITE_DEVICE_ID ? window.setInterval(() => void api(`/api/v1/venue/rooms/${roomId}/devices/${import.meta.env.VITE_DEVICE_ID}/heartbeat`, { method: 'POST', body: JSON.stringify({ status: 'online', app_version: import.meta.env.VITE_APP_VERSION || undefined, last_server_sequence: runtime?.server_sequence ?? null }) }).catch(() => undefined), 20000) : undefined
    return () => { window.clearInterval(timer); if (heartbeat) window.clearInterval(heartbeat) }
  }, [load, roomId, runtime?.server_sequence])
  const fileUrl = useMemo(() => selected?.file ? `${(import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')}${selected.file.download_url}` : null, [selected])
  const launch = async (item: QueueItem, deliveredCommandId?: string) => {
    if (roomId) {
      const idempotencyKey = crypto.randomUUID()
      let command: { command_id?: string } = { command_id: deliveredCommandId }
      try {
        if (!deliveredCommandId) {
          command = await api(`/api/v1/venue/rooms/${roomId}/commands`, { method: 'POST', body: JSON.stringify({ command: 'launch_presentation', device_id: import.meta.env.VITE_DEVICE_ID || undefined, idempotency_key: idempotencyKey, payload: { queue_entry_id: item.id }, reason: 'Stage App launched presentation' }) })
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Venue Server rejected the launch command')
        return
      }
      if (item.file?.delivery_id && item.file.delivery_target_node && item.file.delivery_target_type) {
        try {
          await api(`/api/v1/venue/distribution/${item.file.delivery_id}/claim`, { method: 'POST', body: JSON.stringify({ owner: `stage:${import.meta.env.VITE_DEVICE_ID || roomId}` }) })
          const base = (import.meta.env.VITE_VENUE_SERVER_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
          const response = await fetchProtectedFile(`${base}${item.file.download_url}`)
          if (!response.ok) throw new Error(`Presentation verification download failed (${response.status})`)
          const bytes = await response.arrayBuffer()
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
          await api(`/api/v1/venue/distribution/${item.file.delivery_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ target_node: item.file.delivery_target_node, target_type: item.file.delivery_target_type, file_id: item.file.id, version_number: item.file.version, sha256: digest, size_bytes: bytes.byteLength }) })
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Stage App could not verify the presentation delivery')
          setSelected(null)
          if (command.command_id && import.meta.env.VITE_DEVICE_ID) {
            await api(`/api/v1/venue/rooms/${roomId}/commands/${command.command_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'failed', error_message: cause instanceof Error ? cause.message : 'Stage App could not verify the presentation delivery' }) }).catch(() => undefined)
          }
          return
        }
      }
      // Only expose the file to the viewer after the target has verified the
      // authoritative version and checksum.
      setSelected(item)
      if (import.meta.env.VITE_DEVICE_ID) {
        try {
          await api(`/api/v1/venue/rooms/${roomId}/queue/${item.id}/events?device_id=${import.meta.env.VITE_DEVICE_ID}`, { method: 'POST', body: JSON.stringify({ event_type: 'presentation_start', details: { version: item.file?.version } }) })
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Venue Server did not record presentation start')
          setSelected(null)
          if (command.command_id) {
            await api(`/api/v1/venue/rooms/${roomId}/commands/${command.command_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'failed', error_message: cause instanceof Error ? cause.message : 'Venue Server did not record presentation start' }) }).catch(() => undefined)
          }
          return
        }
      }
      if (command.command_id && import.meta.env.VITE_DEVICE_ID) {
        try {
          await api(`/api/v1/venue/rooms/${roomId}/commands/${command.command_id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'executed', result: { queue_entry_id: item.id, file_version: item.file?.version } }) })
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Venue Server did not acknowledge presentation launch')
        }
      }
    }
  }
  useEffect(() => {
    if (!roomId || !import.meta.env.VITE_DEVICE_ID || !runtime) return
    let stopped = false
    const pollCommands = async () => {
      try {
        const result = await api(`/api/v1/venue/rooms/${roomId}/commands`)
        for (const command of (result.commands || []) as Array<{ id: string; command: string; payload?: { queue_entry_id?: string; message?: string; duration_seconds?: number } }>) {
          if (stopped || processingCommands.current.has(command.id)) continue
          processingCommands.current.add(command.id)
          try {
          const item = command.payload?.queue_entry_id ? runtime.queue.find(queueItem => queueItem.id === command.payload?.queue_entry_id) : selected
          if (command.command === 'launch_presentation') {
            if (item?.file) await launch(item, command.id)
            else await api(`/api/v1/venue/rooms/${roomId}/commands/${command.id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'failed', error_message: 'The requested presentation is unavailable in the current room runtime.' }) })
            continue
          }
          if (command.command === 'pause') videoRef.current?.pause()
          if (command.command === 'stop') {
            if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
            setSelected(null)
          }
          if (command.command === 'reload') {
            setDisplayUrl(null)
            if (selected?.file) setSelected({ ...selected })
          }
          if (command.command === 'show_timer') setTimerVisible(true)
          if (command.command === 'hide_timer') setTimerVisible(false)
          if (command.command === 'start_timer') {
            const duration = Number(command.payload?.duration_seconds)
            if (!Number.isFinite(duration) || duration <= 0) throw new Error('Stage App received an invalid timer duration.')
            setTimerRemaining(Math.floor(duration))
            setTimerRunning(true)
            setTimerVisible(true)
          }
          if (command.command === 'pause_timer') setTimerRunning(false)
          if (command.command === 'reset_timer') { setTimerRunning(false); setTimerRemaining(0); setTimerVisible(false) }
          if (command.command === 'emergency_message') setEmergencyMessage(command.payload?.message?.trim() || null)
          await api(`/api/v1/venue/rooms/${roomId}/commands/${command.id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'executed', result: { source: 'stage_app', command: command.command } }) })
          } catch (cause) {
            const errorMessage = cause instanceof Error ? cause.message : 'Stage App could not execute the room command.'
            setError(errorMessage)
            await api(`/api/v1/venue/rooms/${roomId}/commands/${command.id}/acknowledge`, { method: 'POST', body: JSON.stringify({ status: 'failed', error_message: errorMessage }) }).catch(() => undefined)
          } finally {
            processingCommands.current.delete(command.id)
          }
        }
      } catch { /* reconnect is handled by the normal runtime polling */ }
    }
    void pollCommands()
    const timer = window.setInterval(() => void pollCommands(), 2000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [roomId, runtime, selected])
  const openNativePresentation = async (mode: 'normal' | 'slideshow') => {
    if (!selected?.file || !fileUrl) return
    if (!window.stageDesktop) { setError('Native presentation launching is available only in the installed Stage App.'); return }
    const result = await window.stageDesktop.prepareAndOpenPresentation({ url: fileUrl, fileId: selected.file.id, version: selected.file.version, filename: selected.file.filename, checksum: selected.file.checksum, mode })
    if (!result.opened) setError(result.error || 'The configured presentation handler could not open this file.')
  }
  if (selected?.file && fileUrl) return <div className="min-h-screen bg-black text-white">{emergencyMessage && <div role="alert" className="fixed left-0 right-0 top-0 z-30 bg-red-700 px-6 py-4 text-center text-lg font-bold shadow-lg">{emergencyMessage}</div>}<div className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between bg-black/80 p-4"><div><p className="text-xs uppercase tracking-[0.25em] text-blue-300">{runtime?.room.name} · Stage</p><h1 className="text-lg font-semibold">{selected.file.filename}</h1></div><div className="flex gap-2"><button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => setSelected(null)}>Back to queue</button><button className="rounded-lg bg-blue-600 p-3" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize size={16} /></button></div></div>{timerVisible && <div className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/75 px-5 py-3 text-sm text-amber-200">Timer {Math.floor(timerRemaining / 60).toString().padStart(2, '0')}:{(timerRemaining % 60).toString().padStart(2, '0')} {timerRunning ? 'running' : 'paused'}</div>}<div className="flex min-h-screen items-center justify-center p-8 pt-24">{!displayUrl && !['ppt', 'pptx'].includes(selected.file.format.toLowerCase()) ? <p className="text-slate-400">Loading verified presentation…</p> : selected.file.format.toLowerCase() === 'pdf' ? <iframe title={selected.file.filename} src={`${displayUrl}#view=FitH`} className="h-[calc(100vh-8rem)] w-full border-0" /> : ['mp4', 'webm'].includes(selected.file.format.toLowerCase()) ? <video ref={videoRef} src={displayUrl || undefined} controls autoPlay className="max-h-[calc(100vh-8rem)] max-w-full" /> : ['png', 'jpg', 'jpeg', 'gif'].includes(selected.file.format.toLowerCase()) ? <img src={displayUrl || undefined} alt={selected.file.filename} className="max-h-[calc(100vh-8rem)] max-w-full object-contain" /> : ['ppt', 'pptx'].includes(selected.file.format.toLowerCase()) ? <div className="max-w-xl text-center"><FileText className="mx-auto mb-4" size={56} /><p className="text-xl">PowerPoint presentation ready</p><p className="mt-2 text-sm text-slate-400">Choose how the installed Stage App should open the verified file.</p><div className="mt-6 flex justify-center gap-3"><button className="rounded-lg border border-white/20 px-5 py-3" onClick={() => void openNativePresentation('normal')}>Open normal</button><button className="rounded-lg bg-blue-600 px-5 py-3" onClick={() => void openNativePresentation('slideshow')}>Start slideshow</button></div></div> : <div className="max-w-xl text-center"><FileText className="mx-auto mb-4" size={56} /><p className="text-xl">{selected.file.format.toUpperCase()} file ready</p><p className="mt-2 text-sm text-slate-400">This format is not renderable inside Stage App. Use an approved local handler.</p>{nativeHandlerFormats.has(selected.file.format.toLowerCase()) && window.stageDesktop ? <button className="mt-6 rounded-lg bg-blue-600 px-5 py-3" onClick={() => void openNativePresentation('normal')}>Open with approved handler</button> : <a className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3" href={displayUrl || undefined} target="_blank" rel="noreferrer">Open in browser</a>}</div>}</div></div>
  const connectionLabel = error ? 'Offline' : !import.meta.env.VITE_DEVICE_ID ? 'Device not configured' : runtime ? 'Connected' : 'Connecting'
  return <main className="min-h-screen bg-slate-950 p-8 text-white"><header className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/10 pb-6"><div><p className="text-xs uppercase tracking-[0.3em] text-blue-300">Stage Presentation App</p><h1 className="mt-2 text-3xl font-semibold">{runtime?.room.name || 'Room not configured'}</h1><p className="mt-2 text-sm text-slate-400">Authoritative room queue from Venue Server</p></div><div className="flex items-center gap-3"><span className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${error ? 'border-red-500/40 text-red-300' : !import.meta.env.VITE_DEVICE_ID ? 'border-amber-500/40 text-amber-300' : 'border-emerald-500/40 text-emerald-300'}`}><Server size={14} />{connectionLabel}</span><button onClick={() => void load()} className="rounded-lg border border-white/15 p-2"><RefreshCw size={17} /></button></div></header>{error ? <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-6"><h2 className="font-semibold">Venue Server unavailable</h2><p className="mt-2 text-sm text-red-200">{error}</p></section> : <section className="mx-auto mt-8 max-w-6xl"><div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-6"><p className="text-xs uppercase tracking-widest text-blue-300">{displayedSession?.is_active ? 'Live now' : displayedSession ? 'Next session' : 'No session configured'}</p><h2 className="mt-2 text-2xl font-semibold">{displayedSession?.title || 'No scheduled session'}</h2><p className="mt-1 text-sm text-slate-400">{displayedSession?.code || 'No session evidence'}</p></div><div className="space-y-3">{runtime?.queue.map(item => <article key={item.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="rounded-xl bg-white/10 p-3"><FileText size={22} /></div><div className="min-w-0 flex-1"><p className="text-xs text-blue-300">{item.session.code} · {item.session.title}</p><h3 className="mt-1 truncate text-lg font-medium">{item.file?.filename || 'File unavailable'}</h3><p className="mt-1 text-sm text-slate-400">{item.speaker.name} · {item.file ? `v${item.file.version} · ${item.file.delivery_status}` : 'No file'}</p></div><button disabled={!item.file || ['failed', 'cancelled'].includes(item.file.delivery_status)} onClick={() => void launch(item)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium disabled:bg-slate-700"><Play size={16} />Launch</button></article>)}{!runtime?.queue.length && <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-slate-400">No presentation queue has been published for this room.</p>}</div></section>}</main>
}

export default App
