import ts from 'typescript';
import type { MutationCosts } from './mutation-costs.mts';

export interface ShardItem {
  path: string;
  patterns: string[];
  lines: number[];
  typesOnly: boolean;
}

interface WeightedSource {
  path: string;
  lineCount: number;
}

function typeOnlyStatement(statement: ts.Statement): boolean {
  return [
    ts.isInterfaceDeclaration(statement),
    ts.isTypeAliasDeclaration(statement),
    ts.isImportDeclaration(statement) && statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword,
    ts.isExportDeclaration(statement) && statement.isTypeOnly,
    ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) === true,
  ].includes(true);
}

// Stryker finds no mutants in a file of type declarations, and the timings
// never mention one, so it would otherwise cost the unmeasured average.
export function declaresTypesOnly(path: string, source: string): boolean {
  return ts
    .createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    .statements.every((statement) => typeOnlyStatement(statement));
}

// Code without timings, a new file or a new chunk of a measured one, costs the
// measured average per line; with no measurements, every line costs 1.
export function unmeasuredLineCost(sources: Iterable<WeightedSource>, costs: MutationCosts): number {
  let cost = 0;
  let lines = 0;
  for (const source of sources) {
    const measured = costs.get(source.path);
    if (measured !== undefined) {
      cost += [...measured.values()].reduce((total, lineCost) => total + lineCost, 0);
      lines += source.lineCount;
    }
  }
  return cost > 0 && lines > 0 ? cost / lines : 1;
}

export function measuredCost(costs: MutationCosts): number {
  let total = 0;
  for (const lines of costs.values()) {
    for (const cost of lines.values()) {
      total += cost;
    }
  }
  return total;
}

export function itemWeight(item: ShardItem, costs: MutationCosts, unmeasured: number): number {
  if (item.typesOnly) {
    return 0;
  }
  const measured = costs.get(item.path);
  const lines = item.lines.filter((line) => measured?.has(line) === true);
  if (measured === undefined || lines.length === 0) {
    return item.lines.length * unmeasured;
  }
  return lines.reduce((total, line) => total + (measured.get(line) ?? 0), 0);
}
