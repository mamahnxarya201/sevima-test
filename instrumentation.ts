export async function register() {
  // Skip in edge runtime (only run on Node.js server)
  if (process.env.NEXT_RUNTIME === 'edge') return;

  console.log('[instrumentation] register() called, starting scheduler poller...');
  const { startSchedulerPoller } = await import('@/lib/scheduler/schedulerPoller');
  void startSchedulerPoller();
}
