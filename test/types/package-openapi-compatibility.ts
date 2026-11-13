import type * as CJS from '@volcano.dev/sdk' with { 'resolution-mode': 'require' };
import type * as ESM from '@volcano.dev/sdk' with { 'resolution-mode': 'import' };

type CJSConfig = CJS.OpenAPIComponents['schemas']['ProjectConfig'];
type ESMConfig = ESM.OpenAPIComponents['schemas']['ProjectConfig'];
type ApplyBody = NonNullable<CJS.OpenAPIOperations['applyProjectConfig']['requestBody']>['content']['application/json'];
type ConfigPathBody = NonNullable<
  ESM.OpenAPIPaths['/projects/{id}/config']['put']['requestBody']
>['content']['application/json'];

export const minimalConfig: CJSConfig = { version: 1 };
export const historicalConfig: ESMConfig = {
  version: 1,
  autofix: { enabled: true, max_stage: 'pull_request', auto_trigger: false },
};
export const historicalApply: ApplyBody = { version: 1, autofix: { enabled: true, max_stage: 'diagnose' } };
export const historicalPathApply: ConfigPathBody = { version: 1, autofix: {} };
export const historicalStage: CJS.OpenAPIComponents['schemas']['AutofixStage'] = 'diagnose';
// @ts-expect-error the historical stage contract does not accept an unrecognized stage
export const invalidHistoricalStage: CJS.OpenAPIComponents['schemas']['AutofixStage'] = 'deploy';

export const sessionWithoutNewFields: CJS.OpenAPIComponents['schemas']['SandboxSession'] = {
  id: 'session',
  project_id: 'project',
  sandbox_id: null,
  state: 'running',
  desired_state: 'running',
  region: 'us-east-1',
  memory_mb: 1024,
  created_at: '2026-11-13T00:00:00Z',
  expires_at: null,
};
export const commandWithoutRetention: ESM.OpenAPIComponents['schemas']['SandboxCommandResult'] = {
  stdout: '',
  stderr: '',
  exit_code: 0,
  stdout_truncated: false,
  stderr_truncated: false,
  timed_out: false,
};

declare const getConfig: CJS.OpenAPIOperations['getProjectConfig']['responses'][200]['content']['application/json'];
declare const pathGetConfig: ESM.OpenAPIPaths['/projects/{id}/config']['get']['responses'][200]['content']['application/json'];
export const optionalHistoricalStage: CJS.OpenAPIComponents['schemas']['AutofixStage'] | undefined =
  getConfig.autofix?.max_stage;
export const optionalPathStage: ESM.OpenAPIComponents['schemas']['AutofixStage'] | undefined =
  pathGetConfig.autofix?.max_stage;
