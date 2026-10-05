import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { array, isRecord, record, stringValue } from './values.mts';

const run = promisify(execFile);
const exceptionRule = 'pnpm audit';

type Advisory = Record<string, unknown>;

function advisoryList(report: Record<string, unknown>): Advisory[] | undefined {
  const advisories = report['advisories'];
  return isRecord(advisories) ? Object.values(advisories).map((value) => record(value)) : undefined;
}

// pnpm's auditConfig.ignoreGhsas cannot replace approvals: it drops an advisory
// from the list but keeps it in these counts.
function onlyApprovedVulnerabilities(
  report: Record<string, unknown>,
  approved: readonly Advisory[],
): boolean {
  const metadata = report['metadata'];
  if (!isRecord(metadata)) {
    return false;
  }
  const counts = metadata['vulnerabilities'];
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  return (
    isRecord(counts) &&
    severities.every(
      (severity) =>
        counts[severity] ===
        approved.filter((advisory) => advisory['severity'] === severity).length,
    )
  );
}

function failureOutput(error: unknown): string | undefined {
  if (error instanceof Error && 'stdout' in error) {
    if (typeof error.stdout === 'string' && error.stdout !== '') {
      return error.stdout;
    }
  }
  return undefined;
}

function errorOutput(error: unknown): string {
  return failureOutput(error) ?? String(error);
}

// pnpm exits nonzero whenever it lists an advisory, including an approved one.
async function auditReport(): Promise<string> {
  try {
    const { stdout } = await run('pnpm', ['audit', '--audit-level=low', '--json']);
    return stdout;
  } catch (error) {
    const stdout = failureOutput(error);
    if (stdout === undefined) {
      throw error;
    }
    return stdout;
  }
}

async function approvedScopes(): Promise<Set<string>> {
  const exceptions = array(JSON.parse(await readFile('quality-exceptions.json', 'utf8')));
  return new Set(
    exceptions
      .map((item) => record(item))
      .filter((item) => item['rule'] === exceptionRule)
      .map((item) => stringValue(item['scope'])),
  );
}

// A scope names one advisory at one version, so the same advisory reached
// through another version of the package is still reported.
function advisoryScope(advisory: Advisory): string | undefined {
  const versions = new Set(
    array(advisory['findings']).map((finding) => stringValue(record(finding)['version'])),
  );
  const [version] = versions;
  if (versions.size !== 1 || version === undefined) {
    return undefined;
  }
  return `${stringValue(advisory['github_advisory_id'])}:${stringValue(advisory['module_name'])}@${version}`;
}

// Deletes each matched scope from unused, leaving only stale approvals there.
function approvedAdvisories(advisories: readonly Advisory[], unused: Set<string>): Advisory[] {
  if (unused.size === 0) {
    return [];
  }
  return advisories.filter((advisory) => {
    const scope = advisoryScope(advisory);
    return scope !== undefined && unused.delete(scope);
  });
}

try {
  const stdout = await auditReport();
  process.stdout.write(stdout);
  const report: unknown = JSON.parse(stdout);
  const advisories = isRecord(report) ? advisoryList(report) : undefined;
  const unused = await approvedScopes();
  const approved = approvedAdvisories(advisories ?? [], unused);
  // pnpm omits informational advisories from its list but retains their count.
  if (
    !isRecord(report) ||
    advisories?.length !== approved.length ||
    !onlyApprovedVulnerabilities(report, approved)
  ) {
    throw new Error('Dependency audit must report zero advisories at every severity.');
  }
  if (unused.size > 0) {
    throw new Error(`Remove audit exceptions pnpm no longer reports: ${[...unused].join(', ')}.`);
  }
} catch (error) {
  process.stderr.write(errorOutput(error));
  process.exitCode = 1;
}
