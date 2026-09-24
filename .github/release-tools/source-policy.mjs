export function isReleasePR(pr) {
  return (
    pr.head.repo?.full_name === 'Kong/volcano-sdk-js' &&
    pr.head.ref === 'release-please--branches--main--components--@volcano.dev/sdk' &&
    pr.base.ref === 'main' &&
    pr.user.login === 'kong-volcano-app[bot]'
  );
}

export function requireReviewedRelease(pr, sha) {
  if (
    !isReleasePR(pr) ||
    !pr.merged_at ||
    pr.merge_commit_sha !== sha ||
    !pr.merged_by ||
    pr.merged_by.type !== 'User' ||
    pr.auto_merge
  ) {
    throw new Error('a maintainer must deliberately merge this exact release PR source');
  }
}
