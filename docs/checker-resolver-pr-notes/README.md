# Checker type resolver: PR justification notes

Reference notes for the upstream PR that adds `typeResolver: "checker"` to tsoa. The implementation is on `main`.

## The short version

tsoa's type resolver rebuilds TypeScript's type system from source syntax. It walks annotations node by node and substitutes generics by name. The TypeScript checker already computes every one of these types correctly.

Every TypeScript feature tsoa doesn't hand-copy becomes an "Unknown type" error, or worse, a wrong schema with no error. So the issue tracker keeps refilling with the same kinds of bugs, fixed one node kind at a time.

This PR adds a second resolver. It takes types from the checker and uses syntax only for names and annotations. It sits behind a setting, `typeResolver: "checker"`, and changes nothing by default. It reproduces today's component names exactly wherever the current resolver is correct, and it is checked against the current resolver on every fixture.

## What it fixes

Each item below is pinned by a test in `tests/fixtures/checker/`, and each fails or misbehaves in legacy mode.

### Legacy throws, checker resolves

| Construct | Legacy | Related issues |
|---|---|---|
| `typeof config` (a const object) | `Unknown type: TypeQuery` | #737, #1083, #1026 |
| `Params[Kind.A]` (indexed by an enum member) | `Unknown type: IndexedAccessType` | #1589 |
| `(typeof ROLES)[keyof typeof ROLES]` | `Unknown type: IndexedAccessType` | #1375 |
| Indexed access into an imported value | throws (the existing suite asserts the failure) | |
| `Uppercase<'a' \| 'b'>` and other intrinsic string types | `Unknown type: IntrinsicKeyword` | #883, #1623 |
| `` `user_${string}` `` | throws | #1784 |
| `Exclude<Union, { type: 'c' }>` over a discriminated union | stack overflow | |

### Legacy emits a wrong schema with no error

These are the dangerous ones, because the generated runtime validation enforces the wrong shape.

- **Utility types inside generic aliases come out empty (#1764).** `type OnlyRequire<T, K> = Partial<T> & Required<Pick<T, K>>` produces `{} & {}`. Legacy evaluates `Partial<T>` against the unbound `T`.
- **Inherited properties go missing in models that reference each other (#1124).** With `interface Item extends BaseModel` where `BaseModel.items: Item[]`, `Item` loses `items`. The existing fixtures show the same bug: `TestSubModel2` and `TestSubModelNamespace.TestSubModelNS` lose `id`, `email` and `circular` today.
- **Validators are lost through `Omit`/`Pick` (#1543, #1531).** An `id: UUID` field whose alias has `@pattern` loses both the `UUID` model and the pattern.
- **`NonNullable<number | null>`** comes out as an intersection that still contains `null`. Checker mode gives `double`.
- **Strict mode only:** `Record<'id', string>` and `Omit` of a `Partial<…>` both come out as `{}`.
- **Constructor parameter properties seen through `Pick`/`Omit`** are typed `any`.
- **`Record<string, any>`** loses its `additionalProperties` when reached through a defaulted type parameter.
- **`T | string` with `T = string`** is emitted as `string | string`.

In a representative set of 20 common patterns, legacy got 9 wrong: 6 throw and 3 are silently wrong. The checker resolver gets all 9 right.

Every intended difference from legacy is listed with a reason and issue number in `tests/differential/knownDifferences.ts`, so reviewers can audit each one.

## Why the old resolver needed replacing, not patching

These are architectural problems. Patching individual symptoms keeps regenerating the same bug classes.

1. **There are two generic-substitution systems that never meet.**
   - tsoa keeps its own map from type-parameter names to source nodes. For mapped and conditional types it switches to the checker, but asks about the generic declaration with `T` still unbound. That is the #1764 bug.
   - It then converts the checker's answer back into syntax (`typeToTypeNode`) and walks that again. This loses symbols, and with them the JSDoc (#1543). It also produced the old truncation bugs (#749, #1033, #1185).
   - Fixing this properly means carrying checker types everywhere, and at that point the old machinery is dead code.
2. **Model identity is a mangled string of source text, held in module-wide caches.**
   - Two different types can produce the same string, and one type written two ways produces two strings.
   - The caches live at module level, so results leak between generic contexts and between runs. That is behind the declaration-order-dependent output (#1267) and the regex slowdowns (#1746).
3. **Declarations are found by name matching, not by symbol.** Renamed imports, namespaces and duplicate paths all go through string comparison.
4. **Cycles are handled with placeholders that are filled in later.** Inheritance copies properties out of a base that is still being built, which is #1124.

The maintainers have said the same. In #1673, WoH wrote that the way forward is "to leverage the TS type checker more". The new code does exactly that.

## Why it's easier to work with from here on

- **New TypeScript features mostly work automatically.** Conditional types, key remapping, intrinsics and whatever comes next are evaluated by the checker. tsoa only classifies the result (string, union, object, …), so a new feature rarely needs new code.
- **There is one place to look.** All classification happens in one dispatch in `checkerTypeResolver.ts`. "Where are unions handled?" has a single answer.
- **Small modules with one job each,** listed in the size table below. No module-level state.
- **Wrong output fails loudly.** The model registry enforces one component name per type. If a model would ever be built from a type it doesn't describe, generation stops with an error instead of shipping a wrong schema.
- **Every change can be measured.** `yarn diff:resolvers` (in `tests/`) generates metadata for every fixture with both resolvers and reports any difference at the level of individual values. A contributor fixing a type bug sees exactly what changed and where, instead of hoping the test suite happens to cover it.
- **Compatibility is pinned.** The naming code is a line-for-line port, tested against legacy's output for every type reference in the fixtures, so component names and `$ref`s don't move.

## Code size: old vs new

| | Old (legacy) | New (checker) |
|---|---|---|
| Total lines | 1,744 | 1,631 |
| Code lines (no blanks or comments) | 1,421 | 1,287 |
| Files | 7 (`typeResolver.ts` + 6 transformers) | 12 (11 in `checker/` + `typeResolverMode.ts`) |
| Largest file | 1,297 (`typeResolver.ts`) | 343 (`checkerTypeResolver.ts`) |

| New file | Lines | Job |
|---|---|---|
| `checkerTypeResolver.ts` | 343 | the single classification step |
| `members.ts` | 299 | object properties and inheritance |
| `naming.ts` | 268 | line-for-line port of legacy naming |
| `written.ts` | 159 | what source syntax says about a type |
| `models.ts` | 106 | named models (aliases, enums, interfaces) |
| `site.ts` | 101 | syntax carried alongside each type |
| `internals.ts` | 85 | the only file touching compiler internals |
| `annotations.ts` | 82 | JSDoc and decorators |
| `declarations.ts` | 58 | finding declarations by symbol |
| `registry.ts` | 57 | model storage, cycles, the one-name-one-type check |
| `specialTypes.ts` | 42 | `Date`, `Buffer`, `Promise`, … |

- **About 270 of the new lines are legacy's naming, ported rather than redesigned.** That's deliberate, to keep component names stable. The code that actually works out schemas from types is roughly 1,000 lines, against the old resolver's ~1,400 code lines.
- **The new code handles strictly more.** It handles every construct the old resolver did, plus the ones listed above that legacy throws on or gets wrong.
- **Most of the PR is tests and tooling.** The whole PR is +3,568 / −23 lines across 53 files. About 1,740 of those lines are new tests, checker fixtures, and the comparison and timing scripts.
- **Legacy stays in place while it's the default.** The PR adds code rather than replacing it. Once the maintainers flip the default and remove legacy, the old ~1,740 lines (and the duplicated naming logic) go away.

## Evidence to cite in the PR

- **Default mode is unchanged.** Legacy is the default, and the full suite passes: 2,236 tests.
- **The full suite also passes in checker mode:** 2,235 tests. The one skipped test asserts the legacy failure on indexed access, and a replacement test asserts the correct checker output.
- **The comparison is clean:** 87 fixture entries, 0 unexplained differences in both non-strict and strict programs. It started at 646 when checker mode was first switched on.
- **No performance cost:** 1.00× legacy generation time on the fixture set.
- **CI:** a new required job runs the suite in checker mode, both comparison modes and the timing check.

## Questions reviewers are likely to ask

- **"Why not keep patching?"** Point to the four structural problems above. Each patch adds another "ask the checker, then convert back to syntax" step, which makes problem 1 worse.
- **"Does it depend on compiler internals?"** A few, all confined to `internals.ts`, each documented, and each with a fallback:
  - `getUnionType`;
  - `syntheticOrigin`, which the old resolver also uses;
  - a brief symbol-flags workaround for constructor-parameter JSDoc (legacy makes the same change permanently).
- **"Why does it keep legacy quirks?"** Some legacy oddities are kept on purpose so existing specs don't change: reversed property order in object literals, duplicate inherited properties, and unions of single-value enums. They can be cleaned up separately, behind a naming option.
- **"Has it been tested on TypeScript 5.7?"** Only TypeScript 6.0.3 was available locally. CI covers 5.x.
- **"Is legacy going away?"** Not in this PR. Flipping the default and removing legacy is for the maintainers to decide later.
