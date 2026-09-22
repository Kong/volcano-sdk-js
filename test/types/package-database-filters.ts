import type {
  FilterValue as EsmFilterValue,
  MutationBuilder as EsmMutationBuilder,
  QueryBuilder as EsmQueryBuilder,
} from '../../dist/index.esm.mjs';
import type { FilterValue, MutationBuilder, QueryBuilder } from '../../dist/index.js';

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

// @ts-expect-error Filter values exclude arbitrary objects.
query.eq('value', {});
// @ts-expect-error SQL identity predicates accept only null and booleans.
esmMutation.is('active', 'true');
