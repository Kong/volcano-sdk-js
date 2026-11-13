import type * as Expected from './published-openapi';
import type * as CJS from '@volcano.dev/sdk' with { 'resolution-mode': 'require' };
import type * as ESM from '@volcano.dev/sdk' with { 'resolution-mode': 'import' };
import type * as Current from '../../src/generated/openapi';
import type { Exact } from './public-api-compatibility';

type EntryChecks<Before, After> = {
  [Key in keyof Before]: Key extends keyof After ? Exact<Before[Key], After[Key]> : false;
};
type EveryEntry<Checks extends { [Key in keyof Checks]: true }> = Checks;

export type CJSPaths = EveryEntry<EntryChecks<Expected.paths, CJS.OpenAPIPaths>>;
export type CJSNewPaths = EveryEntry<
  EntryChecks<Pick<Current.paths, Exclude<keyof Current.paths, keyof Expected.paths>>, CJS.OpenAPIPaths>
>;
export type CJSOperations = EveryEntry<EntryChecks<Expected.operations, CJS.OpenAPIOperations>>;
export type CJSNewOperations = EveryEntry<
  EntryChecks<
    Pick<Current.operations, Exclude<keyof Current.operations, keyof Expected.operations>>,
    CJS.OpenAPIOperations
  >
>;
export type CJSSchemas = EveryEntry<EntryChecks<Expected.components['schemas'], CJS.OpenAPIComponents['schemas']>>;
export type CJSNewSchemas = EveryEntry<
  EntryChecks<
    Pick<
      Current.components['schemas'],
      Exclude<keyof Current.components['schemas'], keyof Expected.components['schemas']>
    >,
    CJS.OpenAPIComponents['schemas']
  >
>;
export type CJSResponses = EveryEntry<[Exact<Current.components['responses'], CJS.OpenAPIComponents['responses']>]>;
export type CJSParameters = EveryEntry<
  EntryChecks<Expected.components['parameters'], CJS.OpenAPIComponents['parameters']>
>;
export type CJSNewParameters = EveryEntry<
  EntryChecks<
    Pick<
      Current.components['parameters'],
      Exclude<keyof Current.components['parameters'], keyof Expected.components['parameters']>
    >,
    CJS.OpenAPIComponents['parameters']
  >
>;
export type CJSRequestBodies = EveryEntry<
  [Exact<Current.components['requestBodies'], CJS.OpenAPIComponents['requestBodies']>]
>;
export type CJSHeaders = EveryEntry<[Exact<Current.components['headers'], CJS.OpenAPIComponents['headers']>]>;
export type CJSPathItems = EveryEntry<[Exact<Current.components['pathItems'], CJS.OpenAPIComponents['pathItems']>]>;
export type ESMPaths = EveryEntry<EntryChecks<Expected.paths, ESM.OpenAPIPaths>>;
export type ESMNewPaths = EveryEntry<
  EntryChecks<Pick<Current.paths, Exclude<keyof Current.paths, keyof Expected.paths>>, ESM.OpenAPIPaths>
>;
export type ESMOperations = EveryEntry<EntryChecks<Expected.operations, ESM.OpenAPIOperations>>;
export type ESMNewOperations = EveryEntry<
  EntryChecks<
    Pick<Current.operations, Exclude<keyof Current.operations, keyof Expected.operations>>,
    ESM.OpenAPIOperations
  >
>;
export type ESMSchemas = EveryEntry<EntryChecks<Expected.components['schemas'], ESM.OpenAPIComponents['schemas']>>;
export type ESMNewSchemas = EveryEntry<
  EntryChecks<
    Pick<
      Current.components['schemas'],
      Exclude<keyof Current.components['schemas'], keyof Expected.components['schemas']>
    >,
    ESM.OpenAPIComponents['schemas']
  >
>;
export type ESMResponses = EveryEntry<[Exact<Current.components['responses'], ESM.OpenAPIComponents['responses']>]>;
export type ESMParameters = EveryEntry<
  EntryChecks<Expected.components['parameters'], ESM.OpenAPIComponents['parameters']>
>;
export type ESMNewParameters = EveryEntry<
  EntryChecks<
    Pick<
      Current.components['parameters'],
      Exclude<keyof Current.components['parameters'], keyof Expected.components['parameters']>
    >,
    ESM.OpenAPIComponents['parameters']
  >
>;
export type ESMRequestBodies = EveryEntry<
  [Exact<Current.components['requestBodies'], ESM.OpenAPIComponents['requestBodies']>]
>;
export type ESMHeaders = EveryEntry<[Exact<Current.components['headers'], ESM.OpenAPIComponents['headers']>]>;
export type ESMPathItems = EveryEntry<[Exact<Current.components['pathItems'], ESM.OpenAPIComponents['pathItems']>]>;
