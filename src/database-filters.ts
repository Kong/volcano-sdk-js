/** Values accepted by the database filter builders. */
export type FilterValue = string | number | boolean | null | Date;

export type DatabaseFilter =
  | { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: FilterValue }
  | { column: string; operator: 'like' | 'ilike'; value: string }
  | { column: string; operator: 'is'; value: null | boolean }
  | { column: string; operator: 'in'; value: FilterValue[] };

export class FilterBuilder {
  readonly filters: DatabaseFilter[] = [];

  eq(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }
  neq(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }
  gt(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  }
  gte(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }
  lt(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  }
  lte(column: string, value: FilterValue): this {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }
  like(column: string, pattern: string): this {
    this.filters.push({ column, operator: 'like', value: pattern });
    return this;
  }
  ilike(column: string, pattern: string): this {
    this.filters.push({ column, operator: 'ilike', value: pattern });
    return this;
  }
  is(column: string, value: null | boolean): this {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }
  in(column: string, values: FilterValue[]): this {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }
}
