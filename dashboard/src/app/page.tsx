import { Card } from "@/components/Card";
import { ActivityIcon, UsersIcon, CpuIcon, MemoryStickIcon } from "lucide-react";

const stats = [
  { name: 'Active Players', value: '12 / 50', change: '+2', changeType: 'increase', icon: UsersIcon },
  { name: 'Server Status', value: 'Online', change: '99.9% uptime', changeType: 'positive', icon: ActivityIcon },
  { name: 'CPU Usage', value: '45%', change: '-5%', changeType: 'decrease', icon: CpuIcon },
  { name: 'RAM Usage', value: '4.2 GB', change: 'Stable', changeType: 'neutral', icon: MemoryStickIcon },
];

export default function DashboardOverview() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Monitor your Minecraft server&apos;s performance, player activity, and system health.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-400">{stat.name}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{stat.value}</p>
              </div>
              <div className="rounded-full bg-white/5 p-3 shadow-inner ring-1 ring-white/10 group-hover:ring-white/20 transition-all duration-300">
                <stat.icon className="h-6 w-6 text-blue-400" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                  stat.changeType === 'increase' || stat.changeType === 'positive'
                    ? 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20'
                    : stat.changeType === 'decrease'
                    ? 'bg-blue-400/10 text-blue-400 ring-blue-400/20'
                    : 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20'
                }`}
              >
                {stat.change}
              </span>
              <span className="text-xs text-zinc-500">from last hour</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between h-96">
          <div>
            <h3 className="text-lg font-semibold text-white">Player Activity (24h)</h3>
            <p className="text-sm text-zinc-400">Number of unique connections over time.</p>
          </div>
          <div className="mt-6 flex-1 flex items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 relative overflow-hidden">
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
             <p className="text-zinc-500 z-10 flex items-center gap-2"><ActivityIcon className="w-5 h-5 animate-pulse" /> Awaiting live data stream...</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between h-96">
          <div>
            <h3 className="text-lg font-semibold text-white">Recent Console Logs</h3>
            <p className="text-sm text-zinc-400">Latest server events and commands.</p>
          </div>
          <div className="mt-6 flex-1 rounded-lg bg-[#0c0c0e] border border-white/5 p-4 font-mono text-sm text-zinc-300 overflow-y-auto">
            <div className="space-y-2">
              <p><span className="text-blue-400">[12:04:12]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Starting minecraft server version 1.20.4</p>
              <p><span className="text-blue-400">[12:04:15]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Loading properties</p>
              <p><span className="text-blue-400">[12:04:15]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Default game type: SURVIVAL</p>
              <p><span className="text-blue-400">[12:04:16]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Generating keypair</p>
              <p><span className="text-blue-400">[12:04:22]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Starting Minecraft server on *:25565</p>
              <p><span className="text-emerald-400">[12:04:28]</span> <span className="text-emerald-500/70">[Server thread/INFO]:</span> Done (15.234s)! For help, type &quot;help&quot;</p>
              <p className="text-yellow-400/90"><span className="text-blue-400">[12:05:01]</span> <span className="text-zinc-500">[Server thread/WARN]:</span> Can&apos;t keep up! Is the server overloaded?</p>
              <p><span className="text-blue-400">[12:08:14]</span> <span className="text-zinc-500">[Server thread/INFO]:</span> Player notch joined the game</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
