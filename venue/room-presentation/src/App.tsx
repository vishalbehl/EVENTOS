import { useState, useEffect } from 'react'

function App() {
  const [status, setStatus] = useState('Initializing...')

  useEffect(() => {
    // This will eventually connect to the Snapshot API
    const timer = setTimeout(() => setStatus('Waiting for Snapshot...'), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white font-sans uppercase tracking-[0.2em]">
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-violet-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative w-32 h-32 bg-black rounded-full flex items-center justify-center border border-white/10">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
      <h1 className="mt-12 text-2xl font-light">Autonomous Display Engine</h1>
      <p className="mt-4 text-sm text-zinc-500">{status}</p>
      
      {/* Background Micro-animation */}
      <div className="fixed bottom-12 left-12 flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`w-1 h-8 bg-blue-500/20 rounded-full animate-pulse`} style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </div>
    </div>
  )
}

export default App
