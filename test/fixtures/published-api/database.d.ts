import type { FilterValue } from '../../../dist/database-filters';
import type { JsonValue } from './auth';
export type { FilterValue } from '../../../dist/database-filters';
export interface QueryResult<T = Record<string, JsonValue>> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}
export interface QueryBuilder<T = Record<string, JsonValue>> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: null | boolean): QueryBuilder<T>;
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
    },
  ): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export interface MutationBuilder<T = Record<string, JsonValue>> {
  eq(column: string, value: FilterValue): MutationBuilder<T>;
  neq(column: string, value: FilterValue): MutationBuilder<T>;
  gt(column: string, value: FilterValue): MutationBuilder<T>;
  gte(column: string, value: FilterValue): MutationBuilder<T>;
  lt(column: string, value: FilterValue): MutationBuilder<T>;
  lte(column: string, value: FilterValue): MutationBuilder<T>;
  like(column: string, pattern: string): MutationBuilder<T>;
  ilike(column: string, pattern: string): MutationBuilder<T>;
  is(column: string, value: null | boolean): MutationBuilder<T>;
  in(column: string, values: FilterValue[]): MutationBuilder<T>;
  execute(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export type InsertBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
export type UpdateBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
export type DeleteBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
