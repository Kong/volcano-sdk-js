/** Values accepted by the database filter builders. */
export type FilterValue = string | number | boolean | null | Date;

export type DatabaseFilter =
  | { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: FilterValue }
  | { column: string; operator: 'like' | 'ilike'; value: string }
  | { column: string; operator: 'is'; value: null | boolean }
  | { column: string; operator: 'in'; value: FilterValue[] };

export interface FilterTarget {
  filters: DatabaseFilter[];
}

export const FilterMixin = {
  eq<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  },
  neq<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  },
  gt<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  },
  gte<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  },
  lt<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  },
  lte<T extends FilterTarget>(this: T, column: string, value: FilterValue): T {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  },
  like<T extends FilterTarget>(this: T, column: string, pattern: string): T {
    this.filters.push({ column, operator: 'like', value: pattern });
    return this;
  },
  ilike<T extends FilterTarget>(this: T, column: string, pattern: string): T {
    this.filters.push({ column, operator: 'ilike', value: pattern });
    return this;
  },
  is<T extends FilterTarget>(this: T, column: string, value: null | boolean): T {
    this.filters.push({ column, operator: 'is', value });
    return this;
  },
  in<T extends FilterTarget>(this: T, column: string, values: FilterValue[]): T {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  },
};
