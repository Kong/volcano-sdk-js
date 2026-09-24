import type {
  FilterValue as EsmFilterValue,
  MutationBuilder as EsmMutationBuilder,
  QueryBuilder as EsmQueryBuilder,
  QueryResult as EsmQueryResult,
  VolcanoAuth as EsmVolcanoAuth,
} from '../../dist/index.esm.mjs';
import type {
  FilterValue,
  MutationBuilder,
  QueryBuilder,
  QueryResult,
  VolcanoAuth,
} from '../../dist/index.js';

interface Post {
  id: number;
  title: string;
}
declare const sdk: VolcanoAuth;
declare const esmSdk: EsmVolcanoAuth;

const cjsRead: Promise<QueryResult<Post>> = sdk.from<Post>('posts').select('id,title').execute();
const cjsInsert: Promise<QueryResult<Post>> = sdk.insert<Post>('posts', { title: 'new' }).execute();
const cjsUpdate: Promise<QueryResult<Post>> = sdk
  .update<Post>('posts', { title: 'edited' })
  .execute();
const cjsDelete: Promise<QueryResult<Post>> = sdk.delete<Post>('posts').execute();
const esmRead: Promise<EsmQueryResult<Post>> = esmSdk.from<Post>('posts').execute();
const esmInsert: Promise<EsmQueryResult<Post>> = esmSdk
  .insert<Post>('posts', { title: 'new' })
  .execute();
const esmUpdate: Promise<EsmQueryResult<Post>> = esmSdk
  .update<Post>('posts', { title: 'edited' })
  .execute();
const esmDelete: Promise<EsmQueryResult<Post>> = esmSdk.delete<Post>('posts').execute();
export const typedDatabaseResults = [
  cjsRead,
  cjsInsert,
  cjsUpdate,
  cjsDelete,
  esmRead,
  esmInsert,
  esmUpdate,
  esmDelete,
];

const values: FilterValue[] = ['text', 1, false, null, new Date()];
const esmValues: EsmFilterValue[] = values;
declare const query: QueryBuilder;
declare const mutation: MutationBuilder;
declare const esmQuery: EsmQueryBuilder;
declare const esmMutation: EsmMutationBuilder;

query.in('value', values).eq('created_at', new Date()).is('deleted_at', null);
mutation.in('value', values).like('name', 'prefix%');
esmQuery.in('value', esmValues).eq('created_at', new Date()).is('deleted_at', null);
esmMutation.in('value', esmValues).ilike('name', 'prefix%');

const cjsQueryResult: Promise<QueryResult> = Promise.resolve(query);
const cjsMutationResult: Promise<QueryResult> = Promise.resolve(mutation);
const esmQueryResult: Promise<EsmQueryResult> = Promise.resolve(esmQuery);
const esmMutationResult: Promise<EsmQueryResult> = Promise.resolve(esmMutation);
export const thenableResults = [
  cjsQueryResult,
  cjsMutationResult,
  esmQueryResult,
  esmMutationResult,
];

// @ts-expect-error Filter values exclude arbitrary objects.
query.eq('value', {});
// @ts-expect-error SQL identity predicates accept only null and booleans.
esmMutation.is('active', 'true');
