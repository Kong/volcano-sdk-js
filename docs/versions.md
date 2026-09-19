---
title: JavaScript SDK versions
description: Pin a tested SDK version, check runtime compatibility, upgrade safely, and restore a previous application dependency set.
---

Pin the SDK version your application has tested. For example:

```bash
npm install --save-exact @volcano.dev/sdk@1.10.0
```

These are example versions, not a moving latest-version reference.
Commit `package.json` and `package-lock.json`. Use `npm ci` to reproduce that dependency tree.

## Runtime and compatibility

Use Node.js 20 or later, or a browser with the APIs required by the feature you use. The native CI suite runs on Node.js 20; publishing builds run on Node.js 24. Durable function authoring needs its separately documented runtime.

The package uses semantic versions. Read the migration notes before a major update and the release notes before any update.
JavaScript, Python and Ruby releases have independent version numbers; matching numbers are not a compatibility requirement.
JavaScript keeps its result-envelope API; Python and Ruby raise typed exceptions.
Follow your language's public facade and examples rather than importing generated transport classes.

The docs describe the current SDK source. Confirm a method is included in your installed version by checking its [release notes](https://github.com/Kong/volcano-sdk-js/releases) and [changelog](https://github.com/Kong/volcano-sdk-js/blob/main/CHANGELOG.md).
Server-dependent features also need the corresponding Volcano API behavior; installing a newer SDK does not deploy that behavior.

## Upgrade an application

1. Read the release notes between your installed version and the intended version, including breaking changes and runtime requirements.
2. Update the dependency in a branch and review the resolved lockfile changes.
3. Run the [documented quickstart](./getting-started.md) with a disposable test project, then run the application tests for the features you use.
4. Deploy the tested application and dependency lock together. Retain the previous tested application revision and lock.

A successful package import proves installation, not compatibility with every deployed API feature.

## Restore a previous version

Restore the previously tested application revision and its dependency lock together, then install from that lock in a clean environment.
Run the same quickstart and application tests before redeploying it.
Do not select an arbitrary older SDK version or downgrade only the top-level dependency while retaining a different transitive dependency tree.

Restoring application packages does not revert server configuration, schema changes, stored data or completed operations.
Check those dependencies before rolling back an application that changed them.

## Report a compatibility problem

Open an [SDK issue](https://github.com/Kong/volcano-sdk-js/issues) with the installed SDK version, runtime version, affected method, expected result and a minimal reproduction.
Include a sanitized error category and status when available.
Remove keys, tokens, passwords and private response bodies.
