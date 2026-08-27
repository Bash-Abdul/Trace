# Trace Code Quality Tooling Guide

This is a learning reference for the tools and commands that check the Trace API during development. It explains the repository's current configuration; it does not replace the [authoritative backend engineering plan](./backend-engineering-plan.md) or the [testing glossary](./testing-glossary.md).

## The short version

```text
Prettier   -> makes supported files look consistent
ESLint     -> finds suspicious or unsafe code patterns
TypeScript -> checks whether types fit together
Vitest     -> checks whether implemented behaviour works
Build      -> proves production JavaScript can be generated
CI         -> repeats agreed checks in an independent environment
```

These tools overlap in places, but none replaces all the others.

## What happens when `pnpm verify` runs

From the repository root:

```powershell
pnpm verify
```

currently expands to:

```text
verify
  |
  +-- check
  |     |
  |     +-- format:check
  |     +-- lint
  |     +-- typecheck
  |     +-- test
  |
  +-- build
```

The scripts use `&&`, so execution stops at the first failing stage. If formatting fails, linting and later checks do not run until formatting is corrected.

## Prettier: formatting

### What Prettier does

Prettier rewrites supported files into one consistent visual style. It handles decisions such as:

- quote style;
- semicolons;
- indentation;
- trailing commas;
- wrapping long lines;
- spacing and line breaks.

Trace's root `.prettierrc.json` currently specifies:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

For example, Prettier may turn:

```ts
const result={status:"ready"}
```

into:

```ts
const result = { status: 'ready' };
```

Prettier does not decide whether `result` is correct, safe, or useful. It only formats it.

### `format` versus `format:check`

```powershell
pnpm format
```

Uses `prettier --write`. It changes supported files on disk to match the configured style.

```powershell
pnpm format:check
```

Uses `prettier --check`. It changes nothing and exits with failure when a supported file is not formatted.

Use `format` while developing. Use `format:check` when verifying that the repository is already clean. CI will use the check-only behaviour because CI should report uncommitted formatting changes, not silently rewrite them.

### What Trace currently formats

The API script currently targets:

```text
src/**/*.ts
*.json
*.js
```

from `apps/api`. This covers API TypeScript, API-level JSON files, and JavaScript configuration such as `eslint.config.js`.

The current `.prettierignore` excludes:

```text
node_modules/
dist/
coverage/
.pnpm-store/
pnpm-lock.yaml
apps/api/docs/
```

Consequences of the current setup:

- generated dependencies, builds, and coverage are not formatted;
- the generated pnpm lockfile is not manually reformatted;
- API Markdown documentation is not automatically formatted;
- YAML files such as `compose.yaml` are not currently included in the API format command.

That is why `git diff --check` remains useful for detecting whitespace errors outside Prettier's current scope.

## ESLint: static code analysis

### What linting means

Linting examines source code without running it and reports patterns that are likely incorrect, unsafe, inconsistent, or difficult to maintain.

For example, this is formatted correctly but unsafe:

```ts
checkDatabaseConnection();
```

The function returns a Promise, but nothing waits for or handles it. Trace's ESLint configuration reports this through `no-floating-promises`.

The safer version is:

```ts
await checkDatabaseConnection();
```

Prettier cannot detect that difference because both versions are visually valid.

### Trace's ESLint configuration

`apps/api/eslint.config.js` combines:

- ESLint's recommended JavaScript rules;
- `typescript-eslint` recommended type-checked rules;
- Node.js global definitions;
- project-aware TypeScript analysis.

Trace also explicitly enables:

#### `consistent-type-imports`

Requires imports used only as types to be declared clearly:

```ts
import type { PoolClient } from 'pg';
```

Type-only imports are removed from generated JavaScript and communicate that the import has no runtime value.

#### `no-floating-promises`

Rejects Promises that are started without being awaited, returned, caught, or deliberately marked with `void`.

```ts
// Incorrect: a rejection may become unhandled.
shutdown('SIGTERM');

// Deliberately started; shutdown handles its own errors.
void shutdown('SIGTERM');
```

#### `no-misused-promises`

Detects Promises used in places that expect synchronous values or callbacks. This prevents accidentally handing asynchronous behaviour to an API that cannot handle it correctly.

### What ESLint does not prove

A clean lint result does not prove that:

- business rules are correct;
- SQL is valid;
- the API returns the intended response;
- PostgreSQL is reachable;
- code behaves correctly under concurrency;
- production configuration is safe.

Those concerns require types, tests, database checks, and operational verification.

## TypeScript: type checking

### What `tsc --noEmit` means

Trace runs:

```powershell
pnpm typecheck
```

which invokes:

```powershell
tsc --noEmit
```

`tsc` is the TypeScript compiler. `--noEmit` asks it to analyse the project without generating JavaScript files.

Type checking can catch mistakes such as:

```ts
const port: number = '3000';
```

It can also verify function arguments, return types, imports, object shapes, and type narrowing across the application.

### Important Trace compiler options

#### `strict`

Enables TypeScript's strict family of checks. Values must be handled according to their possible types rather than relying on broad assumptions.

#### `noUncheckedIndexedAccess`

Treats indexed values as possibly absent:

```ts
const firstRow = result.rows[0];
// firstRow may be undefined until checked.
```

This matters for PostgreSQL queries because TypeScript cannot guarantee that a query returned a row.

#### `exactOptionalPropertyTypes`

Distinguishes between an optional property being absent and being explicitly assigned `undefined`. This makes API and domain object shapes more precise.

#### `forceConsistentCasingInFileNames`

Prevents imports whose letter casing does not match the actual filename. This avoids code working on case-insensitive Windows and then failing on case-sensitive Linux.

#### `module` and `moduleResolution`: `NodeNext`

Makes TypeScript follow modern Node.js ESM resolution rules. Trace source imports local modules using `.js` extensions because those are the extensions that exist after compilation:

```ts
import { env } from './config/index.js';
```

#### `noEmit`

The normal TypeScript configuration checks source without writing build output. Production output is handled by the separate build configuration.

### TypeScript is not runtime validation

TypeScript types disappear when JavaScript is generated. External input can still be invalid at runtime.

```ts
interface RegistrationBody {
  email: string;
}
```

That interface does not validate an incoming HTTP body. Trace uses Zod at runtime for environment variables and will use it for API inputs.

## Vitest: behavioural checks

```powershell
pnpm test
```

runs the tests once with `vitest run`.

```powershell
pnpm --filter @trace/api test:watch
```

keeps Vitest running and reruns tests as relevant files change.

Tests answer questions that formatting, linting, and type checking cannot, such as:

- Does `/ready` return `503` when its database check rejects?
- Does an error response contain the same request ID as its header?
- Does environment parsing reject an invalid PostgreSQL URL?

See the [testing glossary](./testing-glossary.md) for test levels, test doubles, assertions, Supertest, and database-testing terms.

## Production build

### Why build separately from type checking

The normal `tsconfig.json` contains `noEmit: true`, so type checking creates no JavaScript. The API build runs:

```powershell
tsc -p tsconfig.build.json
```

`tsconfig.build.json` extends the strict base configuration but changes:

```json
{
  "noEmit": false,
  "rootDir": "./src",
  "outDir": "./dist",
  "sourceMap": true
}
```

The result is runnable JavaScript under `apps/api/dist` plus source maps that help error tooling relate generated JavaScript back to TypeScript.

Test files are excluded from the production build:

```text
src/**/*.test.ts
src/**/*.spec.ts
```

### What a successful build proves

A successful build proves that TypeScript can generate the expected production files. It does not prove that:

- required environment variables exist in deployment;
- PostgreSQL is available;
- migrations have run;
- the deployed service can receive traffic;
- application workflows are correct.

Those require deployment and runtime checks.

## pnpm workspace commands

Trace is a pnpm workspace. The root package coordinates applications under `apps/*` and future shared packages under `packages/*`.

### Root script delegation

The root lint command is:

```json
"lint": "pnpm -r --if-present lint"
```

#### `-r`

Short for `--recursive`. It runs the named script in workspace packages.

#### `--if-present`

Skips a workspace package when that package does not define the requested script instead of failing solely because the script is absent.

This lets the root command remain stable as `apps/web` or shared packages are added later.

### Filtering one workspace package

```powershell
pnpm --filter @trace/api test
```

runs only the API package's test script. This is useful for focused feedback while working inside one application.

### Root versus API commands

Use root commands for the normal project-wide workflow:

```powershell
pnpm verify
```

Use a filter when deliberately checking only the API:

```powershell
pnpm --filter @trace/api typecheck
```

Once the web application exists, root verification can check both applications without requiring you to remember separate command sequences.

## Current commands

| Command | Changes files? | Purpose |
| --- | --- | --- |
| `pnpm format` | Yes | Rewrites supported files using Prettier |
| `pnpm format:check` | No | Verifies supported files are already formatted |
| `pnpm lint` | No with the current script | Runs ESLint static analysis |
| `pnpm typecheck` | No | Checks TypeScript without emitting JavaScript |
| `pnpm test` | Normally no | Runs Vitest once |
| `pnpm check` | No | Runs formatting check, lint, type check, and tests |
| `pnpm build` | Yes, under ignored `dist/` | Generates production JavaScript and source maps |
| `pnpm verify` | Only ignored build output | Runs `check` and then the production build |
| `pnpm dev:api` | Runs a process | Starts the API in TypeScript watch mode |

Some future integration tests will create and remove data inside a dedicated test database. They must never target development or production data accidentally.

## Why local checks and CI both matter

### Local verification

Local commands provide fast feedback before committing:

```powershell
pnpm format
pnpm verify
```

They run with the developer's current Node version, environment, installed dependencies, and local files.

### Continuous integration

CI will check the repository again on GitHub in a clean environment. It protects against differences such as:

- a file that exists locally but was not committed;
- an ignored `.env` masking missing configuration;
- a different operating system or filesystem casing;
- dependencies not reproducible from the lockfile;
- PostgreSQL migrations that only work on an existing local database.

CI does not replace local checks. Local checks shorten feedback; CI provides independent evidence that the committed repository works.

## Reading a failed `pnpm verify`

Find the first failed command in the output.

### Prettier failure

Typical output:

```text
[warn] src/app.ts
Code style issues found
```

Run `pnpm format`, inspect the resulting diff, and run verification again.

### ESLint failure

Typical output includes a filename, line, rule, and message:

```text
error  Promises must be awaited  @typescript-eslint/no-floating-promises
```

Understand the rule before changing the code. Do not automatically disable it or add a type assertion merely to silence it.

### TypeScript failure

Typical output includes an error code:

```text
error TS2345: Argument of type ... is not assignable to ...
```

Compare the expected and supplied types. Determine whether the runtime data, function contract, or type definition is incorrect.

### Test failure

Vitest reports the failing test name, expected value, received value, and stack location. Decide whether the implementation is wrong, the requirement changed, or the test expectation is incorrect.

### Build failure

A build can fail after earlier checks if production-specific file inclusion, output, or module resolution is incorrect. Do not assume a passing type check guarantees correct emitted output.

## Checks that will be added later

The engineering plan requires more than the current `verify` command. These checks enter when their dependencies exist:

### During the PostgreSQL foundation

- PostgreSQL integration tests;
- clean-database migration tests.

### When the API contract exists

- OpenAPI validation;
- checks that implementation and documented contracts agree.

### Before external deployment and real users

- dependency vulnerability scanning;
- secret scanning;
- principal security and end-to-end workflows;
- deployment and migration verification.

These are not replaced by the current unit and HTTP application tests. They are also not introduced before there is something meaningful for them to validate.

## Practical workflow

While actively coding:

```powershell
pnpm --filter @trace/api test:watch
```

At a useful checkpoint:

```powershell
pnpm format
pnpm verify
git diff --check
git status --short
```

Before pushing, inspect what is staged rather than treating a successful tool command as proof that the correct files were selected.

## Principles for Trace

- Use automation to catch repeatable mistakes, not to avoid understanding errors.
- Keep formatter and lint rules central rather than editor-specific.
- Prefer fixing the cause over disabling a rule.
- Add checks when the relevant code or risk enters the project.
- Keep local and CI commands aligned.
- Treat passing checks as evidence, not proof that the product is correct or production-ready.

