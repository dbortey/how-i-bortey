export interface MirrorConfig {
  repo: string;
  branch: string;
  token: string;
}

export interface MirrorResult {
  written: number;
  skipped: number;
  configured: boolean;
}

export async function runMirror(
  _db: D1Database,
  config: MirrorConfig,
): Promise<MirrorResult> {
  if (!config.repo || !config.token) {
    return { written: 0, skipped: 0, configured: false };
  }
  return { written: 0, skipped: 0, configured: true };
}
