import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isRecord } from './values.mts';

const run = promisify(execFile);

function emptyAdvisories(report: Record<string, unknown>): boolean {
  const advisories = report['advisories'];
  return isRecord(advisories) && Object.keys(advisories).length === 0;
}

function zeroVulnerabilities(report: Record<string, unknown>): boolean {
  const metadata = report['metadata'];
  if (!isRecord(metadata)) {
    return false;
  }
  const counts = metadata['vulnerabilities'];
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  return isRecord(counts) && severities.every((severity) => counts[severity] === 0);
}

function errorOutput(error: unknown): string {
  if (error instanceof Error && 'stdout' in error) {
    if (typeof error.stdout === 'string' && error.stdout !== '') {
      return error.stdout;
    }
  }
  return String(error);
}

try {
  const { stdout } = await run('pnpm', ['audit', '--audit-level=low', '--json']);
  const report: unknown = JSON.parse(stdout);
  process.stdout.write(stdout);
  // pnpm omits informational advisories from its list but retains their count.
  if (!isRecord(report) || !emptyAdvisories(report) || !zeroVulnerabilities(report)) {
    throw new Error('Dependency audit must report zero advisories at every severity.');
  }
} catch (error) {
  process.stderr.write(errorOutput(error));
  process.exitCode = 1;
}
