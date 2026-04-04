import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import type { TrioMonitorJob, TrioValidateResponse } from '../types';

// ─────────────────────────────────────────────────────────
// Axios client
// ─────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  baseURL: config.trio.baseUrl,
  headers: {
    Authorization: `Bearer ${config.trio.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Confirm a YouTube/RTSP stream is live and reachable.
 * Wraps POST /streams/validate.
 */
export async function validateStream(
  streamUrl: string,
): Promise<TrioValidateResponse> {
  try {
    const { data } = await client.post<{ reachable: boolean; reason?: string }>(
      '/streams/validate',
      { stream_url: streamUrl },
    );
    return { reachable: data.reachable, reason: data.reason };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      return {
        reachable: false,
        reason: err.response.data?.message ?? 'Trio validation request failed.',
      };
    }
    return { reachable: false, reason: 'Trio unreachable.' };
  }
}

/**
 * Start a continuous condition-monitoring job.
 * Trio will POST to our webhook URL when the condition is met,
 * or when the max duration is reached.
 *
 * Returns the Trio job object (we store job_id in DB).
 */
export async function startLiveMonitor(opts: {
  streamUrl: string;
  condition: string;
}): Promise<TrioMonitorJob> {
  const webhookUrl = `${config.publicBaseUrl}/webhook/trio`;

  const { data } = await client.post<TrioMonitorJob>('/live-monitor', {
    stream_url: opts.streamUrl,
    condition: opts.condition,
    webhook_url: webhookUrl,
    interval_seconds: config.market.trioIntervalSeconds,
    input_mode: 'clip',
    clip_duration_seconds: 3,
    monitor_duration_seconds: config.market.trioMonitorDurationSeconds,
    max_triggers: 1,
    trigger_cooldown_seconds: 0,
  });

  return data;
}

/**
 * Cancel an active Trio job (e.g. if the market is cancelled mid-flight).
 */
export async function cancelJob(jobId: string): Promise<void> {
  try {
    await client.delete(`/jobs/${jobId}`);
  } catch (err) {
    // Best-effort — log but don't throw
    console.warn(`[Trio] Failed to cancel job ${jobId}:`, err);
  }
}

/**
 * Fetch current status of a Trio job (useful for debugging).
 */
export async function getJob(jobId: string): Promise<TrioMonitorJob | null> {
  try {
    const { data } = await client.get<TrioMonitorJob>(`/jobs/${jobId}`);
    return data;
  } catch {
    return null;
  }
}