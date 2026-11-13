/* oxlint-disable eslint/max-lines -- Keep the independent published contract intact; this fixture is never packaged. */
// Source compatibility for the public OpenAPI aliases at 8dc3d45da48957405045a88eea8cfd78de7b2468.
// Baseline src/generated/openapi.d.ts SHA-256: 81c90f85ad9dd9fc2cd9327c8a1f1cf1e1530a5d49c04398368565567f6ce5fd.
// Historical declarations do not restore routes or promise current server behavior.
// Unshipped independent fixture; ordinary producer synchronization preserves this baseline.
export interface paths {
  '/sandboxes/presets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSandboxPresets'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandboxes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSandboxes'];
    put?: never;
    post: operations['createSandbox'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandboxes/{sandboxId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandbox'];
    put?: never;
    post?: never;
    delete: operations['deleteSandbox'];
    options?: never;
    head?: never;
    patch: operations['updateSandbox'];
    trace?: never;
  };
  '/projects/{id}/sandboxes/{sandboxId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSandboxDeployments'];
    put?: never;
    post: operations['deploySandbox'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandboxes/{sandboxId}/deployments/{deploymentId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandboxDeployment'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandboxes/{sandboxId}/deployments/{deploymentId}/logs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandboxDeploymentLogs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandboxes/{sandboxId}/deployments/{deploymentId}/source': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandboxDeploymentSource'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandbox-sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSandboxSessions'];
    put?: never;
    post: operations['createSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/sandbox-executions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['executeSandbox'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSandboxSession'];
    put?: never;
    post?: never;
    delete: operations['terminateSandboxSession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/suspend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['suspendSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/resume': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resumeSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/exec': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['executeSandboxSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/files/read': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['readSandboxSessionFile'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/files/write': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['writeSandboxSessionFile'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/grants/{subjectId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['grantSandboxSession'];
    post?: never;
    delete: operations['revokeSandboxSession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sandbox-sessions/{sessionId}/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createSandboxSessionAccess'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/imports/connect': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startImportConnect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/imports/{provider}/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['completeImportConnect'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/imports/connections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listImportConnections'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/imports/connections/{connectionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteImportConnection'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/imports/{provider}/sources': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listImportSources'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/imports/{provider}/preflight': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['preflightProjectImport'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/imports/{provider}/runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startProjectImport'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/imports/{provider}/runs/{runId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectImportRun'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connect': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startGitConnect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGitConnections'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connections/{connectionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteGitConnection'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connections/{connectionId}/installations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGitInstallations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/git/connections/{connectionId}/installations/{installationId}/repositories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGitInstallationRepositories'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/domains': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listVerifiedDomains'];
    put?: never;
    post: operations['verifyDomain'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/user/domains/{domain}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteVerifiedDomain'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/github/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['gitConnectCallback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjects'];
    put?: never;
    post: operations['createProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProject'];
    put?: never;
    post?: never;
    delete: operations['deleteProject'];
    options?: never;
    head?: never;
    patch: operations['updateProject'];
    trace?: never;
  };
  '/projects/{id}/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/metrics/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryProjectMetrics'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/logo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectLogo'];
    put?: never;
    post: operations['uploadProjectLogo'];
    delete: operations['deleteProjectLogo'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectUsage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/shared-variables': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['replaceSharedVariables'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontend-shared-variables': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['replaceFrontendSharedVariables'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectConfig'];
    put: operations['applyProjectConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/source-export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectSourceExport'];
    put?: never;
    post: operations['exportProjectSource'];
    delete: operations['cancelProjectSourceExport'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection/production-branch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['setProjectGitProductionBranch'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection/root-directory': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['setProjectGitRootDirectory'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-connection': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectGitConnection'];
    put: operations['connectProjectGit'];
    post?: never;
    delete: operations['disconnectProjectGit'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/git-deploy-settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectGitDeploySettings'];
    put: operations['updateProjectGitDeploySettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/queries': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectDatabaseQueries'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/deployments/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['summarizeProjectDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/domains': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectCustomDomains'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctions'];
    put?: never;
    post: operations['createFunction'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFunction'];
    put?: never;
    post?: never;
    delete: operations['deleteFunction'];
    options?: never;
    head?: never;
    patch: operations['updateFunction'];
    trace?: never;
  };
  '/functions/{functionId}/invoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['invokeFunction'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-functions/{functionId}/executions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startDurableExecutionFromApplication'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-functions/{functionId}/executions/{executionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableExecutionFromApplication'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-functions/{functionId}/executions/{executionId}/stop': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['stopDurableExecutionFromApplication'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-functions/{functionId}/executions/{executionId}/messages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableMessagesFromApplication'];
    put?: never;
    post: operations['sendDurableMessageFromApplication'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/functions/resolve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['resolveFunctionForInvocation'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/logs/activity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['getProjectLogActivity'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/logs/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['searchProjectLogs'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/logs/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['streamProjectLogs'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/batch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createFunctionsBatch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/schedulers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectSchedulers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/notifications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getNotificationSettings'];
    put: operations['updateNotificationSettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/notifications/webhook-secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rotateNotificationWebhookSecret'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/notifications/test': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['sendTestNotification'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}/schedulers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctionSchedulers'];
    put?: never;
    post: operations['createFunctionScheduler'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}/schedulers/{schedulerId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFunctionScheduler'];
    put?: never;
    post?: never;
    delete: operations['deleteFunctionScheduler'];
    options?: never;
    head?: never;
    patch: operations['updateFunctionScheduler'];
    trace?: never;
  };
  '/projects/{id}/functions/{functionId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctionDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableFunctions'];
    put?: never;
    post: operations['createDurableFunction'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableFunction'];
    put?: never;
    post?: never;
    delete: operations['deleteDurableFunction'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableFunctionDeployments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/schedulers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableFunctionSchedulers'];
    put?: never;
    post: operations['createDurableFunctionScheduler'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/schedulers/{schedulerId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableFunctionScheduler'];
    put?: never;
    post?: never;
    delete: operations['deleteDurableFunctionScheduler'];
    options?: never;
    head?: never;
    patch: operations['updateDurableFunctionScheduler'];
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableExecutions'];
    put?: never;
    post: operations['startDurableExecution'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions/{executionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableExecution'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions/{executionId}/operations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableExecutionOperations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions/{executionId}/stop': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['stopDurableExecution'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions/{executionId}/messages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableMessages'];
    put?: never;
    post: operations['sendDurableMessage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-functions/{functionId}/executions/{executionId}/message-waits': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableMessageWaits'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-messages/waits': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['registerDurableMessageWait'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-messages/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['openDurableMessageSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-messages/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['publishDurableMessage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-callbacks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['registerDurableCallback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-callbacks/succeed': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['succeedDurableCallback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-callbacks/fail': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['failDurableCallback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-callbacks/heartbeat': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['heartbeatDurableCallback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/durable-approvals': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['requestDurableApproval'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listIssues'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues/{issueId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIssue'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateIssue'];
    trace?: never;
  };
  '/projects/{id}/autofix': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAutofixSettings'];
    put: operations['updateAutofixSettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/issues/{issueId}/autofix-runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startAutofixRun'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/autofix-runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAutofixRuns'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/autofix-runs/{runId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAutofixRun'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-approvals': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDurableApprovals'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-approvals/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableApprovalStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-approvals/{approvalId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDurableApproval'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-approvals/{approvalId}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['approveDurableApproval'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/durable-approvals/{approvalId}/deny': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['denyDurableApproval'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFrontends'];
    put?: never;
    post: operations['createFrontend'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFrontend'];
    put?: never;
    post?: never;
    delete: operations['deleteFrontend'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/redeploy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['redeployFrontend'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/domain': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFrontendCustomDomain'];
    put?: never;
    post: operations['createFrontendCustomDomain'];
    delete: operations['deleteFrontendCustomDomain'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/domains': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    get: operations['listFrontendDomains'];
    put?: never;
    post: operations['createFrontendDomain'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/domains/{domain}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        domain: components['parameters']['FrontendCustomDomainHostname'];
      };
      cookie?: never;
    };
    get: operations['getFrontendDomain'];
    put?: never;
    post?: never;
    delete: operations['deleteFrontendDomain'];
    options?: never;
    head?: never;
    patch: operations['updateFrontendDomain'];
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/deployments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFrontendDeployments'];
    put?: never;
    post: operations['createFrontendDeployment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getFrontendUsageHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/function-routes': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    get: operations['listFrontendFunctionRoutes'];
    put?: never;
    post: operations['createFrontendFunctionRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/function-routes/{routeId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendFunctionRouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put: operations['updateFrontendFunctionRoute'];
    post?: never;
    delete: operations['deleteFrontendFunctionRoute'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/frontend-routes': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    get: operations['listFrontendRoutes'];
    put?: never;
    post: operations['createFrontendRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/frontends/{frontendId}/frontend-routes/{routeId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendRouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put: operations['updateFrontendRoute'];
    post?: never;
    delete: operations['deleteFrontendRoute'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/variable-environments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listVariableEnvironments'];
    put?: never;
    post: operations['createVariableEnvironment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/variable-environments/{environmentId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        environmentId: components['parameters']['VariableEnvironmentId'];
      };
      cookie?: never;
    };
    get: operations['getVariableEnvironment'];
    put?: never;
    post?: never;
    delete: operations['deleteVariableEnvironment'];
    options?: never;
    head?: never;
    patch: operations['renameVariableEnvironment'];
    trace?: never;
  };
  '/projects/{id}/variables': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listVariables'];
    put?: never;
    post: operations['createVariable'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabases'];
    put?: never;
    post: operations['createDatabase'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabase'];
    put?: never;
    post?: never;
    delete: operations['deleteDatabase'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/branches': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseBranches'];
    put?: never;
    post: operations['createDatabaseBranch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/branches/{branchName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseBranch'];
    put?: never;
    post?: never;
    delete: operations['deleteDatabaseBranch'];
    options?: never;
    head?: never;
    patch: operations['updateDatabaseBranch'];
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/branches/{branchName}/reset': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resetDatabaseBranch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/branches/{branchName}/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resetDatabaseBranchPassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/backups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseBackups'];
    put?: never;
    post: operations['createDatabaseBackup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/backups/{backupName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseBackup'];
    put?: never;
    post?: never;
    delete: operations['deleteDatabaseBackup'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/backup-schedule': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseBackupSchedule'];
    put: operations['updateDatabaseBackupSchedule'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/restores': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseRestores'];
    put?: never;
    post: operations['createDatabaseRestore'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/restores/{restoreId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseRestore'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resetDatabasePassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/type': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateDatabaseType'];
    trace?: never;
  };
  '/projects/{id}/databases/{databaseName}/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDatabaseStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/query/ping': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabasePing'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/query/select': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseSelect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/query/insert': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseInsert'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/query/update': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseUpdate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/query/delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseDelete'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/branches/{branchName}/query/ping': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseBranchPing'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/branches/{branchName}/query/select': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseBranchSelect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/branches/{branchName}/query/insert': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseBranchInsert'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/branches/{branchName}/query/update': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseBranchUpdate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/{databaseName}/branches/{branchName}/query/delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['queryDatabaseBranchDelete'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/regions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDatabaseRegions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/databases/postgres-versions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listPostgresVersions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/functions/runtimes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctionRuntimes'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/functions/regions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listFunctionRegions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/variables/{name}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getVariable'];
    put: operations['updateVariable'];
    post?: never;
    delete: operations['deleteVariable'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/password-policy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authGetPasswordPolicy'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/signup': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authSignup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/signin': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authSignin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/refresh': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authRefresh'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authLogout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/forgot-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authForgotPassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authResetPassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authConfirmEmail'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/resend-confirmation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authResendConfirmation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/signup-anonymous': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authSignupAnonymous'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/convert-anonymous': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authConvertAnonymous'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/change-email': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authRequestEmailChange'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/confirm-email-change': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authConfirmEmailChange'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/cancel-email-change': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['authCancelEmailChange'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authGetMySessions'];
    put?: never;
    post?: never;
    delete: operations['authDeleteAllMySessions'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['authDeleteMySession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authGetUser'];
    put: operations['authUpdateUser'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/identities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authListIdentities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/identities/{identityId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['authUnlinkIdentity'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/methods': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authListMethods'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/user/methods/{methodId}/promote': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authPromoteMethod'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/insights': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthInsights'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAuthUsers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthUser'];
    put?: never;
    post?: never;
    delete: operations['deleteAuthUser'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users/{userId}/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listUserSessions'];
    put?: never;
    post?: never;
    delete: operations['deleteAllUserSessions'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users/{userId}/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteUserSession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users/{userId}/ban': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['banAuthUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/users/{userId}/unban': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['unbanAuthUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/email-templates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listEmailTemplates'];
    put?: never;
    post: operations['createEmailTemplate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/email-templates/{type}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEmailTemplate'];
    put: operations['updateEmailTemplate'];
    post?: never;
    delete: operations['deleteEmailTemplate'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/email-templates/defaults': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDefaultEmailTemplates'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/email-templates/defaults/{type}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDefaultEmailTemplate'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthConfig'];
    put: operations['updateAuthConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/config/test-email': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['testEmailConfig'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/hosted-pages/{pageType}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthHostedPage'];
    put: operations['updateAuthHostedPage'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/pages/appearance': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthPageAppearance'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/pages/theme': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['updateAuthPageTheme'];
    post?: never;
    delete: operations['deleteAuthPageTheme'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/pages/{pageType}/layout': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    get?: never;
    put: operations['updateAuthPageLayout'];
    post?: never;
    delete: operations['deleteAuthPageLayout'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/pages/{pageType}/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['renderAuthPagePreview'];
    put?: never;
    post: operations['previewAuthPage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/hosted/{pageType}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['renderManagedAuthPage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/hosted': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['renderDefaultManagedAuthPage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/hosted/login/options': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getHostedLoginOptions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/hosted/login/check-email': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['hostedLoginCheckEmail'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/auth/methods': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthMethods'];
    put: operations['configureAuthMethods'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/oauth/configs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listOAuthConfigs'];
    put?: never;
    post: operations['createOAuthConfig'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/oauth/configs/{provider}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOAuthConfig'];
    put: operations['updateOAuthConfig'];
    post?: never;
    delete: operations['deleteOAuthConfig'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/oauth/providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAvailableOAuthProviders'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/authorize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authOAuthAuthorize'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authOAuthCallback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/exchange': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authOAuthExchange'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/device/authorize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authDeviceAuthorize'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/device/token': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authDeviceToken'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/device/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authDeviceVerify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/platform/exchange': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authPlatformExchange'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['authListOAuthProviders'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/link': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['authLinkOAuthProvider'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/unlink': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['authUnlinkOAuthProvider'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/refresh-token': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['refreshOAuthProviderToken'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/token': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOAuthProviderToken'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/{provider}/call-api': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['callOAuthProviderAPI'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAnonKeys'];
    put?: never;
    post: operations['createAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys/{keyId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAnonKey'];
    put?: never;
    post?: never;
    delete: operations['revokeAnonKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys/{keyId}/regenerate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/anon-keys/{keyId}/set-default': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['setDefaultAnonKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/access-tokens': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectAccessTokens'];
    put?: never;
    post: operations['createProjectAccessToken'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/access-tokens/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectAccessTokensUsage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/access-tokens/{tokenId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectAccessToken'];
    put?: never;
    post?: never;
    delete: operations['revokeProjectAccessToken'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/access-tokens/{tokenId}/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectAccessTokenUsage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listServiceKeys'];
    put?: never;
    post: operations['createServiceKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys/{keyId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getServiceKey'];
    put?: never;
    post?: never;
    delete: operations['deleteServiceKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/service-keys/{keyId}/regenerate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateServiceKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/storage/buckets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listStorageBuckets'];
    put?: never;
    post: operations['createStorageBucket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/storage/buckets/{bucketName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStorageBucket'];
    put?: never;
    post?: never;
    delete: operations['deleteStorageBucket'];
    options?: never;
    head?: never;
    patch: operations['updateStorageBucket'];
    trace?: never;
  };
  '/projects/{id}/storage/buckets/{bucketName}/policies': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listStoragePolicies'];
    put?: never;
    post: operations['createStoragePolicy'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/storage/buckets/{bucketName}/policies/{policyId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteStoragePolicy'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/storage/objects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listStorageObjectsAdmin'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/storage/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStorageStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/realtime/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getRealtimeConfig'];
    put: operations['updateRealtimeConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/projects/{id}/realtime/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getRealtimeStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/storage/{bucketName}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listStorageObjects'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/locks/{key}/lease': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['acquireProjectLock'];
    delete: operations['releaseProjectLock'];
    options?: never;
    head?: never;
    patch: operations['renewProjectLock'];
    trace?: never;
  };
  '/locks/{key}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectLock'];
    put?: never;
    post?: never;
    delete: operations['forceReleaseProjectLock'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/storage/{bucketName}/move': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['moveStorageObject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/storage/{bucketName}/copy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['copyStorageObject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/storage/{bucketName}/{path}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['downloadStorageObject'];
    put: operations['uploadPart'];
    post: operations['uploadStorageObject'];
    delete: operations['deleteStorageObject'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/storage/{bucketName}/{path}/visibility': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateStorageObjectVisibility'];
    trace?: never;
  };
  '/public/{projectId}/{bucketName}/{path}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['downloadPublicFile'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['healthCheck'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listCapabilities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/openapi.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenAPISpecJSON'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head: operations['headOpenAPISpecJSON'];
    patch?: never;
    trace?: never;
  };
  '/openapi.yaml': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenAPISpecYAML'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head: operations['headOpenAPISpecYAML'];
    patch?: never;
    trace?: never;
  };
  '/mcp': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['callMCP'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    SandboxPreset: {
      id: string;
      runtime: string;
      version: string;
      memory_mb: 1024 | 2048;
      regions: string[];
    };
    SandboxTemplate: {
      id: string;
      project_id: string;
      name: string;
      preset?: string;
      memory_mb?: number;
      status: 'ready' | 'unavailable' | 'deleting';
      created_at: string;
    };
    CreateSandboxTemplateRequest: {
      name: string;
      preset: string;
      memory_mb?: 1024 | 2048;
    };
    UpdateSandboxTemplateRequest: {
      name: string;
    };
    SandboxSession: {
      id: string;
      project_id: string;
      sandbox_id: string | null;
      state:
        | 'starting'
        | 'running'
        | 'suspending'
        | 'suspended'
        | 'resuming'
        | 'terminating'
        | 'terminated'
        | 'unknown';
      desired_state: 'running' | 'suspended' | 'terminated';
      region: string;
      memory_mb: number;
      created_at: string;
      started_at?: string;
      expires_at: string | null;
    };
    CreateSandboxSessionRequest: {
      preset?: string;
      sandbox_id?: string;
      memory_mb?: 1024 | 2048;
      region: string;
      max_duration_seconds?: number;
      // oxlint-disable-next-line typescript/no-redundant-type-constituents, typescript/no-duplicate-type-constituents -- Preserve this exact historical schema expression as independent consumer evidence.
    } & (unknown | unknown);
    SandboxCommandRequest: {
      command: string;
      timeout_seconds?: number;
      environment?: {
        [key: string]: string;
      };
    };
    SandboxExecutionRequest: {
      preset?: string;
      sandbox_id?: string;
      memory_mb?: 1024 | 2048;
      region: string;
      max_duration_seconds?: number;
      command: string;
      timeout_seconds?: number;
      environment?: {
        [key: string]: string;
      };
      // oxlint-disable-next-line typescript/no-redundant-type-constituents, typescript/no-duplicate-type-constituents -- Preserve this exact historical schema expression as independent consumer evidence.
    } & (unknown | unknown);
    SandboxCommandResult: {
      stdout: string;
      stderr: string;
      exit_code: number;
      stdout_truncated: boolean;
      stderr_truncated: boolean;
      timed_out: boolean;
    };
    SandboxExecutionResult: {
      stdout: string;
      stderr: string;
      exit_code: number;
      stdout_truncated: boolean;
      stderr_truncated: boolean;
      timed_out: boolean;
      session_id: string;
      region: string;
      duration_ms: number;
    };
    SandboxFileWriteRequest: {
      path: string;
      data: string;
    };
    SandboxFileReadRequest: {
      path: string;
    };
    SandboxFileResult: {
      data: string;
    };
    SandboxSubjectGrantRequest: {
      expires_at: string;
    };
    SandboxAccessRequest: {
      port: number;
      expires_in_seconds?: number;
    };
    SandboxAccess: {
      url: string;
      token: string;
      expires_at: string;
    };
    SandboxBuildLogPage: {
      data: {
        timestamp: string;
        message: string;
      }[];
      next_cursor?: string;
    };
    SandboxDeployment: {
      id: string;
      status: string;
      created_at: string;
      updated_at: string;
    };
    SandboxPagination: {
      limit: number;
      has_more: boolean;
      next_cursor?: string;
    };
    SandboxTemplatePage: {
      data: components['schemas']['SandboxTemplate'][];
      pagination: components['schemas']['SandboxPagination'];
    };
    SandboxSessionPage: {
      data: components['schemas']['SandboxSession'][];
      pagination: components['schemas']['SandboxPagination'];
    };
    SandboxDeploymentPage: {
      data: components['schemas']['SandboxDeployment'][];
      pagination: components['schemas']['SandboxPagination'];
    };
    SandboxPresetList: {
      data: components['schemas']['SandboxPreset'][];
    };
    Capability: {
      id: string;
      status: components['schemas']['CapabilityStatus'];
    };
    CapabilityStatus: 'available' | 'unavailable';
    CapabilityList: {
      data: components['schemas']['Capability'][];
    };
    SandboxCapacity: {
      region: string;
      allocated_memory_mb: number;
    };
    SandboxCapacityList: {
      data: components['schemas']['SandboxCapacity'][];
    };
    PublishSandboxPresetRequest: {
      id: string;
      preset: 'python3.12' | 'node22';
      memory_mb: 1024 | 2048;
      deployment_id: string;
    };
    AnonKey: {
      id: string;
      project_id?: string;
      name: string;
      key_value: string;
      permissions?: string[];
      is_default?: boolean;
      created_at?: string;
    };
    AuthConfig: {
      project_id?: string;
      access_token_lifetime?: number;
      refresh_token_lifetime?: number;
      refresh_token_reuse_interval?: number;
      inactivity_timeout?: number;
      max_session_duration?: number;
      min_password_length?: number;
      password_policy: components['schemas']['AuthPasswordPolicy'];
      require_uppercase?: boolean;
      require_lowercase?: boolean;
      require_numbers?: boolean;
      require_special_chars?: boolean;
      enable_signup?: boolean;
      enable_email_password?: boolean;
      rate_limit_signup?: number;
      rate_limit_signin?: number;
      rate_limit_token_refresh?: number;
      rate_limit_password_reset?: number;
      cors_enabled?: boolean;
      cors_allowed_origins?: string[];
      enable_anonymous_signins?: boolean;
      allowed_email_domains?: string[];
      allowed_email_domains_mode?: 'disabled' | 'signup' | 'signup_and_signin';
      platform_token_ttl?: number;
      allow_password_reset?: boolean;
      password_reset_timeout?: number;
      max_password_history?: number;
      cors_allow_credentials?: boolean;
      cors_max_age?: number;
      require_email_confirmation?: boolean;
      email_confirmation_timeout?: number;
      auto_link_verified_oauth?: boolean;
      email_enabled?: boolean;
      email_from_address?: string;
      email_from_name?: string;
      smtp_host?: string;
      smtp_port?: number;
      smtp_username?: string;
      smtp_password_configured?: boolean;
      smtp_use_tls?: boolean;
      email_confirmation_subject?: string;
      email_password_reset_subject?: string;
      email_password_changed_subject?: string;
      managed_auth_enabled?: boolean;
      post_auth_redirect_url?: string;
      allowed_redirect_urls?: string[];
      post_logout_redirect_url?: string;
      device_verification_url?: string;
      created_at?: string;
      updated_at?: string;
    };
    AuthInsightsInterval: 'day' | 'week' | 'month';
    AuthInsightsResponse: {
      project_id: string;
      observed_at: string;
      window: components['schemas']['AuthInsightsWindow'];
      summary: components['schemas']['AuthInsightsSummary'];
      series: components['schemas']['AuthInsightsSeriesPoint'][];
    };
    AuthInsightsSeriesPoint: {
      bucket_start: string;
      signups: number;
      signins: number;
      banned_users: number;
      deleted_users: number;
      available_users: number;
      deletions: number;
      net_growth: number;
      is_partial: boolean;
    };
    AuthInsightsSummary: {
      total_users: number;
      deleted_users: number;
      active_users_1d: number;
      active_users_30d: number;
    };
    AuthInsightsWindow: {
      from: string;
      to: string;
      interval: components['schemas']['AuthInsightsInterval'];
    };
    AuthHostedPage: {
      id?: string;
      project_id?: string;
      page_type?: components['schemas']['HostedAuthPageType'];
      html?: string;
      css?: string;
      created_at?: string;
      updated_at?: string;
    };
    AuthPageAppearanceResponse: {
      theme: components['schemas']['AuthPageTheme'];
      layouts: {
        [key: string]: components['schemas']['AuthPageLayout'];
      };
      customisation_allowed: boolean;
      parked: {
        [key: string]: boolean;
      };
      defaults: components['schemas']['AuthPageAppearanceDefaults'];
      options: components['schemas']['AuthPageAppearanceOptions'];
    };
    AuthPageDensity: 'compact' | 'comfortable' | 'spacious';
    AuthPageFont: 'system' | 'humanist' | 'geometric' | 'slab' | 'mono';
    AuthPageLayout: 'centered' | 'split-left' | 'split-right';
    AuthPageRadius: 'none' | 'small' | 'medium' | 'large';
    AuthPageScale: 'small' | 'default' | 'large';
    AuthPageTheme: {
      version: 1;
      colors: components['schemas']['AuthPageThemeColors'];
      font: components['schemas']['AuthPageFont'];
      scale: components['schemas']['AuthPageScale'];
      density: components['schemas']['AuthPageDensity'];
      radius: components['schemas']['AuthPageRadius'];
    };
    AuthHostedPageResponse: {
      page: components['schemas']['AuthHostedPage'] | null;
      defaults: components['schemas']['AuthHostedPageDefaults'];
      runtime: components['schemas']['AuthHostedPageRuntime'];
    };
    AuthIdentity: {
      id: string;
      email: string;
      email_verified: boolean;
      is_primary: boolean;
      created_at: string;
    };
    AuthIdentitiesResponse: {
      identities: components['schemas']['AuthIdentity'][];
    };
    AuthMethodSummary: {
      id: string;
      type: 'password' | 'oauth' | 'anonymous';
      provider?: string;
      identity_id: string;
      email: string;
      is_primary: boolean;
      last_used_at?: string;
      created_at: string;
      updated_at: string;
    };
    AuthMethodsResponse: {
      methods: components['schemas']['AuthMethodSummary'][];
    };
    AuthPasswordPolicy: {
      effective_min_length: number;
      min_configurable_length: number;
      max_length: number;
      require_uppercase: boolean;
      require_lowercase: boolean;
      require_numbers: boolean;
      require_special_chars: boolean;
      compromised_passwords_rejected: boolean;
    };
    AuthSession: {
      id: string;
      user_id: string;
      provider: 'email' | 'google' | 'github' | 'microsoft' | 'apple' | 'anonymous';
      user_agent?: string;
      ip_address?: string;
      last_ip_address?: string;
      expires_at: string;
      last_activity_at?: string;
      session_started_at?: string;
      is_active: boolean;
      is_current: boolean;
      created_at?: string;
      updated_at?: string;
    };
    AuthSignupResponse: {
      confirmation_required: boolean;
      message: string;
    };
    AuthTokenResponse: {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token?: string;
      user: components['schemas']['AuthUser'];
    };
    AuthUser: {
      id: string;
      project_id?: string;
      email: string;
      email_confirmed?: boolean;
      user_metadata?: {
        [key: string]: unknown;
      };
      app_metadata?: {
        [key: string]: unknown;
      };
      avatar_url?: string;
      status: 'active' | 'banned' | 'deleted';
      banned_until?: string | null;
      last_sign_in_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    BanUserResponse: {
      message: string;
      user_id: string;
      email: string;
      status: 'banned';
      banned_until?: string | null;
    };
    BatchFunctionDeployFailure: {
      name: string;
      function_id?: string;
      operation?: 'deploy' | 'update';
      error: string;
    };
    BatchFunctionDeployResponse: {
      batch_id: string;
      data: components['schemas']['Function'][];
      failed?: components['schemas']['BatchFunctionDeployFailure'][];
    };
    CompleteUploadSessionResponse: {
      object?: components['schemas']['StorageObject'];
    };
    CreateDatabaseBackupRequest: {
      name: string;
    };
    CreateDatabaseBranchRequest: {
      name: string;
      ttl_seconds?: number;
    };
    CreateDatabaseRestoreRequest: {
      backup_name?: string;
      restore_to?: string;
    };
    CreateDatabaseRequest: {
      name: string;
      region: string;
      pg_version: '16' | '17' | '18';
      database_type?:
        | 'volcano-db-xs'
        | 'volcano-db-s'
        | 'volcano-db-m'
        | 'volcano-db-l'
        | 'volcano-db-xl'
        | 'volcano-db-2xl';
    };
    CreateEmailTemplateRequest: {
      template_type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      subject: string;
      html_body: string;
      text_body: string;
    };
    CreateFrontendCustomDomainRequest: {
      domain: string;
      tls: components['schemas']['FrontendCustomDomainTLSConfig'];
    };
    CreateFrontendDomainRequest: {
      domain: string;
      tls: components['schemas']['FrontendCustomDomainTLSConfig'];
      redirect?: components['schemas']['FrontendCustomDomainRedirectRequest'];
    };
    CreateFunctionSchedulerRequest: {
      name: string;
      enabled?: boolean;
      schedule: components['schemas']['ScheduleRequest'];
      payload?: {
        [key: string]: unknown;
      };
      regions?: string[];
    };
    CreateOAuthConfigRequest: {
      provider: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      client_id?: string;
      client_secret?: string;
      redirect_url?: string;
      scopes?: string[];
    };
    CreateProjectRequest: {
      name: string;
      template_id?: 'pixel-board' | 'trellini' | 'collab-pad' | 'official-starter';
      initialPrompt?: string;
      all_regions?: boolean;
      selected_regions?: string[];
    };
    CreateStorageBucketRequest: {
      name: string;
      file_size_limit?: number;
      allowed_mime_types?: string[];
    };
    CreateStoragePolicyRequest: {
      name: string;
      operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
      definition: string;
    };
    CreateUploadSessionRequest: {
      object_path: string;
      content_type: string;
      total_size: number;
      part_size?: number;
    };
    CreateUploadSessionResponse: {
      session_id?: string;
      part_size?: number;
      total_parts?: number;
      expires_at?: string;
    };
    CreateVariableRequest: {
      shared?: boolean;
      name: string;
      value: string;
    };
    VariableEnvironment: {
      id: string;
      project_id: string;
      name: string;
      is_global: boolean;
      created_at: string;
      updated_at: string;
    };
    VariableEnvironmentList: {
      data: components['schemas']['VariableEnvironment'][];
    };
    CreateVariableEnvironmentRequest: {
      name: string;
    };
    RenameVariableEnvironmentRequest: {
      name: string;
    };
    Database: {
      id: string;
      project_id: string;
      name: string;
      status: 'provisioning' | 'active' | 'failed' | 'restoring' | 'deleting';
      provisioning_started_at?: string;
      connection_string?: string;
      region?: string;
      pg_version?: string;
      database_type?:
        | 'volcano-db-xs'
        | 'volcano-db-s'
        | 'volcano-db-m'
        | 'volcano-db-l'
        | 'volcano-db-xl'
        | 'volcano-db-2xl';
      storage_bytes?: number;
      last_invoked_at?: string;
      created_at: string;
      updated_at: string;
    };
    DatabaseBackup: {
      name: string;
      source: 'manual' | 'scheduled';
      size_bytes?: number;
      expires_at?: string;
      created_at: string;
    };
    DatabaseBackupList: {
      data: components['schemas']['DatabaseBackup'][];
      restore_window?: components['schemas']['DatabaseRestoreWindow'];
    };
    DatabaseBackupSchedule: {
      entries: components['schemas']['DatabaseBackupScheduleEntry'][];
    };
    DatabaseBackupScheduleEntry: {
      frequency: 'daily' | 'weekly' | 'monthly';
      hour: number;
      day?: number;
      retention_seconds?: number;
    };
    DatabaseBranch: {
      id: string;
      database_id: string;
      project_id: string;
      name: string;
      status: 'provisioning' | 'active' | 'failed' | 'deleting';
      connection_string?: string;
      ttl_seconds: number;
      expires_at: string;
      storage_bytes?: number;
      last_invoked_at?: string;
      created_at: string;
      updated_at: string;
    };
    DatabaseBranchList: {
      data: components['schemas']['DatabaseBranch'][];
    };
    DatabaseBranchStorage: {
      id: string;
      name: string;
      storage_bytes: number;
    };
    DatabaseSelectRequest: {
      table: string;
      select?: string[];
      filters?: components['schemas']['DatabaseQueryFilter'][];
      order?: components['schemas']['DatabaseQueryOrder'][];
      limit?: number;
      offset?: number;
    };
    DatabaseInsertRequest: {
      table: string;
      values: {
        [key: string]: unknown;
      };
    };
    DatabaseUpdateRequest: {
      table: string;
      values: {
        [key: string]: unknown;
      };
      filters: components['schemas']['DatabaseQueryFilter'][];
    };
    DatabaseDeleteRequest: {
      table: string;
      filters: components['schemas']['DatabaseQueryFilter'][];
    };
    DatabaseQueryResult: {
      data?: {
        [key: string]: unknown;
      }[];
      count?: number;
    };
    DatabaseRestore: {
      id: string;
      database_id: string;
      project_id: string;
      kind: 'snapshot' | 'point_in_time';
      status: 'pending' | 'running' | 'completed' | 'failed' | 'exhausted';
      backup_name?: string;
      restore_to?: string;
      error?: string;
      completed_at?: string;
      created_at: string;
      updated_at: string;
    };
    DatabaseRestoreList: {
      data: components['schemas']['DatabaseRestore'][];
    };
    DatabaseRestoreWindow: {
      earliest_restore_at?: string;
      latest_restore_at?: string;
    };
    DatabaseStats: {
      current_storage_bytes: number;
      current_storage_mb: number;
      branches?: components['schemas']['DatabaseBranchStorage'][];
      backup_storage_bytes: number;
      storage_bytes: number;
      data_written_bytes: number;
      data_transfer_bytes: number;
      compute_time_seconds: number;
      active_time_seconds: number;
      time_range?: string;
      granularity?: 'hourly' | 'daily' | 'monthly';
    };
    DatabaseQueryPerformanceResponse: {
      data: components['schemas']['DatabaseQueryPerformanceItem'][];
    };
    UpdateDatabaseBranchRequest: {
      ttl_seconds: number;
    };
    DeviceAuthorizationResponse: {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };
    DefaultEmailTemplate: {
      type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      subject: string;
      html_body: string;
      text_body: string;
    };
    EmailTemplate: {
      id?: string;
      project_id?: string;
      template_type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      subject: string;
      html_body: string;
      text_body: string;
      created_at?: string;
      updated_at?: string;
    };
    Error: {
      error: string;
      code?: string;
    };
    ImportProvider: 'vercel';
    ImportConnectStartResponse: {
      authorization_url: string;
    };
    ImportConnection: {
      id: string;
      provider: components['schemas']['ImportProvider'];
      account_id: string;
      account_name: string;
      configuration_id: string;
      granted_scopes: string[];
      status: string;
      expires_at?: string | null;
      last_authenticated_at: string;
      created_at: string;
      updated_at: string;
    };
    ImportConnectionsResponse: {
      connections: components['schemas']['ImportConnection'][];
    };
    ImportSource: {
      id: string;
      name: string;
      account_id: string;
      framework: string;
    };
    ImportSourcesResponse: {
      sources: components['schemas']['ImportSource'][];
    };
    ProjectImportTarget: 'production';
    ProjectImportDestinationMode: 'create';
    ProjectImportDisposition: 'automatic' | 'manual' | 'deferred' | 'unsupported';
    ProjectImportImpact: 'none' | 'warning' | 'blocking';
    ProjectImportReadiness: 'importable' | 'needs_input' | 'blocked';
    ProjectImportActionCode: 'project.create' | 'git.connect' | 'frontend.configure' | 'variable.set';
    ProjectImportResourceKind: 'project' | 'git_repository' | 'frontend' | 'variable' | 'domain';
    ProjectImportPreflightRequest: {
      connection_id: string;
      source_id: string;
      project_name: string;
      target: components['schemas']['ProjectImportTarget'];
      confirm_environment_variable_read?: boolean;
    };
    ProjectImportStartRequest: {
      connection_id: string;
      source_id: string;
      project_name: string;
      target: components['schemas']['ProjectImportTarget'];
      confirm_environment_variable_read: true;
      preflight_fingerprint: string;
    };
    ProjectImportRunStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'superseded';
    ProjectImportRun: {
      id: string;
      provider: components['schemas']['ImportProvider'];
      source_id: string;
      destination_project_name: string;
      resource: components['schemas']['ResourceReference'];
      deployment: components['schemas']['DeploymentReference'];
      status: components['schemas']['ProjectImportRunStatus'];
      error_code?: string;
      error_message?: string;
      created_at: string;
      updated_at: string;
    };
    ProjectImportDestination: {
      mode: components['schemas']['ProjectImportDestinationMode'];
      project_name: string;
      target: components['schemas']['ProjectImportTarget'];
    };
    ProjectImportResource: {
      kind: components['schemas']['ProjectImportResourceKind'];
      name: string;
      source_id?: string;
      scope?: string;
    };
    ProjectImportAction: {
      code: components['schemas']['ProjectImportActionCode'];
      resource: components['schemas']['ProjectImportResource'];
      disposition: components['schemas']['ProjectImportDisposition'];
    };
    ProjectImportFinding: {
      code: string;
      resource: components['schemas']['ProjectImportResource'];
      disposition: components['schemas']['ProjectImportDisposition'];
      impact: components['schemas']['ProjectImportImpact'];
      message: string;
      remediation: string;
    };
    ProjectImportSummary: {
      automatic: number;
      manual: number;
      deferred: number;
      unsupported: number;
      warnings: number;
      blocking: number;
    };
    ProjectImportReport: {
      schema_version: string;
      provider: components['schemas']['ImportProvider'];
      source: components['schemas']['ImportSource'];
      destination: components['schemas']['ProjectImportDestination'];
      actions: components['schemas']['ProjectImportAction'][];
      findings: components['schemas']['ProjectImportFinding'][];
      summary: components['schemas']['ProjectImportSummary'];
      readiness: components['schemas']['ProjectImportReadiness'];
      source_fingerprint: string;
      capability_fingerprint: string;
      fingerprint: string;
      generated_at: string;
    };
    GitConnection: {
      id: string;
      provider: string;
      provider_user_id: string;
      provider_login: string;
      status: string;
      last_authenticated_at: string;
      created_at: string;
      updated_at: string;
    };
    GitConnectStartResponse: {
      authorization_url: string;
    };
    VerifiedDomain: {
      domain: string;
      verified_at: string;
    };
    VerifiedDomainsResponse: {
      domains: components['schemas']['VerifiedDomain'][];
    };
    VerifyDomainRequest: {
      domain: string;
    };
    GitConnectionsResponse: {
      connections: components['schemas']['GitConnection'][];
    };
    GitInstallation: {
      id: number;
      account_login: string;
      account_type: string;
      repository_selection: string;
    };
    GitInstallationsResponse: {
      installations: components['schemas']['GitInstallation'][];
    };
    GitRepository: {
      id: number;
      full_name: string;
      default_branch: string;
      private: boolean;
      is_empty: boolean;
    };
    GitRepositoriesResponse: {
      repositories: components['schemas']['GitRepository'][];
    };
    ProjectGitConnection: {
      repo_installation_id: number;
      repo_id: number;
      repo_full_name: string;
      root_directory: string;
      production_branch: string;
      updated_at: string;
    };
    ProjectGitDeploySettings: {
      auto_deploy_enabled: boolean;
      deploy_functions: boolean;
      frontend_name?: string;
      frontend_app_root?: string;
      updated_at: string;
    };
    UpdateProjectGitDeploySettingsRequest: {
      auto_deploy_enabled: boolean;
      deploy_functions: boolean;
      frontend_name?: string;
      frontend_app_root?: string;
    };
    ProjectLockLeaseRequest: {
      ttl_seconds: number;
    };
    ProjectLockLease: {
      expires_at: string;
      fencing_token: number;
    };
    ProjectLockState: {
      held: boolean;
      expires_at?: string;
      fencing_token?: number;
    };
    ProjectSourceExportState: {
      mode: 'platform' | 'git_exporting' | 'git_pending' | 'git';
      transition_started_at: string | null;
      exported_at: string | null;
      handed_over_at: string | null;
    };
    ProjectSourceExport: {
      repo_full_name: string;
      branch: string;
      commit_sha: string;
      file_count: number;
      skipped: components['schemas']['ProjectSourceExportSkip'][];
      omitted: components['schemas']['ProjectSourceExportOmission'][];
    };
    ExportProjectSourceRequest: {
      production_branch: string;
    };
    ProjectSourceExportSkip: {
      kind: string;
      name: string;
      reason: string;
    };
    ProjectSourceExportOmission: {
      kind: string;
      resource: string;
      path: string;
    };
    SetProjectGitProductionBranchRequest: {
      production_branch: string;
    };
    SetProjectGitRootDirectoryRequest: {
      root_directory: string;
    };
    ConnectProjectGitRequest: {
      connection_id: string;
      installation_id: number;
      repository_id?: number;
      repo_full_name?: string;
      root_directory?: string;
      production_branch?: string;
    };
    Frontend: {
      variable_scope?: 'all' | 'shared' | 'scoped';
      declared_variables?: string[];
      id: string;
      project_id: string;
      name: string;
      framework: 'nextjs';
      app_root?: string;
      status: 'provisioning' | 'active' | 'degraded' | 'failed' | 'deleting';
      provisioning_started_at?: string;
      deployed_regions: string[];
      current_deployment_id?: string;
      pending_deployment_id?: string;
      site_url?: string;
      custom_domain?: string;
      custom_domain_status?: 'pending_verification' | 'provisioning' | 'active' | 'detaching' | 'failed' | 'deleted';
      function_routes: components['schemas']['FrontendFunctionRoute'][];
      frontend_routes: components['schemas']['FrontendRoute'][];
      last_deployed_at?: string;
      last_invoked_at?: string;
      created_at: string;
      updated_at: string;
    };
    FrontendFunctionRoute: {
      id: string;
      project_id: string;
      frontend_id: string;
      function_id: string;
      path_prefix: string;
      strip_prefix: boolean;
      created_at: string;
      updated_at: string;
    };
    FrontendFunctionRouteList: {
      data: components['schemas']['FrontendFunctionRoute'][];
    };
    CreateFrontendFunctionRouteRequest: {
      function_id: string;
      path_prefix: string;
      strip_prefix?: boolean;
    };
    FrontendRoute: {
      id: string;
      project_id: string;
      frontend_id: string;
      target_frontend_id: string;
      path_prefix: string;
      created_at: string;
      updated_at: string;
    };
    FrontendRouteList: {
      data: components['schemas']['FrontendRoute'][];
    };
    CreateFrontendRouteRequest: {
      target_frontend_id: string;
      path_prefix: string;
    };
    CreateFrontendDeploymentRequest: {
      source_deployment_id: string;
    };
    FrontendCustomDomainTLSConfig: {
      mode: 'managed' | 'byoc';
      certificate_pem?: string;
      private_key_pem?: string;
      certificate_chain_pem?: string;
    };
    FrontendCustomDomainResponse: {
      domain: string;
      tls_mode: 'managed' | 'byoc';
      domain_status: 'pending_verification' | 'provisioning' | 'active' | 'detaching' | 'failed' | 'deleted';
      verification_status: 'pending' | 'verified' | 'failed';
      serving_certificate?: 'uploaded' | 'managed';
      failure_reason?: string;
      verification_records?: components['schemas']['FrontendDomainVerificationRecord'][];
      required_routing_record?: components['schemas']['FrontendDomainRoutingRecord'];
      routing_target_hostname?: string;
      effective_urls: string[];
      redirect: components['schemas']['FrontendCustomDomainRedirect'] | null;
      created_at: string;
      updated_at: string;
    };
    FrontendCustomDomainList: {
      data: components['schemas']['FrontendCustomDomainResponse'][];
    };
    FrontendCustomDomainRedirect: {
      to: string;
      status: 301 | 302 | 307 | 308;
    };
    FrontendCustomDomainRedirectRequest: {
      to: string;
      status?: 301 | 302 | 307 | 308;
    };
    UpdateFrontendCustomDomainRequest: {
      redirect: components['schemas']['FrontendCustomDomainRedirectRequest'] | null;
    };
    FrontendDeployment: {
      id: string;
      frontend_id: string;
      project_id: string;
      operation: 'deploy' | 'redeploy' | 'delete';
      status: 'queued' | 'provisioning' | 'active' | 'degraded' | 'failed' | 'superseded' | 'deleting' | 'deleted';
      deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
      initiated_by?: string;
      source_deployment_id?: string;
      site_url?: string;
      build_duration_seconds?: number;
      build_count?: number;
      build_duration_recorded_at?: string;
      progress?: components['schemas']['DeploymentProgress'];
      error_message?: string;
      created_at: string;
      updated_at: string;
    };
    FrontendDomainRoutingRecord: {
      record_type: 'CNAME';
      name: string;
      value: string;
    };
    FrontendDomainVerificationRecord: {
      name: string;
      type: string;
      value: string;
    };
    FrontendCustomDomainConflictError: components['schemas']['Error'] & {
      required_record?: components['schemas']['FrontendDomainVerificationRecord'];
    };
    FrontendUsageDailyEntry: {
      day: string;
      requests: number;
      errors: number;
      page_views: number;
    };
    FrontendUsageData: {
      frontend_id: string;
      frontend_name?: string | null;
      requests: number;
    };
    FrontendUsageHistoryResponse: {
      frontend_id: string;
      days: number;
      daily: components['schemas']['FrontendUsageDailyEntry'][];
      total_requests: number;
      total_errors: number;
      total_page_views: number;
    };
    ProjectAccessToken: {
      id: string;
      project_id: string;
      name: string;
      token_prefix: string;
      scope: components['schemas']['ProjectAccessTokenScope'];
      status: 'active' | 'revoked' | 'expired';
      token_source: 'api' | 'cli' | 'dashboard';
      expires_at?: string | null;
      last_used_at?: string | null;
      created_at: string;
      all_time_requests: number;
    };
    ProjectAccessTokenScope: 'full' | 'read_only';
    CreateProjectAccessTokenRequest: {
      name: string;
      scope: components['schemas']['ProjectAccessTokenScope'];
      expires_at?: string;
    };
    CreatedProjectAccessToken: components['schemas']['ProjectAccessToken'] & {
      token: string;
    };
    PaginatedProjectAccessTokens: {
      data: components['schemas']['ProjectAccessToken'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
    };
    ProjectAccessTokenUsage: {
      token_id: string;
      name: string;
      token_prefix: string;
      days: number;
      daily: components['schemas']['ProjectAccessTokenUsageDailyEntry'][];
      total_requests: number;
    };
    ProjectAccessTokenUsageDailyEntry: {
      day: string;
      requests: number;
    };
    Function: {
      id: string;
      project_id: string;
      name: string;
      status: 'provisioning' | 'active' | 'failed' | 'deleting';
      provisioning_started_at?: string;
      visibility: components['schemas']['FunctionVisibility'];
      is_public: boolean;
      invocation_mode: components['schemas']['FunctionInvocationMode'];
      http_auth_mode: components['schemas']['FunctionHTTPAuthMode'];
      openapi_spec: {
        [key: string]: unknown;
      } | null;
      has_openapi_spec: boolean;
      invoke_url?: string;
      deployed_regions: string[];
      runtime?: string;
      handler?: string;
      current_deployment_id?: string;
      pending_deployment_id?: string;
      last_invoked_at?: string;
      created_at: string;
      updated_at: string;
    };
    DurableFunction: {
      id: string;
      project_id: string;
      name: string;
      status: 'provisioning' | 'active' | 'failed' | 'deleting';
      provisioning_started_at?: string;
      visibility: components['schemas']['FunctionVisibility'];
      is_public: boolean;
      durable: components['schemas']['DurableFunctionConfig'];
      deployed_regions: string[];
      runtime?: string;
      handler?: string;
      current_deployment_id?: string;
      pending_deployment_id?: string;
      last_invoked_at?: string;
      created_at: string;
      updated_at: string;
    };
    DurableFunctionConfig: {
      execution_timeout_seconds: number;
      retention_days: number;
    };
    DurableExecution: {
      id: string;
      function_id: string;
      name: string;
      status: components['schemas']['DurableExecutionStatus'];
      region: string;
      result?: unknown;
      result_expired?: boolean;
      error?: components['schemas']['DurableExecutionError'];
      created_at: string;
      completed_at?: string;
      client_token?: string;
    };
    DurableExecutionStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'stopped' | 'unknown';
    DurableExecutionError: {
      type?: string;
      message?: string;
    };
    DurableExecutionOperationList: {
      data: components['schemas']['DurableExecutionOperation'][];
      invocations: components['schemas']['DurableExecutionInvocation'][];
      complete: boolean;
      synced_at?: string;
    };
    DurableExecutionOperation: {
      id: string;
      parent_id?: string;
      name?: string;
      type: 'execution' | 'step' | 'wait' | 'callback' | 'context' | 'chained_invoke';
      kind:
        | 'execution'
        | 'step'
        | 'wait'
        | 'wait_until'
        | 'callback'
        | 'child'
        | 'map'
        | 'map_item'
        | 'parallel'
        | 'parallel_branch'
        | 'invoke';
      status:
        | 'running'
        | 'waiting'
        | 'retrying'
        | 'succeeded'
        | 'failed'
        | 'cancelled'
        | 'timed_out'
        | 'stopped'
        | 'unknown';
      started_at: string;
      ended_at?: string;
      scheduled_end_at?: string;
      next_attempt_at?: string;
      attempts?: components['schemas']['DurableExecutionOperationAttempt'][];
      error?: components['schemas']['DurableExecutionError'];
    };
    DurableExecutionOperationAttempt: {
      attempt: number;
      status: 'running' | 'succeeded' | 'failed';
      started_at: string;
      ended_at?: string;
      error?: components['schemas']['DurableExecutionError'];
    };
    DurableExecutionInvocation: {
      started_at: string;
      ended_at: string;
    };
    FunctionInvocationMode: 'rpc' | 'http';
    FunctionHTTPAuthMode: 'volcano' | 'none';
    FunctionVisibility: 'private' | 'authenticated' | 'public';
    FunctionDeployment: {
      id: string;
      function_id: string;
      project_id: string;
      batch_id?: string;
      operation: 'deploy' | 'update' | 'delete';
      status: 'queued' | 'provisioning' | 'active' | 'failed' | 'superseded' | 'deleting' | 'deleted';
      deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
      initiated_by?: string;
      build_duration_seconds?: number;
      build_count?: number;
      build_duration_recorded_at?: string;
      progress?: components['schemas']['DeploymentProgress'];
      error_message?: string;
      completed_at?: string;
      created_at: string;
      updated_at: string;
    };
    FunctionInvocationRequest: {
      payload?: {
        [key: string]: unknown;
      };
    };
    FunctionInvocationResponse: {
      [key: string]: unknown;
    };
    LogActivityBucket: {
      start_time: string;
      end_time: string;
      counts: {
        levels: {
          [key: string]: number;
        };
        regions: {
          [key: string]: number;
        };
        resource_ids: {
          [key: string]: number;
        };
      };
      total: number;
    };
    LogActivityRequest: {
      resource: components['schemas']['LogRequestResource'];
      q?: string;
      start_time?: string;
      end_time?: string;
      bucket_count?: number;
    };
    LogActivityResponse: {
      data: components['schemas']['LogActivityBucket'][];
      total: number;
    };
    LogSearchRequest: {
      resource: components['schemas']['LogRequestResource'];
      q?: string;
      start_time?: string;
      end_time?: string;
      limit?: number;
      cursor?: string;
    };
    LogStreamRequest: {
      resource: components['schemas']['LogRequestResource'];
      q?: string;
      start_time?: string;
      limit?: number;
    };
    LogSearchEvent: components['schemas']['LogEvent'] & {
      id: string;
      resource: components['schemas']['LogResource'];
    };
    LogSearchResponse: {
      data: components['schemas']['LogSearchEvent'][];
      limit: number;
      has_more: boolean;
      next_cursor?: string;
    };
    FunctionRegion: {
      code: string;
      label: string;
      flag: string;
    };
    FunctionRuntimeOption: {
      name: string;
      label: string;
      language: string;
      default: boolean;
      durable_capable: boolean;
      deployment: components['schemas']['FunctionRuntimeDeployment'];
    };
    FunctionRuntimesResponse: {
      runtimes: components['schemas']['FunctionRuntimeOption'][];
    };
    FunctionKindFilter: 'standard' | 'durable';
    FunctionScheduler: {
      id?: string;
      project_id?: string;
      function_id?: string;
      function_kind?: components['schemas']['FunctionKind'];
      name?: string;
      enabled?: boolean;
      schedule_kind?: 'cron';
      cron_expression?: string;
      payload?: {
        [key: string]: unknown;
      };
      regions?: string[];
      regions_explicit?: boolean;
      next_run_at?: string;
      last_started_at?: string;
      last_completed_at?: string;
      last_error?: string;
      run_count?: number;
      health?: 'healthy' | 'failing';
      consecutive_failures?: number;
      last_run_status?: 'succeeded' | 'failed';
      last_success_at?: string;
      last_failure_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    FunctionSchedulerListResponse: {
      data: components['schemas']['FunctionScheduler'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next_cursor?: string;
      prev_cursor?: string;
    };
    HostedAuthPageType: 'login' | 'signup' | 'forgot-password' | 'device' | 'verify-email' | 'reset-password';
    HostedLoginEmailCheckRequest: {
      email: string;
    };
    HostedLoginEmailCheckResponse: {
      exists?: boolean;
    };
    HostedLoginOptionsResponse: {
      require_email_confirmation?: boolean;
      email_password_enabled?: boolean;
      enable_signup?: boolean;
      post_auth_redirect_url?: string;
      oauth_providers?: string[];
    };
    HostedRenderablePageType: 'signup' | 'forgot-password' | 'device' | 'verify-email' | 'reset-password';
    LogEvent: {
      id?: string;
      timestamp: string;
      level?: components['schemas']['LiveLogLevel'];
      body:
        | (
            | string
            | {
                [key: string]: unknown;
              }
            | unknown[]
            | number
            | boolean
          )
        | null;
      region?: string;
      resource?: components['schemas']['LogResource'];
      deployment?: components['schemas']['LogDeployment'];
      invocation_id?: string;
    };
    LiveLogLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    MetricUsageData: {
      metric: string;
      total: number;
      all_time: number;
      daily: components['schemas']['UsageDataPoint'][];
      hourly: components['schemas']['UsageDataPoint'][];
    };
    OAuthConfig: {
      id?: string;
      provider?: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      client_id?: string;
      client_secret?: string;
      enabled?: boolean;
      redirect_url?: string;
      scopes?: string[];
      created_at?: string;
      updated_at?: string;
    };
    OAuthErrorResponse: {
      error: string;
      error_description?: string;
    };
    PaginatedAuthUsers: {
      data: components['schemas']['AuthUser'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
    };
    PaginatedDatabases: {
      data: components['schemas']['Database'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedFrontendDeployments: {
      data: components['schemas']['FrontendDeployment'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
    };
    PaginatedFrontends: {
      data: components['schemas']['Frontend'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedFunctionDeployments: {
      data: components['schemas']['FunctionDeployment'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
    };
    PaginatedFunctions: {
      data: components['schemas']['Function'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedDurableFunctions: {
      data: components['schemas']['DurableFunction'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
    };
    PaginatedDurableExecutions: {
      data: components['schemas']['DurableExecution'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
    };
    DurableApproval: {
      id: string;
      status: components['schemas']['DurableApprovalStatus'];
      name: string;
      title: string;
      description: string;
      details?: unknown;
      function: components['schemas']['DurableApprovalFunction'];
      execution: components['schemas']['DurableApprovalExecution'];
      requested_at: string;
      expires_at: string | null;
      decision: components['schemas']['DurableApprovalDecision'];
    };
    DurableApprovalStatus: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
    DurableApprovalRegistration: {
      id: string;
      status: components['schemas']['DurableApprovalStatus'];
      expires_at: string | null;
    };
    DurableApprovalStats: {
      from: string;
      to: string;
      counts: components['schemas']['DurableApprovalCounts'];
      approval_rate: number | null;
      median_seconds_to_decision: number | null;
      p90_seconds_to_decision: number | null;
      functions: components['schemas']['DurableApprovalFunctionCounts'][];
      other_functions: components['schemas']['DurableApprovalCounts'];
      daily: components['schemas']['DurableApprovalDailyCounts'][];
    };
    DurableApprovalDecisionRequest: {
      comment?: string;
    };
    RequestDurableApprovalRequest: {
      execution_ref: string;
      callback_id: string;
      name: string;
      title: string;
      description?: string;
      details?: unknown;
    };
    PaginatedDurableApprovals: {
      data: components['schemas']['DurableApproval'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
    };
    DurableMessageName: string;
    DurableMessageDirection: 'in' | 'out';
    DurableMessage: {
      id: string;
      execution_id: string;
      direction: components['schemas']['DurableMessageDirection'];
      seq: number;
      name: string;
      data: unknown;
      sender: components['schemas']['DurableMessageSender'];
      status: components['schemas']['DurableMessageStatus'];
      delivered_at: string | null;
      sent_at: string;
    };
    DurableMessageList: {
      data: components['schemas']['DurableMessage'][];
      has_more: boolean;
    };
    DurableMessageWait: {
      id: string;
      name: string;
      status: components['schemas']['DurableMessageWaitStatus'];
      expires_at: string | null;
      created_at: string;
    };
    DurableMessageWaitList: {
      data: components['schemas']['DurableMessageWait'][];
    };
    SendDurableMessageRequest: {
      name: components['schemas']['DurableMessageName'];
      data?: unknown;
    };
    RegisterDurableMessageWaitRequest: {
      execution_ref: string;
      callback_id: string;
      name: components['schemas']['DurableMessageName'];
    };
    DurableMessageWaitRegistration: {
      id: string;
      status: components['schemas']['DurableMessageWaitStatus'];
      expires_at: string | null;
    };
    OpenDurableMessageSessionRequest: {
      execution_ref: string;
      callback_id: string;
    };
    DurableMessageSessionRegistration: {
      id: string;
    };
    PublishDurableMessageRequest: {
      name: components['schemas']['DurableMessageName'];
      data?: unknown;
    };
    RegisterDurableCallbackRequest: {
      execution_ref: string;
      callback_id: string;
      name: string;
      operation_id?: string;
    };
    DurableCallbackRegistration: {
      token: components['schemas']['DurableCallbackToken'];
      expires_at: string | null;
    };
    SucceedDurableCallbackRequest: {
      token: components['schemas']['DurableCallbackToken'];
      result: unknown;
    };
    FailDurableCallbackRequest: {
      token: components['schemas']['DurableCallbackToken'];
      error: components['schemas']['DurableCallbackError'];
    };
    HeartbeatDurableCallbackRequest: {
      token: components['schemas']['DurableCallbackToken'];
    };
    DurableCallbackOutcome: {
      status: components['schemas']['DurableCallbackStatus'];
    };
    Issue: {
      id: string;
      project_id: string;
      resource: components['schemas']['ResourceReference'];
      title: string;
      error_type?: string;
      culprit?: string;
      status: components['schemas']['IssueStatus'];
      event_count: number;
      first_seen_at: string;
      last_seen_at: string;
      last_region?: string;
      sample_event_id?: string;
      sample_event_at?: string;
      resolved_at?: string;
      regressed_at?: string;
      created_at: string;
      updated_at: string;
    };
    IssueStatus: 'open' | 'resolved' | 'ignored';
    PaginatedIssues: {
      data: components['schemas']['Issue'][];
      limit: number;
      has_more: boolean;
      next_cursor?: string;
    };
    UpdateIssueRequest: {
      status: components['schemas']['IssueStatus'];
    };
    NotificationSettings: {
      project_id: string;
      email: components['schemas']['NotificationEmailSettings'];
      webhook: components['schemas']['NotificationWebhookSettings'];
      scheduler_failures: components['schemas']['SchedulerFailureAlertPolicy'];
      updated_at?: string;
    };
    UpdateNotificationSettingsRequest: {
      email?: components['schemas']['UpdateNotificationEmail'];
      webhook?: components['schemas']['UpdateNotificationWebhook'];
      scheduler_failures?: components['schemas']['UpdateSchedulerFailureAlertPolicy'];
    };
    NotificationTestResult: {
      deliveries: components['schemas']['NotificationTestDelivery'][];
    };
    AutofixSettings: {
      project_id: string;
      enabled: boolean;
      max_stage: components['schemas']['AutofixStage'];
      auto_trigger: boolean;
      plan_includes_autofix?: boolean;
      updated_at?: string;
    };
    AutofixStage: 'diagnose' | 'pull_request';
    UpdateAutofixSettingsRequest: {
      enabled: boolean;
      max_stage?: components['schemas']['AutofixStage'];
      auto_trigger?: boolean;
    };
    AutofixRunStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    AutofixRunTrigger: 'manual' | 'new_issue' | 'regression';
    AutofixEvidence: {
      kind: 'log' | 'code' | 'other';
      detail: string;
      location?: string;
    };
    AutofixDiagnosis: {
      summary: string;
      root_cause: string;
      evidence: components['schemas']['AutofixEvidence'][];
      suggested_fix: string;
      confidence: 'low' | 'medium' | 'high';
      fixable: boolean;
      files: string[];
    };
    AutofixEdit: {
      path: string;
      old_text: string;
      new_text: string;
    };
    AutofixPatch: {
      title: string;
      edits: components['schemas']['AutofixEdit'][];
    };
    AutofixPullRequestState: 'open' | 'merged' | 'closed';
    AutofixPullRequest: {
      number: number;
      url: string;
      branch: string;
      state: components['schemas']['AutofixPullRequestState'];
      closed_at?: string;
      deployed_at?: string;
    };
    AutofixPullRequestSkipped:
      | 'source_unavailable'
      | 'pull_request_open'
      | 'not_fixable'
      | 'low_confidence'
      | 'no_patch'
      | 'permission_missing'
      | 'repository_changed'
      | 'publish_failed';
    AutofixRun: {
      id: string;
      project_id: string;
      issue_id: string;
      trigger: components['schemas']['AutofixRunTrigger'];
      status: components['schemas']['AutofixRunStatus'];
      max_stage: components['schemas']['AutofixStage'];
      stage_reached?: components['schemas']['AutofixStage'];
      diagnosis?: components['schemas']['AutofixDiagnosis'];
      patch?: components['schemas']['AutofixPatch'];
      pull_request?: components['schemas']['AutofixPullRequest'];
      pull_request_skipped?: components['schemas']['AutofixPullRequestSkipped'];
      commit_sha?: string;
      failure_code?: string;
      failure_message?: string;
      created_at: string;
      started_at?: string;
      completed_at?: string;
    };
    PaginatedAutofixRuns: {
      data: components['schemas']['AutofixRun'][];
      limit: number;
      has_more: boolean;
      next_cursor?: string;
    };
    PaginatedProjectCustomDomains: {
      data: components['schemas']['ProjectFrontendCustomDomain'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
    };
    PaginatedProjectDeployments: {
      data: components['schemas']['ProjectDeployment'][];
      page?: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedProjects: {
      data: components['schemas']['Project'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
      status?: 'provisioning' | 'active' | 'failed';
      current_sync_id?: string;
      provisioning_started_at?: string;
    };
    PaginatedServiceKeys: {
      data: components['schemas']['ServiceKey'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedStorageBuckets: {
      data: components['schemas']['StorageBucket'][];
      limit: number;
      total?: number;
      has_more: boolean;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PaginatedVariables: {
      data: components['schemas']['Variable'][];
      page: number;
      limit: number;
      total: number;
      has_more: boolean;
      next?: string;
      next_cursor?: string;
      prev_cursor?: string;
    };
    PlatformExchangeResponse: {
      token: string;
      user_id: string;
      token_id: string;
      expires_at: string;
    };
    Project: {
      template_installation?: components['schemas']['ProjectTemplateInstallation'];
      id: string;
      name: string;
      status: 'active' | 'deleting' | 'failed';
      plan?: 'HOBBY' | 'SUPERAGENT';
      all_regions: boolean;
      selected_regions: string[];
      last_invoked_at?: string;
      logo_url?: string;
      git_connection?: components['schemas']['ProjectGitConnectionSummary'];
      health?: components['schemas']['ProjectHealthSummary'];
      created_at: string;
      updated_at: string;
    };
    ProjectConfig: {
      version: 1;
      project?: components['schemas']['ProjectConfigProject'];
      databases?: components['schemas']['ProjectConfigDatabase'][];
      shared_variables?: string[];
      frontend_shared_variables?: string[];
      variables?: components['schemas']['ProjectConfigVariable'][];
      buckets?: components['schemas']['ProjectConfigBucket'][];
      realtime?: components['schemas']['ProjectConfigRealtime'];
      autofix?: components['schemas']['ProjectConfigAutofix'];
      notifications?: components['schemas']['ProjectConfigNotifications'];
      auth?: components['schemas']['ProjectConfigAuth'];
      functions?: components['schemas']['ProjectConfigFunction'][];
      frontends?: components['schemas']['ProjectConfigFrontend'][];
      sandboxes?: components['schemas']['ProjectConfigSandbox'][];
    };
    ProjectConfigApplyResult: {
      dry_run?: boolean;
      results: components['schemas']['ProjectConfigApplyResultEntry'][];
      skipped: components['schemas']['ProjectConfigSkippedResource'][];
      missing: components['schemas']['ProjectConfigMissingResource'][];
      summary: components['schemas']['ProjectConfigApplySummary'];
    };
    ProjectConfigApplyResultEntry: {
      section: string;
      name?: string;
      action: 'created' | 'updated' | 'deleted' | 'unchanged' | 'error';
      error?: string;
      notice?: string;
    };
    ProjectConfigApplySummary: {
      created: number;
      updated: number;
      deleted: number;
      unchanged: number;
      errors: number;
      skipped: number;
      missing: number;
    };
    ProjectConfigAuth: {
      tokens?: components['schemas']['ProjectConfigAuthTokens'];
      sessions?: components['schemas']['ProjectConfigAuthSessions'];
      signup?: components['schemas']['ProjectConfigAuthSignup'];
      rate_limits?: components['schemas']['ProjectConfigAuthRateLimits'];
      password?: components['schemas']['ProjectConfigAuthPassword'];
      password_reset?: components['schemas']['ProjectConfigAuthPasswordReset'];
      email_verification?: components['schemas']['ProjectConfigAuthEmailVerification'];
      cors?: components['schemas']['ProjectConfigAuthCORS'];
      providers?: components['schemas']['ProjectConfigAuthProviders'];
      email?: components['schemas']['ProjectConfigAuthEmail'];
      managed_pages?: components['schemas']['ProjectConfigAuthManagedPages'];
    };
    ProjectConfigAuthCORS: {
      enabled?: boolean;
      allowed_origins?: string[];
      allow_credentials?: boolean;
      max_age?: number;
    };
    ProjectConfigAuthEmail: {
      enabled?: boolean;
      from?: components['schemas']['ProjectConfigAuthEmailFrom'];
      smtp?: components['schemas']['ProjectConfigAuthEmailSMTP'];
      templates?: components['schemas']['ProjectConfigEmailTemplates'];
    };
    ProjectConfigAuthEmailFrom: {
      address?: string;
      name?: string;
    };
    ProjectConfigAuthEmailPasswordProvider: {
      enabled?: boolean;
    };
    ProjectConfigAuthEmailSMTP: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      use_tls?: boolean;
    };
    ProjectConfigAuthEmailVerification: {
      require_confirmation?: boolean;
      confirmation_timeout?: number;
    };
    ProjectConfigAuthManagedPages: {
      enabled?: boolean;
      redirects?: components['schemas']['ProjectConfigAuthRedirects'];
      pages?: components['schemas']['ProjectConfigHostedPages'];
      appearance?: components['schemas']['ProjectConfigAuthPageAppearance'];
    };
    ProjectConfigAuthPassword: {
      min_length?: number;
      require_uppercase?: boolean;
      require_lowercase?: boolean;
      require_numbers?: boolean;
      require_special_chars?: boolean;
    };
    ProjectConfigAuthPasswordReset: {
      allow?: boolean;
      timeout?: number;
      max_history?: number;
    };
    ProjectConfigAuthProviders: {
      email_password?: components['schemas']['ProjectConfigAuthEmailPasswordProvider'];
      oauth?: components['schemas']['ProjectConfigOAuthProvider'][];
    };
    ProjectConfigAuthRateLimits: {
      signup?: number;
      signin?: number;
      token_refresh?: number;
      password_reset?: number;
    };
    ProjectConfigAuthRedirects: {
      allowed?: string[];
      post_auth?: string;
      post_logout?: string;
      device_verification?: string;
    };
    ProjectConfigAuthSessions: {
      inactivity_timeout?: number;
      max_session_duration?: number;
    };
    ProjectConfigAuthSignup: {
      enable_signup?: boolean;
      enable_anonymous_signins?: boolean;
      allowed_email_domains?: string[];
      allowed_email_domains_mode?: 'disabled' | 'signup' | 'signup_and_signin';
    };
    ProjectConfigAuthTokens: {
      access_token_lifetime?: number;
      refresh_token_lifetime?: number;
      refresh_token_reuse_interval?: number;
      platform_token_ttl?: number;
    };
    ProjectConfigBucket: {
      name: string;
      file_size_limit?: number;
      allowed_mime_types?: string[];
      policies?: components['schemas']['ProjectConfigBucketPolicy'][];
    };
    ProjectConfigBucketPolicy: {
      name: string;
      operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
      definition: string;
    };
    ProjectConfigCustomDomain: {
      domain: string;
      tls?: components['schemas']['ProjectConfigFrontendCustomDomainTLSConfig'];
    };
    ProjectConfigFrontendCustomDomain: {
      domain: string;
      tls?: components['schemas']['ProjectConfigFrontendCustomDomainTLSConfig'];
      redirect?: components['schemas']['ProjectConfigCustomDomainRedirect'];
    };
    ProjectConfigCustomDomainRedirect: {
      to: string;
      status?: 301 | 302 | 307 | 308;
    };
    ProjectConfigDatabase: {
      name: string;
      region: string;
      pg_version: '15' | '16' | '17' | '18';
      database_type?:
        | 'volcano-db-xs'
        | 'volcano-db-s'
        | 'volcano-db-m'
        | 'volcano-db-l'
        | 'volcano-db-xl'
        | 'volcano-db-2xl';
    };
    ProjectConfigEmailTemplate: {
      subject?: string;
      html_body?: string;
      text_body?: string;
    };
    ProjectConfigEmailTemplates: {
      confirmation?: components['schemas']['ProjectConfigEmailTemplate'];
      password_reset?: components['schemas']['ProjectConfigEmailTemplate'];
      password_changed?: components['schemas']['ProjectConfigEmailTemplate'];
      welcome?: components['schemas']['ProjectConfigEmailTemplate'];
    };
    ProjectConfigFrontend: {
      variable_scope?: 'all' | 'shared' | 'scoped';
      variables?: string[];
      name: string;
      custom_domain?: components['schemas']['ProjectConfigCustomDomain'] | null;
      custom_domains?: components['schemas']['ProjectConfigFrontendCustomDomain'][];
      function_routes?: components['schemas']['ProjectConfigFrontendFunctionRoute'][];
      frontend_routes?: components['schemas']['ProjectConfigFrontendRoute'][];
    };
    ProjectConfigFunction: {
      name: string;
      kind?: components['schemas']['FunctionKind'];
      visibility?: components['schemas']['FunctionVisibility'];
      public?: boolean;
      variable_scope?: 'all' | 'scoped';
      variables?: string[];
      invocation_mode?: components['schemas']['FunctionInvocationMode'];
      http_auth_mode?: components['schemas']['FunctionHTTPAuthMode'];
      openapi_spec?: {
        [key: string]: unknown;
      } | null;
      schedulers?: components['schemas']['ProjectConfigScheduler'][];
    };
    ProjectConfigHostedPage: {
      html: string;
      css?: string;
    };
    ProjectConfigHostedPages: {
      login?: components['schemas']['ProjectConfigHostedPage'];
      reset_password?: components['schemas']['ProjectConfigHostedPage'];
      signup?: components['schemas']['ProjectConfigHostedPage'];
      forgot_password?: components['schemas']['ProjectConfigHostedPage'];
      device?: components['schemas']['ProjectConfigHostedPage'];
      verify_email?: components['schemas']['ProjectConfigHostedPage'];
    };
    PreviewAuthPageRequest: {
      theme: components['schemas']['AuthPageTheme'];
      layout: components['schemas']['AuthPageLayout'];
      action?: string;
    };
    PreviewAuthPageResponse: {
      preview_url: string;
      expires_at: string;
    };
    ProjectConfigMissingResource: {
      type: 'function' | 'frontend' | 'database' | 'bucket' | 'sandbox';
      name: string;
    };
    ProjectConfigOAuthProvider: {
      provider: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      enabled?: boolean;
      client_id?: string;
      client_secret?: string;
      redirect_url?: string;
      scopes?: string[];
    };
    ProjectConfigProject: {
      name?: string;
      all_regions?: boolean;
      selected_regions?: string[];
    };
    ProjectConfigRealtime: {
      enabled?: boolean;
      broadcast_enabled?: boolean;
      presence_enabled?: boolean;
      postgres_changes_enabled?: boolean;
    };
    ProjectConfigAutofix: {
      enabled?: boolean;
      max_stage?: components['schemas']['AutofixStage'];
      auto_trigger?: boolean;
    };
    ProjectConfigScheduler: {
      name: string;
      cron: string;
      enabled?: boolean;
      payload?: {
        [key: string]: unknown;
      };
    };
    ProjectConfigSkippedResource: {
      type: 'function' | 'frontend' | 'database' | 'bucket' | 'sandbox';
      name: string;
      reason: string;
    };
    ProjectConfigValidationError: {
      section: string;
      name?: string;
      message: string;
    };
    ProjectConfigValidationErrorResponse: {
      error: string;
      errors: components['schemas']['ProjectConfigValidationError'][];
    };
    ProjectConfigVariable: {
      shared?: boolean;
      name: string;
      value: string;
    };
    ProjectHealthResource: {
      type: 'project' | 'function' | 'frontend' | 'database' | 'database_branch';
      id: string;
      name: string;
      kind?: components['schemas']['FunctionKind'];
    };
    ResourceReference: {
      type: 'project' | 'function' | 'frontend' | 'database';
      id: string;
      name: string;
    };
    DeploymentReference: {
      id: string;
    };
    ProjectHealthScope: {
      resource: components['schemas']['ProjectHealthResource'];
    };
    ProjectHealthResponse: {
      project_id: string;
      status: components['schemas']['ProjectHealthStatus'];
      observed_at: string;
      fresh_through: string;
      data_status: components['schemas']['ProjectHealthDataStatus'];
      checks: components['schemas']['ProjectHealthCheck'][];
      findings: components['schemas']['ProjectHealthCheck'][];
    };
    ProjectHealthStatus: 'empty' | 'healthy' | 'needs_attention' | 'degraded' | 'critical' | 'unknown';
    ProjectHealthDataStatus: 'complete' | 'partial' | 'no_data' | 'stale';
    ProjectHealthCategory: 'lifecycle' | 'storage';
    ProjectHealthEvidence: {
      metric: string;
      value: number;
      unit: string;
      sample_count: number;
    };
    ProjectHealthCheck: {
      id: string;
      category: components['schemas']['ProjectHealthCategory'];
      status: components['schemas']['ProjectHealthStatus'];
      reason_code: string;
      scope: components['schemas']['ProjectHealthScope'];
      evidence: components['schemas']['ProjectHealthEvidence'];
    };
    ProjectMetricsDataStatus: 'complete' | 'partial' | 'no_data';
    ProjectMetricsDimensions: {
      region?: string;
      resource_type?: 'function' | 'frontend';
    };
    ProjectMetricsGroupBy: 'region' | 'resource_type';
    ProjectMetricsMetric: 'request_count' | 'server_error_count' | 'availability' | 'p95_latency';
    ProjectMetricsQuery: {
      id: string;
      metric: components['schemas']['ProjectMetricsMetric'];
      group_by?: components['schemas']['ProjectMetricsGroupBy'];
    };
    ProjectMetricsQueryRequest: {
      time_range: components['schemas']['ProjectMetricsQueryTimeRange'];
      queries: components['schemas']['ProjectMetricsQuery'][];
    };
    ProjectMetricsQueryResponse: {
      observed_at: string;
      fresh_through?: string;
      window: components['schemas']['ProjectMetricsWindow'];
      results: components['schemas']['ProjectMetricsResult'][];
    };
    ProjectMetricsQueryTimeRange: {
      window: '30m' | '1h' | '24h' | '7d';
    };
    ProjectMetricsResult: {
      id: string;
      metric: components['schemas']['ProjectMetricsMetric'];
      unit: components['schemas']['ProjectMetricsUnit'];
      data_status: components['schemas']['ProjectMetricsDataStatus'];
      values: components['schemas']['ProjectMetricsValue'][];
    };
    ProjectMetricsUnit: 'count' | 'ratio' | 'seconds';
    ProjectMetricsValue: {
      dimensions: components['schemas']['ProjectMetricsDimensions'];
      value: number;
    };
    ProjectMetricsWindow: {
      from: string;
      to: string;
    };
    ProjectFrontendCustomDomain: components['schemas']['FrontendCustomDomainResponse'] & {
      frontend: {
        id: string;
        name: string;
      };
    };
    ProjectDeployment: {
      id: string;
      project_id: string;
      resource: components['schemas']['ProjectDeploymentResource'];
      operation: 'deploy' | 'redeploy' | 'update' | 'delete';
      status: 'queued' | 'provisioning' | 'active' | 'degraded' | 'failed' | 'superseded' | 'deleting' | 'deleted';
      deploy_source: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
      error_message?: string;
      completed_at?: string;
      progress?: components['schemas']['DeploymentProgress'];
      created_at: string;
      updated_at: string;
    };
    ProjectDeploymentResource: {
      type: 'function' | 'frontend';
      id: string;
      name: string;
      kind?: components['schemas']['FunctionKind'];
    };
    ProjectDeploymentSummary: {
      deployment_count: number;
      successful_count: number;
      failed_count: number;
      canceled_count: number;
      success_rate: number | null;
      median_build_duration_seconds: number | null;
    };
    ProjectUsageResponse: {
      project_id: string;
      month: string;
      metrics: components['schemas']['MetricUsageData'][];
      frontends?: components['schemas']['FrontendUsageData'][];
    };
    RealtimeConfig: {
      project_id?: string;
      enabled?: boolean;
      broadcast_enabled?: boolean;
      presence_enabled?: boolean;
      postgres_changes_enabled?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    RealtimePlanLimits: {
      plan?: string;
      max_connections?: number;
      messages_per_month?: number;
      message_size_kb?: number;
      channels_per_conn?: number;
    };
    RealtimeStats: {
      num_connections?: number;
      peak_connections?: number;
      last_invoked_at?: string;
      limits?: components['schemas']['RealtimePlanLimits'];
    };
    ResolveFunctionResponse: {
      name: string;
      function_id: string;
      invoke_url?: string;
      cache_ttl_seconds: number;
    };
    ScheduleRequest: {
      kind?: 'cron';
      cron_expression: string;
    };
    ServiceKey: {
      id: string;
      project_id?: string;
      name: string;
      key_value?: string;
      key_prefix: string;
      permissions: string[];
      created_at?: string;
      updated_at?: string;
    };
    StorageBucket: {
      id: string;
      project_id?: string;
      name: string;
      file_size_limit?: number | null;
      allowed_mime_types?: string[] | null;
      last_invoked_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    StorageCopyRequest: {
      from: string;
      to: string;
    };
    StorageListResponse: {
      objects?: components['schemas']['StorageObject'][];
      next_cursor?: string;
    };
    StorageMoveRequest: {
      from: string;
      to: string;
    };
    StorageObject: {
      id: string;
      bucket_id: string;
      name: string;
      owner_id?: string | null;
      is_public: boolean;
      size: number;
      mime_type: string;
      etag?: string;
      metadata?: {
        [key: string]: unknown;
      };
      created_at?: string;
      updated_at?: string;
      public_url?: string;
    };
    StorageObjectWithBucket: {
      id: string;
      bucket_id: string;
      bucket_name: string;
      name: string;
      owner_id?: string | null;
      is_public: boolean;
      size: number;
      mime_type: string;
      etag?: string;
      metadata?: {
        [key: string]: unknown;
      };
      created_at?: string;
      updated_at?: string;
      public_url?: string;
    };
    StoragePolicy: {
      id: string;
      bucket_id: string;
      name: string;
      operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
      definition: string;
      created_at?: string;
      updated_at?: string;
    };
    StorageStats: {
      bucket_count: number;
      object_count: number;
      total_size: number;
    };
    StorageVisibilityRequest: {
      is_public: boolean;
    };
    UnbanUserResponse: {
      message: string;
      user_id: string;
      email: string;
      status: 'active';
    };
    TestEmailRequest: {
      to_email: string;
      subject?: string;
      html_body?: string;
      text_body?: string;
    };
    TestEmailResponse: {
      success: boolean;
    };
    UpdateAuthConfigRequest: {
      access_token_lifetime?: number;
      refresh_token_lifetime?: number;
      refresh_token_reuse_interval?: number;
      inactivity_timeout?: number;
      max_session_duration?: number;
      platform_token_ttl?: number;
      min_password_length?: number;
      require_uppercase?: boolean;
      require_lowercase?: boolean;
      require_numbers?: boolean;
      require_special_chars?: boolean;
      enable_signup?: boolean;
      enable_email_password?: boolean;
      rate_limit_signup?: number;
      rate_limit_signin?: number;
      rate_limit_token_refresh?: number;
      rate_limit_password_reset?: number;
      cors_enabled?: boolean;
      cors_allowed_origins?: string[];
      cors_allow_credentials?: boolean;
      cors_max_age?: number;
      enable_anonymous_signins?: boolean;
      allowed_email_domains?: string[];
      allowed_email_domains_mode?: 'disabled' | 'signup' | 'signup_and_signin';
      allow_password_reset?: boolean;
      password_reset_timeout?: number;
      max_password_history?: number;
      require_email_confirmation?: boolean;
      email_confirmation_timeout?: number;
      auto_link_verified_oauth?: boolean;
      email_enabled?: boolean;
      email_from_address?: string;
      email_from_name?: string;
      smtp_host?: string;
      smtp_port?: number;
      smtp_username?: string;
      smtp_password?: string;
      smtp_use_tls?: boolean;
      email_confirmation_subject?: string;
      email_password_reset_subject?: string;
      email_password_changed_subject?: string;
      managed_auth_enabled?: boolean;
      post_auth_redirect_url?: string;
      allowed_redirect_urls?: string[];
      post_logout_redirect_url?: string;
      device_verification_url?: string;
    };
    UpdateAuthHostedPageRequest: {
      html: string;
      css?: string;
    };
    UpdateAuthPageLayoutRequest: {
      layout: components['schemas']['AuthPageLayout'];
    };
    UpdateAuthPageThemeRequest: {
      theme: components['schemas']['AuthPageTheme'];
    };
    UpdateDatabaseTypeRequest: {
      database_type:
        | 'volcano-db-xs'
        | 'volcano-db-s'
        | 'volcano-db-m'
        | 'volcano-db-l'
        | 'volcano-db-xl'
        | 'volcano-db-2xl';
    };
    UpdateEmailTemplateRequest: {
      subject?: string;
      html_body?: string;
      text_body?: string;
    };
    UpdateFunctionRequest: {
      visibility?: components['schemas']['FunctionVisibility'];
      is_public?: boolean;
      invocation_mode?: components['schemas']['FunctionInvocationMode'];
      http_auth_mode?: components['schemas']['FunctionHTTPAuthMode'];
      openapi_spec?: {
        [key: string]: unknown;
      } | null;
    };
    UpdateFunctionSchedulerRequest: {
      name?: string;
      enabled?: boolean;
      schedule?: components['schemas']['ScheduleRequest'];
      payload?: {
        [key: string]: unknown;
      };
      regions?: string[];
    };
    UpdateOAuthConfigRequest: {
      client_id?: string;
      client_secret?: string;
      redirect_url?: string;
      scopes?: string[];
      enabled?: boolean;
    };
    UpdateProjectRequest: {
      name?: string;
      all_regions?: boolean;
      selected_regions?: string[];
    };
    UpdateRealtimeConfigRequest: {
      enabled?: boolean;
      broadcast_enabled?: boolean;
      presence_enabled?: boolean;
      postgres_changes_enabled?: boolean;
    };
    UpdateStorageBucketRequest: {
      file_size_limit?: number;
      allowed_mime_types?: string[];
    };
    UpdateVariableRequest: {
      shared?: boolean;
      value: string;
    };
    UploadSessionPart: {
      part_number?: number;
      etag?: string;
      size?: number;
    };
    UploadSessionStatusResponse: {
      session_id?: string;
      status?: 'pending' | 'uploading' | 'completing' | 'completed' | 'aborted';
      path?: string;
      content_type?: string;
      total_size?: number;
      part_size?: number;
      total_parts?: number;
      parts_uploaded?: number;
      bytes_uploaded?: number;
      parts?: components['schemas']['UploadSessionPart'][];
      expires_at?: string;
      created_at?: string;
    };
    UsageDataPoint: {
      timestamp: string;
      value: number;
    };
    Variable: {
      shared?: boolean;
      frontend_shared?: boolean;
      id: string;
      project_id: string;
      name: string;
      value: string;
      status?: 'provisioning' | 'active' | 'failed';
      current_sync_id?: string;
      provisioning_started_at?: string;
      deploy_source?: 'git' | 'cli' | 'web' | 'api' | 'system' | 'unknown';
      created_at: string;
      updated_at: string;
    };
    OpenAPISpecDocument: {
      [key: string]: unknown;
    };
    ProjectTemplateInstallation: {
      status: 'pending' | 'running' | 'ready' | 'failed';
      phase: 'database' | 'restore' | 'configure' | 'deploy' | 'verify' | 'ready';
    };
    ProjectGitConnectionSummary: {
      repo_installation_id: number;
      repo_id: number;
      repo_full_name: string;
      root_directory: string;
      production_branch: string;
      updated_at: string;
    };
    ProjectHealthSummary: {
      status: components['schemas']['ProjectHealthStatus'];
    };
    FunctionKind: 'standard' | 'durable';
    UpdateNotificationEmail: {
      enabled?: boolean;
      recipients?: string[];
    };
    UpdateNotificationWebhook: {
      url?: string;
    };
    SchedulerFailureNotifyOn: 'first_failure' | 'consecutive_failures';
    UpdateSchedulerFailureAlertPolicy: {
      notify_on?: components['schemas']['SchedulerFailureNotifyOn'];
      threshold?: number;
      notify_on_recovery?: boolean;
    };
    ProjectConfigNotifications: {
      email?: components['schemas']['UpdateNotificationEmail'];
      webhook?: components['schemas']['UpdateNotificationWebhook'];
      scheduler_failures?: components['schemas']['UpdateSchedulerFailureAlertPolicy'];
    };
    AuthPageThemeColors: {
      background: string;
      surface: string;
      text: string;
      accent: string;
      accent_text: string;
    };
    ProjectConfigAuthPageLayouts: {
      login?: components['schemas']['AuthPageLayout'];
      signup?: components['schemas']['AuthPageLayout'];
      forgot_password?: components['schemas']['AuthPageLayout'];
      device?: components['schemas']['AuthPageLayout'];
      verify_email?: components['schemas']['AuthPageLayout'];
      reset_password?: components['schemas']['AuthPageLayout'];
    };
    ProjectConfigAuthPageAppearance: {
      theme?: components['schemas']['AuthPageTheme'];
      layouts?: components['schemas']['ProjectConfigAuthPageLayouts'];
    };
    ManagedProjectConfigFrontendCustomDomainTLSConfig: {
      mode: 'managed';
    };
    BYOCProjectConfigFrontendCustomDomainTLSConfig: {
      mode?: 'byoc';
      certificate_pem?: string;
      private_key_pem?: string;
      certificate_chain_pem?: string;
    };
    ProjectConfigFrontendCustomDomainTLSConfig:
      | components['schemas']['ManagedProjectConfigFrontendCustomDomainTLSConfig']
      | components['schemas']['BYOCProjectConfigFrontendCustomDomainTLSConfig'];
    ProjectConfigFrontendFunctionRoute: {
      function: string;
      path_prefix: string;
      strip_prefix?: boolean;
    };
    ProjectConfigFrontendRoute: {
      frontend: string;
      path_prefix: string;
    };
    ProjectConfigSandbox: {
      name: string;
      memory_mb?: 1024 | 2048;
      ports?: number[];
      ttl_seconds?: number;
    };
    DatabaseQueryPerformanceDatabase: {
      id: string;
      name: string;
    };
    DatabaseQueryPerformanceItem: {
      query_id: string;
      query: string;
      database: components['schemas']['DatabaseQueryPerformanceDatabase'];
      role: string;
      calls: number;
      total_exec_time_seconds: number;
      max_exec_time_seconds: number;
      mean_exec_time_seconds: number;
      min_exec_time_seconds: number;
      rows_processed: number;
    };
    DeploymentPhase: {
      name: 'queue' | 'checkout' | 'build' | 'image' | 'provisioning' | 'rollout' | 'verification';
      status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped';
      started_at?: string;
      completed_at?: string;
      duration_seconds?: number;
    };
    DeploymentProgress: {
      current_phase?: 'queue' | 'checkout' | 'build' | 'image' | 'provisioning' | 'rollout' | 'verification';
      started_at: string;
      completed_at?: string;
      elapsed_seconds: number;
      phases: components['schemas']['DeploymentPhase'][];
      updated_at: string;
    };
    DurableMessageSender: {
      type: 'service_key' | 'user' | 'anon' | 'project' | 'execution';
      user_id: string | null;
    };
    DurableMessageStatus: 'queued' | 'delivering' | 'delivered' | 'dropped' | 'published';
    LogDeploymentRequestSelector: {
      ids?: string[];
    };
    LogFunctionRequestResource: {
      type: 'function';
      ids?: string[];
      kind?: components['schemas']['FunctionKindFilter'];
      deployments?: components['schemas']['LogDeploymentRequestSelector'];
    };
    LogFrontendRequestResource: {
      type: 'frontend';
      ids?: string[];
      deployments?: components['schemas']['LogDeploymentRequestSelector'];
    };
    LogDatabaseRequestResource: {
      type: 'database';
      ids?: string[];
    };
    LogRequestResource:
      | components['schemas']['LogFunctionRequestResource']
      | components['schemas']['LogFrontendRequestResource']
      | components['schemas']['LogDatabaseRequestResource'];
    LogResource: {
      type: 'function' | 'frontend' | 'database';
      id: string;
      name?: string;
    };
    LogDeployment: {
      id: string;
      stage?: 'compile' | 'publish';
    };
    NotificationEmailStatus: 'delivering' | 'disabled' | 'owner_email_unverified';
    NotificationEmailSettings: {
      enabled: boolean;
      recipients: string[];
      status: components['schemas']['NotificationEmailStatus'];
    };
    NotificationWebhookSettings: {
      url?: string;
      secret_configured: boolean;
      secret?: string;
    };
    SchedulerFailureAlertPolicy: {
      notify_on: components['schemas']['SchedulerFailureNotifyOn'];
      threshold: number;
      notify_on_recovery: boolean;
    };
    NotificationTestDelivery: {
      channel: 'email' | 'webhook';
      delivered: boolean;
      status_code?: number;
      error?: string;
    };
    DurableMessageWaitStatus: 'waiting' | 'matched' | 'delivered' | 'expired' | 'cancelled';
    DurableCallbackToken: string;
    DurableCallbackStatus: 'waiting' | 'delivering' | 'succeeded' | 'failed';
    DurableCallbackError: {
      type: string;
      message?: string;
    };
    DurableApprovalFunction: {
      id: string | null;
      name: string;
    };
    DurableApprovalExecution: {
      id: string | null;
      name: string;
      status: components['schemas']['DurableExecutionStatus'] | null;
    };
    DurableApprovalDecider: {
      id: string;
      email: string;
    } | null;
    DurableApprovalDecision: {
      comment: string;
      decided_by: components['schemas']['DurableApprovalDecider'];
      decided_at: string;
    } | null;
    DurableApprovalCounts: {
      requested: number;
      pending: number;
      approved: number;
      denied: number;
      expired: number;
      cancelled: number;
    };
    DurableApprovalFunctionCounts: {
      function: components['schemas']['DurableApprovalFunction'];
      counts: components['schemas']['DurableApprovalCounts'];
    };
    DurableApprovalDailyCounts: {
      date: string;
      counts: components['schemas']['DurableApprovalCounts'];
    };
    DatabaseQueryFilter: {
      column: string;
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in';
      value: (string | null) | number | boolean | (string | number | boolean)[];
    };
    DatabaseQueryOrder: {
      column: string;
      ascending?: boolean;
      nulls_first?: boolean;
    };
    FunctionRuntimeDeployment: {
      file_extensions: string[];
      entrypoint: string;
      handler: string;
      dependency_manifests: string[];
    };
    AuthHostedPageDefaults: {
      html: string;
      css: string;
    };
    AuthHostedPageRuntime: {
      root_id: string;
      script: string;
      mock_prelude: string;
    };
    AuthPageAppearanceDefaults: {
      theme: components['schemas']['AuthPageTheme'];
      layout: components['schemas']['AuthPageLayout'];
    };
    AuthPageAppearanceOptions: {
      pages: components['schemas']['HostedAuthPageType'][];
      fonts: components['schemas']['AuthPageFont'][];
      scales: components['schemas']['AuthPageScale'][];
      densities: components['schemas']['AuthPageDensity'][];
      radii: components['schemas']['AuthPageRadius'][];
      layouts: components['schemas']['AuthPageLayout'][];
    };
  };
  responses: {
    StorageRangeNotSatisfiable: {
      headers: {
        'Content-Range'?: string;
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    OpenAPISpecThrottled: {
      headers: {
        'Retry-After'?: number;
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    BandwidthCapExceeded: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    DatabaseQueryCapExceeded: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    DatabaseBranchQueryUnavailable: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    OpenAPISpecNotModified: {
      headers: {
        ETag: components['headers']['ETag'];
        [name: string]: unknown;
      };
      content?: never;
    };
    OpenAPISpecHeaders: {
      headers: {
        ETag: components['headers']['ETag'];
        [name: string]: unknown;
      };
      content?: never;
    };
  };
  parameters: {
    AuthProxyAuthorization: string;
    AuthProxyClientIP: string;
    BackupName: string;
    BranchName: string;
    BucketName: string;
    Cursor: string;
    EndingBefore: string;
    DatabaseName: string;
    DeploymentId: string;
    VariableEnvironmentId: string;
    FrontendId: string;
    FrontendFunctionRouteId: string;
    FrontendRouteId: string;
    FrontendCustomDomainHostname: string;
    FunctionId: string;
    DurableFunctionId: string;
    DurableExecutionId: string;
    DurableApprovalId: string;
    IssueId: string;
    IssueCursor: string;
    AutofixRunId: string;
    DurableApprovalFunctionFilter: string;
    DurableMessageIdempotencyKey: string;
    DurableClientToken: string;
    DurableMessageDirectionFilter: components['schemas']['DurableMessageDirection'];
    DurableMessageNameFilter: components['schemas']['DurableMessageName'];
    DurableMessageAfter: number;
    DurableMessageLimit: number;
    Limit: number;
    LockKey: string;
    LockToken: string;
    LockRequestId: string;
    DeploymentOperation: 'deploy' | 'redeploy' | 'update' | 'delete';
    DeploymentOwnerId: string;
    DeploymentOrder: 'created_at.desc' | 'completed_at.asc';
    DeploymentResourceType: 'function' | 'frontend';
    FunctionKindFilter: components['schemas']['FunctionKindFilter'];
    DeploymentStatus:
      | 'queued'
      | 'provisioning'
      | 'active'
      | 'degraded'
      | 'failed'
      | 'superseded'
      | 'deleting'
      | 'deleted';
    Offset: number;
    Page: number;
    ProjectId: string;
    TokenId: string;
    Search: string;
    RestoreId: string;
    SchedulerId: string;
    VariableName: string;
    IfNoneMatch: string;
  };
  requestBodies: never;
  headers: {
    ETag: string;
    DatabaseQueryProxyMs: number;
    DatabaseQueryProxyHandlerMs: number;
    DatabaseQueryComputeMs: number;
  };
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  listSandboxPresets: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxPresetList'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listSandboxes: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
      };
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxTemplatePage'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createSandbox: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSandboxTemplateRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxTemplate'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandbox: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        sandboxId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxTemplate'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteSandbox: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        sandboxId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateSandbox: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        sandboxId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateSandboxTemplateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxTemplate'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listSandboxDeployments: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
      };
      header?: never;
      path: {
        id: string;
        sandboxId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxDeploymentPage'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deploySandbox: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
        sandboxId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          code: string;
          memory_mb?: 1024 | 2048;
          ports?: string;
        };
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxDeployment'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandboxDeployment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        sandboxId: string;
        deploymentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxDeployment'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandboxDeploymentLogs: {
    parameters: {
      query: {
        region: string;
        cursor?: string;
        limit?: number;
      };
      header?: never;
      path: {
        id: string;
        sandboxId: string;
        deploymentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxBuildLogPage'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandboxDeploymentSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        sandboxId: string;
        deploymentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/gzip': string;
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listSandboxSessions: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
      };
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSessionPage'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createSandboxSession: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSandboxSessionRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  executeSandbox: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxExecutionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxExecutionResult'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  terminateSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  suspendSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resumeSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxSession'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  executeSandboxSession: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxCommandRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxCommandResult'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  readSandboxSessionFile: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxFileReadRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxFileResult'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  writeSandboxSessionFile: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxFileWriteRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  grantSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
        subjectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxSubjectGrantRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  revokeSandboxSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
        subjectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createSandboxSessionAccess: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SandboxAccessRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SandboxAccess'];
        };
      };
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startImportConnect: {
    parameters: {
      query?: {
        provider?: components['schemas']['ImportProvider'];
        redirect?: string;
        callback_url?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportConnectStartResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  completeImportConnect: {
    parameters: {
      query: {
        state: string;
        code?: string;
        error?: string;
        teamId?: string;
        configurationId?: string;
        next?: string;
        source?: string;
      };
      header?: never;
      path: {
        provider: components['schemas']['ImportProvider'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      303: {
        headers: {
          Location?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listImportConnections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportConnectionsResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteImportConnection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        connectionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listImportSources: {
    parameters: {
      query: {
        connection_id: string;
      };
      header?: never;
      path: {
        provider: components['schemas']['ImportProvider'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportSourcesResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  preflightProjectImport: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: components['schemas']['ImportProvider'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectImportPreflightRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectImportReport'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startProjectImport: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        provider: components['schemas']['ImportProvider'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectImportStartRequest'];
      };
    };
    responses: {
      202: {
        headers: {
          Location: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectImportRun'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectImportRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: components['schemas']['ImportProvider'];
        runId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectImportRun'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startGitConnect: {
    parameters: {
      query?: {
        provider?: 'github';
        redirect?: string;
        callback_url?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GitConnectStartResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listGitConnections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GitConnectionsResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteGitConnection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        connectionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listGitInstallations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        connectionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GitInstallationsResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listGitInstallationRepositories: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        connectionId: string;
        installationId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GitRepositoriesResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listVerifiedDomains: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VerifiedDomainsResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  verifyDomain: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['VerifyDomainRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VerifiedDomain'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VerifiedDomain'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainConflictError'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteVerifiedDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        domain: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  gitConnectCallback: {
    parameters: {
      query: {
        code?: string;
        state: string;
        error?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      303: {
        headers: {
          Location?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjects: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        include?: ('git_connection' | 'health')[];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjects'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createProject: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateProjectRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateProjectRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectHealth: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectHealthResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  queryProjectMetrics: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectMetricsQueryRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectMetricsQueryResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectLogo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'image/png': string;
          'image/jpeg': string;
          'image/gif': string;
          'image/webp': string;
          'image/svg+xml': string;
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  uploadProjectLogo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          logo: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteProjectLogo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectUsage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectUsageResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  replaceSharedVariables: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          shared_variables: string[];
          expected_shared_variables?: string[];
          expected_shared_variables_digest?: string;
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  replaceFrontendSharedVariables: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          frontend_shared_variables: string[];
          expected_frontend_shared_variables?: string[];
          expected_frontend_shared_variables_digest?: string;
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getProjectConfig: {
    parameters: {
      query?: {
        format?: 'json' | 'yaml';
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfig'];
          'application/yaml': string;
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  applyProjectConfig: {
    parameters: {
      query?: {
        dry_run?: boolean;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectConfig'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfigApplyResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectConfigValidationErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectSourceExport: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectSourceExportState'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  exportProjectSource: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExportProjectSourceRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectSourceExport'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  cancelProjectSourceExport: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  setProjectGitProductionBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetProjectGitProductionBranchRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  setProjectGitRootDirectory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetProjectGitRootDirectoryRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectGitConnection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  connectProjectGit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConnectProjectGitRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitConnection'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  disconnectProjectGit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectGitDeploySettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitDeploySettings'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateProjectGitDeploySettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateProjectGitDeploySettingsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectGitDeploySettings'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectDatabaseQueries: {
    parameters: {
      query?: {
        limit?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryPerformanceResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        owner_id?: components['parameters']['DeploymentOwnerId'];
        project_id?: string;
        created_after?: string;
        resource_type?: components['parameters']['DeploymentResourceType'];
        status?: components['parameters']['DeploymentStatus'];
        operation?: components['parameters']['DeploymentOperation'];
        order?: components['parameters']['DeploymentOrder'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        created_after?: string;
        resource_type?: 'function' | 'frontend';
        function_kind?: components['parameters']['FunctionKindFilter'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  summarizeProjectDeployments: {
    parameters: {
      query: {
        search?: string;
        resource_type: 'function' | 'frontend';
        function_kind?: components['parameters']['FunctionKindFilter'];
        created_after?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectDeploymentSummary'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectCustomDomains: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectCustomDomains'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFunctions: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctions'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          code: string;
          runtime:
            | 'nodejs22.x'
            | 'nodejs24.x'
            | 'python3.10'
            | 'python3.11'
            | 'python3.12'
            | 'python3.13'
            | 'python3.14'
            | 'ruby3.3'
            | 'ruby3.4'
            | 'ruby4.0';
          handler?: string;
          visibility?: components['schemas']['FunctionVisibility'];
          is_public?: boolean;
          invocation_mode?: components['schemas']['FunctionInvocationMode'];
          http_auth_mode?: components['schemas']['FunctionHTTPAuthMode'];
          openapi_spec?: string;
          variable_scope?: 'all' | 'scoped';
          variables?: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateFunctionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Function'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  invokeFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FunctionInvocationRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Version'?: string;
          'X-Volcano-Region'?: string;
          'X-Volcano-Proxy-Ms'?: number;
          'X-Volcano-Proxy-Handler-Ms'?: number;
          'X-Volcano-Compute-Ms'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionInvocationResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      default: {
        headers: {
          'X-Volcano-Version'?: string;
          'X-Volcano-Region'?: string;
          'X-Volcano-Proxy-Ms'?: number;
          'X-Volcano-Proxy-Handler-Ms'?: number;
          'X-Volcano-Compute-Ms'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionInvocationResponse'];
        };
      };
    };
  };
  startDurableExecutionFromApplication: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Execution-Name'?: string;
      };
      path: {
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': unknown;
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableExecutionFromApplication: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Client-Token'?: components['parameters']['DurableClientToken'];
      };
      path: {
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  stopDurableExecutionFromApplication: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Client-Token'?: components['parameters']['DurableClientToken'];
      };
      path: {
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableMessagesFromApplication: {
    parameters: {
      query?: {
        direction?: components['parameters']['DurableMessageDirectionFilter'];
        name?: components['parameters']['DurableMessageNameFilter'];
        after?: components['parameters']['DurableMessageAfter'];
        limit?: components['parameters']['DurableMessageLimit'];
      };
      header?: {
        'X-Volcano-Client-Token'?: components['parameters']['DurableClientToken'];
      };
      path: {
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageList'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  sendDurableMessageFromApplication: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: components['parameters']['DurableMessageIdempotencyKey'];
        'X-Volcano-Client-Token'?: components['parameters']['DurableClientToken'];
      };
      path: {
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SendDurableMessageRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resolveFunctionForInvocation: {
    parameters: {
      query: {
        name: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ResolveFunctionResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectLogActivity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LogActivityRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LogActivityResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  searchProjectLogs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LogSearchRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LogSearchResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  streamProjectLogs: {
    parameters: {
      query?: {
        last_event_id?: string;
      };
      header?: {
        'Last-Event-ID'?: string;
      };
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LogStreamRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': string;
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFunctionsBatch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          functions: string;
          code_0?: string;
        };
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BatchFunctionDeployResponse'];
        };
      };
      207: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BatchFunctionDeployResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectSchedulers: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        function_kind?: components['parameters']['FunctionKindFilter'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionSchedulerListResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getNotificationSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationSettings'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateNotificationSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateNotificationSettingsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationSettings'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  rotateNotificationWebhookSecret: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationSettings'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  sendTestNotification: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationTestResult'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFunctionSchedulers: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionSchedulerListResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFunctionSchedulerRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateFunctionSchedulerRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFunctionDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['FunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctionDeployments'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableFunctions: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedDurableFunctions'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDurableFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          code: string;
          runtime: 'nodejs22.x' | 'nodejs24.x' | 'python3.13' | 'python3.14';
          handler?: string;
          visibility?: components['schemas']['FunctionVisibility'];
          is_public?: boolean;
          variable_scope?: 'all' | 'scoped';
          variables?: string;
          commit?: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableFunction'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableFunction'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableFunction'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteDurableFunction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableFunctionDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFunctionDeployments'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableFunctionSchedulers: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionSchedulerListResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDurableFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFunctionSchedulerRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteDurableFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateDurableFunctionScheduler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        schedulerId: components['parameters']['SchedulerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateFunctionSchedulerRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionScheduler'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableExecutions: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        status?: components['schemas']['DurableExecutionStatus'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedDurableExecutions'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startDurableExecution: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Execution-Name'?: string;
      };
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': unknown;
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableExecution: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableExecutionOperations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecutionOperationList'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  stopDurableExecution: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableExecution'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableMessages: {
    parameters: {
      query?: {
        direction?: components['parameters']['DurableMessageDirectionFilter'];
        name?: components['parameters']['DurableMessageNameFilter'];
        after?: components['parameters']['DurableMessageAfter'];
        limit?: components['parameters']['DurableMessageLimit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageList'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  sendDurableMessage: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: components['parameters']['DurableMessageIdempotencyKey'];
      };
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SendDurableMessageRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableMessageWaits: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        functionId: components['parameters']['DurableFunctionId'];
        executionId: components['parameters']['DurableExecutionId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageWaitList'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  registerDurableMessageWait: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RegisterDurableMessageWaitRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageWaitRegistration'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageWaitRegistration'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  openDurableMessageSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OpenDurableMessageSessionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageSessionRegistration'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessageSessionRegistration'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  publishDurableMessage: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Durable-Session': string;
        'Idempotency-Key'?: components['parameters']['DurableMessageIdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishDurableMessageRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableMessage'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  registerDurableCallback: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RegisterDurableCallbackRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackRegistration'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackRegistration'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  succeedDurableCallback: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SucceedDurableCallbackRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackOutcome'];
        };
      };
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackOutcome'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  failDurableCallback: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FailDurableCallbackRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackOutcome'];
        };
      };
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackOutcome'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  heartbeatDurableCallback: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['HeartbeatDurableCallbackRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableCallbackOutcome'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  requestDurableApproval: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RequestDurableApprovalRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApprovalRegistration'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApprovalRegistration'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listIssues: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['IssueCursor'];
        status?: components['schemas']['IssueStatus'];
        resource_id?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedIssues'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getIssue: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Issue'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateIssue: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateIssueRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Issue'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAutofixSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixSettings'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateAutofixSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAutofixSettingsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixSettings'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  startAutofixRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        issueId: components['parameters']['IssueId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixRun'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listAutofixRuns: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['IssueCursor'];
        issue_id?: string;
        status?: components['schemas']['AutofixRunStatus'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedAutofixRuns'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAutofixRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        runId: components['parameters']['AutofixRunId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AutofixRun'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDurableApprovals: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        status?: components['schemas']['DurableApprovalStatus'];
        function?: components['parameters']['DurableApprovalFunctionFilter'];
        execution_id?: string;
        from?: string;
        to?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedDurableApprovals'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableApprovalStats: {
    parameters: {
      query?: {
        function?: components['parameters']['DurableApprovalFunctionFilter'];
        from?: string;
        to?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApprovalStats'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDurableApproval: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        approvalId: components['parameters']['DurableApprovalId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApproval'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  approveDurableApproval: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        approvalId: components['parameters']['DurableApprovalId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['DurableApprovalDecisionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApproval'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  denyDurableApproval: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        approvalId: components['parameters']['DurableApprovalId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['DurableApprovalDecisionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DurableApproval'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontends: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFrontends'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          name: string;
          framework?: 'nextjs';
          app_root?: string;
          variable_scope?: 'all' | 'scoped';
          variables?: string[];
          archive: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  redeployFrontend: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFrontendCustomDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'] | null;
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendCustomDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendCustomDomainRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainConflictError'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFrontendCustomDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontendDomains: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainList'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendDomainRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainConflictError'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFrontendDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        domain: components['parameters']['FrontendCustomDomainHostname'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFrontendDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        domain: components['parameters']['FrontendCustomDomainHostname'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFrontendDomain: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        domain: components['parameters']['FrontendCustomDomainHostname'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateFrontendCustomDomainRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendCustomDomainResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontendDeployments: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedFrontendDeployments'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendDeployment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendDeploymentRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Frontend'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      501: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getFrontendUsageHistory: {
    parameters: {
      query?: {
        days?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendUsageHistoryResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontendFunctionRoutes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendFunctionRouteList'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendFunctionRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendFunctionRouteRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendFunctionRoute'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFrontendFunctionRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendFunctionRouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendFunctionRouteRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendFunctionRoute'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFrontendFunctionRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendFunctionRouteId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listFrontendRoutes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendRouteList'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createFrontendRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendRouteRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendRoute'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateFrontendRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendRouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateFrontendRouteRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FrontendRoute'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteFrontendRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        frontendId: components['parameters']['FrontendId'];
        routeId: components['parameters']['FrontendRouteId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listVariableEnvironments: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariableEnvironmentList'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createVariableEnvironment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateVariableEnvironmentRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariableEnvironment'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getVariableEnvironment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        environmentId: components['parameters']['VariableEnvironmentId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariableEnvironment'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteVariableEnvironment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        environmentId: components['parameters']['VariableEnvironmentId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  renameVariableEnvironment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        environmentId: components['parameters']['VariableEnvironmentId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RenameVariableEnvironmentRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariableEnvironment'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listVariables: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedVariables'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateVariableRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Variable'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDatabases: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        status?: 'provisioning' | 'active' | 'restoring' | 'failed' | 'deleting';
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedDatabases'];
        };
      };
    };
  };
  createDatabase: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Database'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabase: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Database'];
        };
      };
    };
  };
  deleteDatabase: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            status?: string;
            message?: string;
          };
        };
      };
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDatabaseBranches: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranchList'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDatabaseBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseBranchRequest'];
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranch'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranch'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteDatabaseBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            status: string;
            message: string;
          };
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateDatabaseBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateDatabaseBranchRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranch'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resetDatabaseBranch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranch'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resetDatabaseBranchPassword: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBranch'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDatabaseBackups: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackupList'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDatabaseBackup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseBackupRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackup'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseBackup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        backupName: components['parameters']['BackupName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackup'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteDatabaseBackup: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        backupName: components['parameters']['BackupName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            status: string;
            message: string;
          };
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseBackupSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackupSchedule'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateDatabaseBackupSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseBackupSchedule'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseBackupSchedule'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listDatabaseRestores: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseRestoreList'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createDatabaseRestore: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateDatabaseRestoreRequest'];
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseRestore'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseRestore: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
        restoreId: components['parameters']['RestoreId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseRestore'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  resetDatabasePassword: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
            role_name?: string;
            new_password?: string;
            connection_string?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateDatabaseType: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateDatabaseTypeRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Database'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getDatabaseStats: {
    parameters: {
      query?: {
        from?: string;
        to?: string;
        granularity?: 'hourly' | 'daily' | 'monthly';
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseStats'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  queryDatabasePing: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
    };
  };
  queryDatabaseSelect: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseSelectRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
    };
  };
  queryDatabaseInsert: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseInsertRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
    };
  };
  queryDatabaseUpdate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseUpdateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
    };
  };
  queryDatabaseDelete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseDeleteRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
    };
  };
  queryDatabaseBranchPing: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
      503: components['responses']['DatabaseBranchQueryUnavailable'];
    };
  };
  queryDatabaseBranchSelect: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseSelectRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
      503: components['responses']['DatabaseBranchQueryUnavailable'];
    };
  };
  queryDatabaseBranchInsert: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseInsertRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
      503: components['responses']['DatabaseBranchQueryUnavailable'];
    };
  };
  queryDatabaseBranchUpdate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseUpdateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
      503: components['responses']['DatabaseBranchQueryUnavailable'];
    };
  };
  queryDatabaseBranchDelete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        databaseName: components['parameters']['DatabaseName'];
        branchName: components['parameters']['BranchName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DatabaseDeleteRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          'X-Volcano-Proxy-Ms': components['headers']['DatabaseQueryProxyMs'];
          'X-Volcano-Proxy-Handler-Ms': components['headers']['DatabaseQueryProxyHandlerMs'];
          'X-Volcano-Compute-Ms': components['headers']['DatabaseQueryComputeMs'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DatabaseQueryResult'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: components['responses']['DatabaseQueryCapExceeded'];
      503: components['responses']['DatabaseBranchQueryUnavailable'];
    };
  };
  listDatabaseRegions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            id?: string;
            name?: string;
          }[];
        };
      };
    };
  };
  listPostgresVersions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            version?: string;
            name?: string;
            default?: boolean;
            recommended?: boolean;
            deprecated?: boolean;
          }[];
        };
      };
    };
  };
  listFunctionRuntimes: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionRuntimesResponse'];
        };
      };
    };
  };
  listFunctionRegions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FunctionRegion'][];
        };
      };
    };
  };
  getVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        name: components['parameters']['VariableName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Variable'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        name: components['parameters']['VariableName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateVariableRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Variable'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteVariable: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        name: components['parameters']['VariableName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authGetPasswordPolicy: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthPasswordPolicy'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authSignup: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email: string;
          password: string;
          user_metadata?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthSignupResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authSignin: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email: string;
          password: string;
          session_mode?: 'cookie';
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authRefresh: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          refresh_token?: string;
          session_mode?: 'cookie';
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authLogout: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          refresh_token?: string;
          session_mode?: 'cookie';
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authForgotPassword: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authResetPassword: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          token: string;
          new_password: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authConfirmEmail: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          token: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: 'Email confirmed successfully' | 'Email already confirmed';
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authResendConfirmation: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
          };
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authSignupAnonymous: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          user_metadata?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authConvertAnonymous: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email: string;
          password: string;
          user_metadata?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            user?: components['schemas']['AuthUser'];
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authRequestEmailChange: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          new_email: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
            new_email?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authConfirmEmailChange: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          email_change_token: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
            user?: components['schemas']['AuthUser'];
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authCancelEmailChange: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authGetMySessions: {
    parameters: {
      query?: {
        page?: number;
        limit?: number;
        sort?: 'last_activity' | 'created_at';
        status?: 'active' | 'expired';
        cursor?: string;
        ending_before?: string;
        offset?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            sessions?: components['schemas']['AuthSession'][];
            total?: number;
            page?: number;
            limit?: number;
            total_pages?: number;
            data?: components['schemas']['AuthSession'][];
            has_more?: boolean;
            next_cursor?: string;
            prev_cursor?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authDeleteAllMySessions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authDeleteMySession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authGetUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            user?: components['schemas']['AuthUser'];
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authUpdateUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          password?: string;
          user_metadata?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            user?: components['schemas']['AuthUser'];
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authListIdentities: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthIdentitiesResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authUnlinkIdentity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        identityId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authListMethods: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthMethodsResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authPromoteMethod: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        methodId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthMethodSummary'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAuthInsights: {
    parameters: {
      query?: {
        from?: string;
        to?: string;
        interval?: components['schemas']['AuthInsightsInterval'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthInsightsResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listAuthUsers: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
        status?: 'active' | 'banned';
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedAuthUsers'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAuthUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthUser'];
        };
      };
    };
  };
  deleteAuthUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listUserSessions: {
    parameters: {
      query?: {
        page?: number;
        limit?: number;
        sort?: 'last_activity' | 'created_at';
        status?: 'active' | 'expired';
        cursor?: string;
        ending_before?: string;
        offset?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            sessions?: components['schemas']['AuthSession'][];
            total?: number;
            page?: number;
            limit?: number;
            total_pages?: number;
            data?: components['schemas']['AuthSession'][];
            has_more?: boolean;
            next_cursor?: string;
            prev_cursor?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteAllUserSessions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteUserSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  banAuthUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          banned_until?: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BanUserResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  unbanAuthUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UnbanUserResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listEmailTemplates: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data?: components['schemas']['EmailTemplate'][];
          };
        };
      };
    };
  };
  createEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEmailTemplateRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  updateEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateEmailTemplateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmailTemplate'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getDefaultEmailTemplates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data?: components['schemas']['DefaultEmailTemplate'][];
          };
        };
      };
    };
  };
  getDefaultEmailTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        type: 'welcome' | 'confirmation' | 'password_reset' | 'password_changed';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DefaultEmailTemplate'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getAuthConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthConfig'];
        };
      };
    };
  };
  updateAuthConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateAuthConfigRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthConfig'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  testEmailConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TestEmailRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TestEmailResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      502: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthHostedPage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthHostedPageResponse'];
        };
      };
    };
  };
  updateAuthHostedPage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAuthHostedPageRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthHostedPageResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthPageAppearance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthPageAppearanceResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateAuthPageTheme: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAuthPageThemeRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UpdateAuthPageThemeRequest'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteAuthPageTheme: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateAuthPageLayout: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAuthPageLayoutRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UpdateAuthPageLayoutRequest'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  deleteAuthPageLayout: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  renderAuthPagePreview: {
    parameters: {
      query: {
        ticket: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/html': string;
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
    };
  };
  previewAuthPage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedAuthPageType'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PreviewAuthPageRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PreviewAuthPageResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  renderManagedAuthPage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        pageType: components['schemas']['HostedRenderablePageType'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/html': string;
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  renderDefaultManagedAuthPage: {
    parameters: {
      query?: {
        action?: 'login' | 'signup' | 'forgot-password' | 'device';
        user_code?: string;
        anon_key?: string;
        state?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/html': string;
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getHostedLoginOptions: {
    parameters: {
      query: {
        anon_key: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostedLoginOptionsResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  hostedLoginCheckEmail: {
    parameters: {
      query?: never;
      header: {
        Authorization: string;
      };
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['HostedLoginEmailCheckRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostedLoginEmailCheckResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthMethods: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            email_password?: {
              enabled?: boolean;
              method?: string;
              name?: string;
            };
            anonymous?: {
              enabled?: boolean;
              method?: string;
              name?: string;
            };
            oauth_providers?: {
              enabled?: boolean;
              method?: string;
              provider?: string;
              name?: string;
              redirect_url?: string;
              scopes?: string[];
            }[];
            available_methods?: string[];
          };
        };
      };
    };
  };
  configureAuthMethods: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          enable_email_password?: boolean;
          enable_anonymous?: boolean;
          oauth_providers?: {
            provider?: string;
            enabled?: boolean;
          }[];
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listOAuthConfigs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            configs?: components['schemas']['OAuthConfig'][];
          };
        };
      };
    };
  };
  createOAuthConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateOAuthConfigRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthConfig'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getOAuthConfig: {
    parameters: {
      query?: {
        client_id?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        provider: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthConfig'];
        };
      };
    };
  };
  updateOAuthConfig: {
    parameters: {
      query?: {
        client_id?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        provider: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateOAuthConfigRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthConfig'];
        };
      };
    };
  };
  deleteOAuthConfig: {
    parameters: {
      query?: {
        client_id?: string;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        provider: 'google' | 'github' | 'microsoft' | 'apple' | 'device';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAvailableOAuthProviders: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            providers?: {
              id?: string;
              name?: string;
              default_scopes?: string[];
            }[];
          };
        };
      };
    };
  };
  authOAuthAuthorize: {
    parameters: {
      query: {
        anon_key: string;
        redirect_url?: string;
        client_state?: string;
        response_mode?: 'code';
      };
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      307: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authOAuthCallback: {
    parameters: {
      query: {
        code: string;
        state: string;
        error?: string;
      };
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      303: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authOAuthExchange: {
    parameters: {
      query?: never;
      header?: {
        'X-Volcano-Proxy-Authorization'?: components['parameters']['AuthProxyAuthorization'];
        'X-Volcano-Client-IP'?: components['parameters']['AuthProxyClientIP'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          code: string;
          redirect_url: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  authDeviceAuthorize: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          client_id: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DeviceAuthorizationResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthErrorResponse'];
        };
      };
    };
  };
  authDeviceToken: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code';
          device_code: string;
          client_id: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthTokenResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OAuthErrorResponse'];
        };
      };
    };
  };
  authDeviceVerify: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          user_code: string;
          action?: 'approve' | 'deny';
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            success?: boolean;
            status?: string;
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authPlatformExchange: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          client_id: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PlatformExchangeResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authListOAuthProviders: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            providers?: {
              provider?: string;
              linked_at?: string;
              updated_at?: string;
            }[];
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authLinkOAuthProvider: {
    parameters: {
      query?: {
        redirect_url?: string;
        client_state?: string;
        response_mode?: 'code';
      };
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            authorization_url?: string;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  authUnlinkOAuthProvider: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  refreshOAuthProviderToken: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
            provider?: string;
            expires_in?: number;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getOAuthProviderToken: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            message?: string;
            provider?: string;
            expires_in?: number;
          };
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  callOAuthProviderAPI: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: 'google' | 'github' | 'microsoft' | 'apple';
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          endpoint: string;
          method?: 'GET' | 'POST';
          body?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            provider: 'google' | 'github' | 'microsoft' | 'apple';
            endpoint: string;
            status_code: number;
            data: unknown;
          };
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      502: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listAnonKeys: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data?: components['schemas']['AnonKey'][];
            total?: number;
            has_more?: boolean;
            next_cursor?: string;
            prev_cursor?: string;
          };
        };
      };
    };
  };
  createAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          name: string;
          permissions?: (
            | 'auth.signup'
            | 'auth.signin'
            | 'auth.refresh'
            | 'auth.logout'
            | 'auth.password_reset'
            | 'auth.confirm_email'
            | 'auth.resend_confirmation'
            | 'storage.upload'
            | 'storage.download'
            | 'storage.list'
            | 'storage.delete'
            | 'realtime.connect'
            | 'realtime.subscribe'
            | 'realtime.publish'
            | 'functions.invoke'
          )[];
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
    };
  };
  getAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  revokeAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  regenerateAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
    };
  };
  setDefaultAnonKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AnonKey'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectAccessTokens: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        search?: components['parameters']['Search'];
        include_revoked?: boolean;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedProjectAccessTokens'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  createProjectAccessToken: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateProjectAccessTokenRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreatedProjectAccessToken'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listProjectAccessTokensUsage: {
    parameters: {
      query?: {
        days?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectAccessTokenUsage'][];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectAccessToken: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        tokenId: components['parameters']['TokenId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectAccessToken'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  revokeProjectAccessToken: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        tokenId: components['parameters']['TokenId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectAccessTokenUsage: {
    parameters: {
      query?: {
        days?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        tokenId: components['parameters']['TokenId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectAccessTokenUsage'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listServiceKeys: {
    parameters: {
      query?: {
        page?: components['parameters']['Page'];
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaginatedServiceKeys'];
        };
      };
    };
  };
  createServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          name: string;
          permissions?: string[];
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  regenerateServiceKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceKey'];
        };
      };
    };
  };
  listStorageBuckets: {
    parameters: {
      query?: {
        limit?: components['parameters']['Limit'];
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['StorageBucket'][]
            | components['schemas']['PaginatedStorageBuckets'];
        };
      };
    };
  };
  createStorageBucket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateStorageBucketRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageBucket'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getStorageBucket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageBucket'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteStorageBucket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  updateStorageBucket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateStorageBucketRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageBucket'];
        };
      };
    };
  };
  listStoragePolicies: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StoragePolicy'][];
        };
      };
    };
  };
  createStoragePolicy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateStoragePolicyRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StoragePolicy'];
        };
      };
    };
  };
  deleteStoragePolicy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
        bucketName: components['parameters']['BucketName'];
        policyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listStorageObjectsAdmin: {
    parameters: {
      query?: {
        owner_id?: string;
        page?: number;
        limit?: number;
        cursor?: components['parameters']['Cursor'];
        ending_before?: components['parameters']['EndingBefore'];
        offset?: components['parameters']['Offset'];
        search?: components['parameters']['Search'];
      };
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data?: components['schemas']['StorageObjectWithBucket'][];
            page?: number;
            limit?: number;
            total?: number;
            has_more?: boolean;
            next_cursor?: string;
            prev_cursor?: string;
          };
        };
      };
    };
  };
  getStorageStats: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageStats'];
        };
      };
    };
  };
  getRealtimeConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RealtimeConfig'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  updateRealtimeConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateRealtimeConfigRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RealtimeConfig'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getRealtimeStats: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ProjectId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RealtimeStats'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listStorageObjects: {
    parameters: {
      query?: {
        prefix?: string;
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageListResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  acquireProjectLock: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Lock-Token': components['parameters']['LockToken'];
        'X-Volcano-Request-Id': components['parameters']['LockRequestId'];
      };
      path: {
        key: components['parameters']['LockKey'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectLockLeaseRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectLockLease'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  releaseProjectLock: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Lock-Token': components['parameters']['LockToken'];
        'X-Volcano-Request-Id': components['parameters']['LockRequestId'];
      };
      path: {
        key: components['parameters']['LockKey'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  renewProjectLock: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Lock-Token': components['parameters']['LockToken'];
        'X-Volcano-Request-Id': components['parameters']['LockRequestId'];
      };
      path: {
        key: components['parameters']['LockKey'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectLockLeaseRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectLockLease'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getProjectLock: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Request-Id': components['parameters']['LockRequestId'];
      };
      path: {
        key: components['parameters']['LockKey'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectLockState'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  forceReleaseProjectLock: {
    parameters: {
      query?: never;
      header: {
        'X-Volcano-Request-Id': components['parameters']['LockRequestId'];
      };
      path: {
        key: components['parameters']['LockKey'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      429: {
        headers: {
          'Retry-After'?: number;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  moveStorageObject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['StorageMoveRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageObject'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  copyStorageObject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        bucketName: components['parameters']['BucketName'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['StorageCopyRequest'];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageObject'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  downloadStorageObject: {
    parameters: {
      query?: never;
      header?: {
        Range?: string;
        'X-Upload-Session'?: string;
      };
      path: {
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Content-Type'?: string;
          'Content-Length'?: number;
          ETag?: string;
          [name: string]: unknown;
        };
        content: {
          'application/octet-stream': string;
          'application/json': components['schemas']['UploadSessionStatusResponse'];
        };
      };
      206: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      416: components['responses']['StorageRangeNotSatisfiable'];
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  uploadPart: {
    parameters: {
      query?: never;
      header: {
        'X-Upload-Session': string;
        'X-Part-Number': number;
      };
      path: {
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/octet-stream': string;
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadSessionPart'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  uploadStorageObject: {
    parameters: {
      query?: never;
      header?: {
        'X-Upload-Session'?: string;
        'X-Upload-Complete'?: 'true';
      };
      path: {
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': {
          file: string;
        };
        'application/json': components['schemas']['CreateUploadSessionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CompleteUploadSessionResponse'];
        };
      };
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | components['schemas']['StorageObject']
            | components['schemas']['CreateUploadSessionResponse'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  deleteStorageObject: {
    parameters: {
      query?: never;
      header?: {
        'X-Upload-Session'?: string;
      };
      path: {
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  updateStorageObjectVisibility: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['StorageVisibilityRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StorageObject'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  downloadPublicFile: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        bucketName: components['parameters']['BucketName'];
        path: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': string;
        };
      };
      206: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      416: components['responses']['StorageRangeNotSatisfiable'];
      429: components['responses']['BandwidthCapExceeded'];
    };
  };
  healthCheck: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
    };
  };
  listCapabilities: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CapabilityList'];
        };
      };
    };
  };
  getOpenAPISpecJSON: {
    parameters: {
      query?: never;
      header?: {
        'If-None-Match'?: components['parameters']['IfNoneMatch'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OpenAPISpecDocument'];
        };
      };
      304: components['responses']['OpenAPISpecNotModified'];
      429: components['responses']['OpenAPISpecThrottled'];
    };
  };
  headOpenAPISpecJSON: {
    parameters: {
      query?: never;
      header?: {
        'If-None-Match'?: components['parameters']['IfNoneMatch'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: components['responses']['OpenAPISpecHeaders'];
      304: components['responses']['OpenAPISpecNotModified'];
      429: components['responses']['OpenAPISpecThrottled'];
    };
  };
  getOpenAPISpecYAML: {
    parameters: {
      query?: never;
      header?: {
        'If-None-Match'?: components['parameters']['IfNoneMatch'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/yaml': components['schemas']['OpenAPISpecDocument'];
        };
      };
      304: components['responses']['OpenAPISpecNotModified'];
      429: components['responses']['OpenAPISpecThrottled'];
    };
  };
  headOpenAPISpecYAML: {
    parameters: {
      query?: never;
      header?: {
        'If-None-Match'?: components['parameters']['IfNoneMatch'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: components['responses']['OpenAPISpecHeaders'];
      304: components['responses']['OpenAPISpecNotModified'];
      429: components['responses']['OpenAPISpecThrottled'];
    };
  };
  callMCP: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          jsonrpc: '2.0';
          method: string;
          id?: string | number;
          params?: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            jsonrpc: '2.0';
            id: (string | number) | null;
            result?: {
              [key: string]: unknown;
            };
            error?: {
              code: number;
              message: string;
            };
          };
        };
      };
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
}
