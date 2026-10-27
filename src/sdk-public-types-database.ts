import type { FilterValue } from './database-filters';
import type { JsonValue } from './sdk-public-types-json.ts';

export interface QueryResult<T = Record<string, JsonValue>> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}

export interface QueryBuilder<T = Record<string, JsonValue>> {
  /** Select columns to return */
  select(columns: string): QueryBuilder<T>;
  /** Filter where column equals value */
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column does not equal value */
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is greater than value */
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is greater than or equal to value */
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is less than value */
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is less than or equal to value */
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column matches pattern (case-sensitive) */
  like(column: string, pattern: string): QueryBuilder<T>;
  /** Filter where column matches pattern (case-insensitive) */
  ilike(column: string, pattern: string): QueryBuilder<T>;
  /** Filter by SQL IS NULL, IS TRUE, or IS FALSE. */
  is(column: string, value: null | boolean): QueryBuilder<T>;
  /** Filter where column is in array of values */
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  /** Order results */
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  /** Limit number of rows */
  limit(count: number): QueryBuilder<T>;
  /** Skip rows (pagination) */
  offset(count: number): QueryBuilder<T>;
  /** Execute query and return results */
  execute(): Promise<QueryResult<T>>;
  /** Await the builder directly as a query result. */
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface MutationBuilder<T = Record<string, JsonValue>> {
  /** Filter where column equals value */
  eq(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column does not equal value */
  neq(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is greater than value */
  gt(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is greater than or equal to value */
  gte(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is less than value */
  lt(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is less than or equal to value */
  lte(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column matches pattern (case-sensitive) */
  like(column: string, pattern: string): MutationBuilder<T>;
  /** Filter where column matches pattern (case-insensitive) */
  ilike(column: string, pattern: string): MutationBuilder<T>;
  /** Filter by SQL IS NULL, IS TRUE, or IS FALSE. */
  is(column: string, value: null | boolean): MutationBuilder<T>;
  /** Filter where column is in array of values */
  in(column: string, values: FilterValue[]): MutationBuilder<T>;
  /** Execute mutation and return results */
  execute(): Promise<QueryResult<T>>;
  /** Await the builder directly as a mutation result. */
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

/** @deprecated Use MutationBuilder instead */
export type InsertBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
/** @deprecated Use MutationBuilder instead */
export type UpdateBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
/** @deprecated Use MutationBuilder instead */
export type DeleteBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
