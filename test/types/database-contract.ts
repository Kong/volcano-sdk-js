import { databaseConnectionString, type DatabaseConnectionStringOptions } from '../../src/index.js';

type ExistingOptions = { userId?: string | null };
type ExistingFunction = (base: string, options?: ExistingOptions) => string;

declare const existingOptions: ExistingOptions;
declare const existingFunction: ExistingFunction;
declare const currentOptions: DatabaseConnectionStringOptions;

const acceptsExistingOptions: DatabaseConnectionStringOptions = existingOptions;
const preservesExistingOptions: ExistingOptions = currentOptions;
const acceptsExistingFunction: typeof databaseConnectionString = existingFunction;
const preservesExistingFunction: ExistingFunction = databaseConnectionString;

void [
  acceptsExistingOptions,
  preservesExistingOptions,
  acceptsExistingFunction,
  preservesExistingFunction,
];
