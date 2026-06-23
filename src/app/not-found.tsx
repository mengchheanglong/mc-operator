import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-blue-200 mc-shadow-md">
        <Compass className="h-7 w-7" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The route you requested does not exist in this workspace. Return to the dashboard to continue.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-400/35 bg-blue-500/90 px-4 text-sm font-semibold text-white mc-shadow-glow-blue transition hover:bg-blue-400"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
