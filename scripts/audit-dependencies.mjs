import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

try {
  const { stdout } = await run('pnpm', ['audit', '--audit-level=low', '--json']);
  const report = JSON.parse(stdout);
  process.stdout.write(stdout);
  // pnpm 10 filters informational advisories out of its advisory list, but
  // preserves their count in metadata. Require a complete, empty report.
  const counts = report.metadata?.vulnerabilities;
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  if (
    !counts ||
    severities.some((severity) => counts[severity] !== 0) ||
    !report.advisories ||
    Object.keys(report.advisories).length > 0
  ) {
    throw new Error('Dependency audit must report zero advisories at every severity.');
  }
} catch (error) {
  process.stderr.write(error.stdout || error.message);
  process.exitCode = 1;
}
