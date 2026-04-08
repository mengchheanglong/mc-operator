"use client";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#05060a] px-5 py-8 text-white md:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4">
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="h-12 w-full max-w-xl animate-pulse rounded-2xl bg-white/10" />
            <div className="h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/5" />
            <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-white/5" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
              <div className="h-9 w-28 animate-pulse rounded-2xl bg-white/10" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[22px] border border-white/8 bg-white/[0.03] p-5"
                >
                  <div className="mb-4 h-4 w-24 animate-pulse rounded-full bg-white/10" />
                  <div className="mb-2 h-8 w-20 animate-pulse rounded-2xl bg-white/10" />
                  <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="h-4 w-24 animate-pulse rounded-full bg-white/10" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4"
                >
                  <div className="mb-2 h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
                  <div className="mb-2 h-3 w-full animate-pulse rounded-full bg-white/5" />
                  <div className="h-3 w-3/5 animate-pulse rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
