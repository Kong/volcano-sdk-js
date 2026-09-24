import { execFileSync } from 'node:child_process';

const bucket = 'volcano-cloudformation-production-476702565877-us-east-2';
const prefix = '_system/hosting-releases/attempts/';
const requiredSteps = [
  'bootstrap',
  'foundation',
  'promote_artifacts',
  'prepare_hosting_infrastructure',
  'run_database_migrations',
  'roll_hosting_release',
  'public_assets',
  'deploy_smoke',
  'verify',
  'pricing_catalog',
];

function timestamp(value) {
  if (
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^[1-9][0-9]*$/.test(String(value))
  ) {
    throw new Error('malformed production attempt timestamp');
  }
  return BigInt(value);
}

function parseAttempt(raw) {
  // Hosting writes Go int64 nanoseconds; keep their exact digits through JSON parsing.
  return JSON.parse(raw.replace(/("at"\s*:\s*)([0-9]+)/g, '$1"$2"'));
}

export function selectReadyDeployment(attempts, requirement) {
  if (!/^v\d+\.\d+\.\d+$/.test(requirement.release) || !/^[a-f0-9]{40}$/.test(requirement.sha)) {
    throw new Error('backend-requirements.json must declare a Hosting release and source SHA');
  }
  if (!attempts.length) throw new Error('production has no deployment evidence');
  for (const { begin, outcome } of attempts) {
    if (
      !/^[1-9]\d*-[1-9]\d*$/.test(begin.run) ||
      !timestamp(begin.at) ||
      !/^[a-f0-9]{40}$/.test(begin.sha) ||
      !/^v\d+\.\d+\.\d+$/.test(begin.version)
    ) {
      throw new Error('malformed production attempt');
    }
    if (outcome && ['run', 'at', 'sha', 'version'].some((key) => begin[key] !== outcome[key])) {
      throw new Error('production outcome does not match its begin record');
    }
  }
  const sorted = [...attempts].sort((left, right) =>
    timestamp(right.begin.at) > timestamp(left.begin.at)
      ? 1
      : timestamp(right.begin.at) < timestamp(left.begin.at)
        ? -1
        : 0,
  );
  if (sorted.length > 1 && sorted[0].begin.at === sorted[1].begin.at) {
    throw new Error('ambiguous latest production attempt');
  }
  const latest = sorted[0].outcome;
  if (
    !latest ||
    latest.status !== 'success' ||
    latest.errors?.length ||
    requiredSteps.some((step) => latest.steps?.[step] !== 'success') ||
    !['success', 'skipped'].includes(latest.steps?.smtp_retirement)
  ) {
    throw new Error('latest production deployment is unresolved or unsuccessful');
  }
  const required = attempts.find(
    ({ begin, outcome }) =>
      begin.version === requirement.release &&
      begin.sha === requirement.sha &&
      outcome?.status === 'success',
  );
  if (!required)
    throw new Error('declared backend release and source have not completed production deployment');
  return latest;
}

export async function checkReadiness(github, requirement, run = execFileSync) {
  const aws = (args) =>
    run('aws', [...args, '--region', 'us-east-2'], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  const listing = JSON.parse(
    aws(['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', prefix, '--output', 'json']),
  );
  if (listing.IsTruncated) throw new Error('production attempt listing truncated');
  const keys = (listing.Contents || []).map(({ Key }) => Key);
  const read = (key) =>
    parseAttempt(aws(['s3', 'cp', `s3://${bucket}/${key}`, '-', '--only-show-errors']));
  const attempts = keys
    .filter((key) => key.endsWith('/begin.json'))
    .map((key) => ({
      begin: read(key),
      outcome: keys.includes(key.replace('/begin.json', '/outcome.json'))
        ? read(key.replace('/begin.json', '/outcome.json'))
        : undefined,
    }));
  const latest = selectReadyDeployment(attempts, requirement);
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
    owner: 'Kong',
    repo: 'volcano-hosting',
    basehead: `${requirement.sha}...${latest.sha}`,
    per_page: 1,
  });
  if (
    !['ahead', 'identical'].includes(comparison.status) ||
    comparison.merge_base_commit.sha !== requirement.sha
  ) {
    throw new Error('current production does not preserve the required backend source');
  }
  // Detect deployments beginning while the record and lineage were being read.
  const after = JSON.parse(
    aws(['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', prefix, '--output', 'json']),
  );
  if (after.IsTruncated || JSON.stringify(after.Contents) !== JSON.stringify(listing.Contents)) {
    throw new Error('production changed during readiness inspection; validate again');
  }
  return {
    requirement,
    version: latest.version,
    sha: latest.sha,
    run: latest.run,
    checked_at: new Date().toISOString(),
    policy: 'staging-acceptance-and-declared-production-readiness',
  };
}
