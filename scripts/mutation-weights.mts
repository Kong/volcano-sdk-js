import { existsSync } from 'node:fs';
import ts from 'typescript';
import type { MutationCosts } from './mutation-costs.mts';

export interface ShardItem {
  path: string;
  patterns: string[];
  lines: number[];
  mutantFree: boolean;
}

interface WeightedSource {
  path: string;
  lineCount: number;
}

// Statements Stryker never mutates: type declarations, imports, re-exports,
// and ambient declarations.
function mutantFreeStatement(statement: ts.Statement): boolean {
  return [
    ts.isInterfaceDeclaration(statement),
    ts.isTypeAliasDeclaration(statement),
    ts.isImportDeclaration(statement),
    ts.isExportDeclaration(statement),
    ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) === true,
  ].includes(true);
}

// The lines of statements Stryker can mutate. A file or chunk outside them has
// no mutants and no timings, so it would otherwise cost the unmeasured average.
export function runtimeLines(path: string, source: string): Set<number> {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const lines = new Set<number>();
  for (const statement of sourceFile.statements) {
    if (!mutantFreeStatement(statement)) {
      const first = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
      const last = sourceFile.getLineAndCharacterOfPosition(statement.end).line + 1;
      for (let line = first; line <= last; line += 1) {
        lines.add(line);
      }
    }
  }
  return lines;
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

// Only files that still exist: a deleted or renamed file's old timings would
// otherwise raise the split target and keep costly files whole.
export function measuredCost(costs: MutationCosts): number {
  let total = 0;
  for (const [path, lines] of costs) {
    if (existsSync(path)) {
      for (const cost of lines.values()) {
        total += cost;
      }
    }
  }
  return total;
}

export function itemWeight(item: ShardItem, costs: MutationCosts, unmeasured: number): number {
  if (item.mutantFree) {
    return 0;
  }
  const measured = costs.get(item.path);
  const lines = item.lines.filter((line) => measured?.has(line) === true);
  if (measured === undefined || lines.length === 0) {
    return item.lines.length * unmeasured;
  }
  return lines.reduce((total, line) => total + (measured.get(line) ?? 0), 0);
}
