import { type SandboxPreset, VolcanoClient } from '../../dist/index.js';
const client = new VolcanoClient({ anonKey: 'anonymous-key' });
declare const preset: SandboxPreset;
export const created = client.sandboxes.create('project-id', {
  preset: preset.id,
  memoryMB: preset.memoryMB,
  region: 'us-east-1',
});
