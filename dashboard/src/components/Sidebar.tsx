import { ServerIcon, UsersIcon, ShieldCheckIcon, ChartBarIcon } from 'lucide-react';
import Link from 'next/link';

const navigation = [
  { name: 'Overview', href: '#', icon: ChartBarIcon, current: true },
  { name: 'Players', href: '#', icon: UsersIcon, current: false },
  { name: 'Console', href: '#', icon: ServerIcon, current: false },
  { name: 'Backups', href: '#', icon: ShieldCheckIcon, current: false },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
      <div className="flex h-16 shrink-0 items-center px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/20">
            <ServerIcon className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-wider text-gradient">MC Admin</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={classNames(
                item.current
                  ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white',
                'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200'
              )}
            >
              <item.icon
                className={classNames(
                  item.current ? 'text-white' : 'text-zinc-500 group-hover:text-white',
                  'mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200'
                )}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
