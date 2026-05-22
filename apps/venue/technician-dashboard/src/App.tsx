import { LayoutDashboard, Monitor, Users, Settings } from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      {/* Mini Sidebar for Tablet */}
      <div className="w-20 border-r border-white/10 flex flex-col items-center py-8 gap-8">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">CP</div>
        <LayoutDashboard className="text-blue-500" />
        <Monitor className="text-zinc-500" />
        <Users className="text-zinc-500" />
        <div className="mt-auto">
          <Settings className="text-zinc-500" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold">Technician Command Center</h1>
            <p className="text-zinc-400">Venue: Grand Hall A · Session: Morning Keynote</p>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20 text-sm font-medium">
              Venue Server: Online
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-8 space-y-6">
            <div className="p-6 bg-zinc-900 rounded-2xl border border-white/5">
              <h2 className="text-xl font-semibold mb-4">Live Session Queue</h2>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-mono">0{i}</div>
                    <div className="flex-1">
                      <h3 className="font-medium">Speaker Presentation Name</h3>
                      <p className="text-sm text-zinc-400">Dr. Jane Smith · 20 mins</p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition">
                      Push to Screen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-4 space-y-6">
            <div className="p-6 bg-zinc-900 rounded-2xl border border-white/5">
              <h2 className="text-xl font-semibold mb-4">Connected Devices</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                  <span className="text-sm font-medium">Main Projector</span>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                  <span className="text-sm font-medium text-zinc-400">Stage Monitor</span>
                  <div className="w-2 h-2 bg-zinc-600 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
