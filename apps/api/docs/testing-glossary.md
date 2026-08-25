# Trace Testing Glossary

This is a learning reference for the testing language used while building the Trace API. It explains terms and tools; it does not define product requirements or replace the [authoritative backend engineering plan](./backend-engineering-plan.md).

## The testing tools, from the beginning

### Vite

**Vite** is primarily a development server and build tool for web applications. It provides fast module loading and code transformation during development.

The Trace API does not currently use Vite to run the backend application. The similar name matters because Vitest reuses parts of Vite's transformation system.

### Vitest

**Vitest** is Trace's test framework and test runner. It discovers test files, executes their test cases, provides functions such as `describe`, `it`, `expect`, and `vi`, and reports which tests passed or failed.

Trace test files currently follow the `*.test.ts` naming pattern. Running:

```powershell
pnpm test
```

eventually runs:

```powershell
vitest run
```

`vitest run` executes the tests once and exits. The separate watch command keeps Vitest running and reruns affected tests when files change.

Vitest is related to Vite, but they are not the same tool:

```text
Vite     -> development and build tooling
Vitest   -> automated test framework and runner
```

### Supertest

**Supertest** is a library for exercising HTTP applications in tests. It can pass a request directly through an Express application without starting a real server or opening a network port.

```ts
const response = await request(app).get('/health');
```

In that example:

- `request(app)` gives the Express application to Supertest;
- `.get('/health')` constructs an HTTP-style `GET` request;
- `await` waits for Express and its middleware to produce a response;
- `response` contains the status, headers, and body for assertions.

Supertest exercises the real Express routing and middleware stack. It does not automatically make a test end-to-end because dependencies such as PostgreSQL may still be replaced with test doubles.

### How Vitest and Supertest work together

```text
pnpm test
   |
   v
Vitest finds app.test.ts
   |
   v
Vitest runs one it(...) test case
   |
   v
Supertest sends a request through createApp()
   |
   v
Express middleware and route produce a response
   |
   v
Vitest expect(...) assertions verify the response
```

Vitest controls the test lifecycle and assertions. Supertest performs the HTTP interaction inside those tests.

## Tools do not determine the test level

Vitest is not limited to unit tests, and using Supertest does not automatically make a test an integration test. The category depends on the **scope and real boundaries exercised**, not the library used.

Vitest can run all of these:

- a unit test for one permission function;
- an HTTP application test through Express and Supertest;
- a repository integration test against real PostgreSQL;
- a migration test against a clean database;
- a broader workflow test involving several modules.

Supertest only supplies HTTP-style requests and responses. The dependencies behind the Express route decide how broad the test is.

### Unit test

A unit test exercises a small piece of logic in isolation from infrastructure.

```ts
expect(canApproveMilestone(author)).toBe(false);
```

That test would call one policy function without Express, PostgreSQL, email, or file storage. Vitest runs it, but Vitest is not what makes it a unit test.

Trace's environment parser tests are also unit tests: they pass plain objects into `parseEnvironment` and inspect the result without starting the API or connecting to PostgreSQL.

### HTTP application test

An HTTP application test sends a request through the real Express middleware and route stack, while replacing selected infrastructure dependencies.

```text
Supertest
   -> request logger
   -> Express route
   -> injected database-check test double
   -> HTTP response
```

Trace's `/ready` tests currently fit this category. They integrate several application pieces, but they do not use real PostgreSQL because the database check is injected. These tests are sometimes called component tests or lightweight integration tests; Trace uses **HTTP application test** to make the boundary explicit.

### PostgreSQL integration test

A PostgreSQL integration test exercises Trace code together with a real PostgreSQL database.

```text
Vitest
   -> repository or service
   -> pg connection
   -> real test database
   -> actual SQL constraints and results
```

Supertest is not required. A repository integration test can call a repository function directly. Conversely, a broader HTTP integration test could use Supertest while also allowing the route to reach the real test database.

These tests prove behaviour that a mock cannot prove, such as SQL correctness, unique constraints, transaction rollback, row locking, and database-generated values.

### End-to-end test

An end-to-end test exercises a complete workflow through the system's real boundaries with as few replaced dependencies as practical.

For example:

```text
register
   -> verify email token
   -> log in
   -> create project
   -> persist everything in PostgreSQL
```

Vitest may still coordinate this test, and Supertest may still send its API requests. What makes it end-to-end is the breadth of the real workflow, not those tools.

### Trace examples at a glance

| Test | Runner/tool | Real boundary | Trace category |
| --- | --- | --- | --- |
| `parseEnvironment(...)` | Vitest | One function | Unit test |
| `canApproveMilestone(...)` | Vitest | One policy | Unit test |
| `GET /health` through Express | Vitest + Supertest | Express middleware and route | HTTP application test |
| `GET /ready` with an injected database check | Vitest + Supertest + test double | Express, not PostgreSQL | HTTP application test |
| Repository query against test PostgreSQL | Vitest + `pg` | Real PostgreSQL | PostgreSQL integration test |
| API request that writes to test PostgreSQL | Vitest + Supertest + `pg` | Express and real PostgreSQL | HTTP integration test |
| Registration through verified login | Vitest, possibly Supertest | Complete real workflow | End-to-end test |

## A current Trace test, translated

```ts
it('reports ready when PostgreSQL responds', async () => {
  const databaseCheck = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);

  const app = createApp({
    checkDatabaseConnection: databaseCheck,
  });

  const response = await request(app).get('/ready');

  expect(response.status).toBe(200);
  expect(databaseCheck).toHaveBeenCalledTimes(1);
});
```

- `it(...)` defines one test case and describes the expected behaviour.
- `async` allows the test to `await` asynchronous work.
- `vi.fn()` creates a controllable test function.
- `Promise<void>` says the function completes asynchronously without returning a value.
- `mockResolvedValue(undefined)` makes that function simulate success.
- `createApp({...})` injects the controlled function instead of using the real database check.
- `request(app).get('/ready')` sends an in-process HTTP request through Supertest.
- `expect(...)` makes an assertion about the result.
- `toHaveBeenCalledTimes(1)` verifies an interaction, not just the HTTP response.

## Core terms

### Test runner

The program that discovers and executes tests. Trace uses **Vitest**.

### Test suite

A related group of tests, normally created with `describe(...)`:

```ts
describe('GET /ready', () => {
  // Related readiness tests live here.
});
```

### Test case

One independently reported behaviour, normally created with `it(...)` or `test(...)`. Trace uses descriptive sentences that say what should happen.

### System under test (SUT)

The code being exercised. In an HTTP test this might be the Express application; in a service unit test it might be one service function.

### Assertion

A statement that must be true for the test to pass:

```ts
expect(response.status).toBe(200);
```

### Matcher

The assertion operation after `expect`, such as:

- `toBe(...)` for exact primitive equality;
- `toEqual(...)` for object or array structure;
- `toMatch(...)` for a string or regular expression;
- `toHaveBeenCalledTimes(...)` for calls to a test function;
- `rejects.toThrow(...)` for an expected rejected Promise.

## Arrange, Act, Assert

A common way to read and organise a test:

```ts
// Arrange: prepare inputs and controlled dependencies.
const databaseCheck = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const app = createApp({ checkDatabaseConnection: databaseCheck });

// Act: perform the behaviour being tested.
const response = await request(app).get('/ready');

// Assert: verify the observable result.
expect(response.status).toBe(200);
```

Comments are useful while learning, but a well-named test should eventually make these stages apparent without labelling every line.

## Setup and cleanup

### `beforeEach`

Runs before every test in its surrounding suite. Use it when each test needs a fresh instance or repeated setup.

### `afterEach`

Runs after every test. It commonly restores mocks, clears timers, or removes data created by a test.

### `beforeAll` and `afterAll`

Run once for a suite. PostgreSQL integration tests may use them to open and close shared infrastructure, while still resetting database state between individual tests.

### Test isolation

One test must not depend on another test running first or leave state that changes another test's outcome. An isolated test can run alone, in a different order, or alongside other tests.

## Asynchronous testing

### Promise

An object representing work that will complete later. Database calls and HTTP requests return Promises.

### Resolved Promise

Successful asynchronous work. `mockResolvedValue(value)` creates this behaviour.

### Rejected Promise

Failed asynchronous work. `mockRejectedValue(error)` is useful for testing database failures or rejected operations.

### `async` and `await`

An `async` function returns a Promise. `await` pauses that function until the Promise settles and allows `try/catch` to handle a rejection.

Forgetting `await` can let a test or route finish before the operation being checked has completed.

## Test doubles

A **test double** replaces a real collaborator during a test. Developers often casually call all test doubles “mocks,” but the distinctions explain their purpose.

### Dummy

A required value that is passed but never used by the behaviour under test.

### Stub

Returns a controlled result:

```ts
const databaseCheck = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
```

### Fake

A lightweight working implementation, such as an in-memory email sender that records messages instead of sending real email.

### Spy

Records how a function was called so the test can inspect the interaction.

### Mock

A test double configured with expected interactions. `vi.fn()` can act as a stub, spy, or mock depending on how the test uses it.

### Over-mocking

Replacing so much real code that the test mainly proves its mocks were configured correctly. Trace should mock external boundaries in unit tests but use real PostgreSQL in database integration tests.

## Dependency injection

Supplying a dependency from outside instead of creating or importing it invisibly inside the behaviour being tested:

```ts
createApp({
  checkDatabaseConnection: databaseCheck,
});
```

Production supplies the real PostgreSQL check. Tests supply controlled success or failure. This makes tests deterministic without adding test-only routes or contacting live infrastructure.

## Vitest terms used by Trace

### `vi.fn()`

Creates a function whose behaviour and calls can be controlled and inspected.

### `mockResolvedValue(value)`

Makes a test function return a successfully resolved Promise.

### `mockRejectedValue(error)`

Makes it return a rejected Promise.

### `clearMocks`

Clears recorded call history between tests while retaining mock implementations.

### `restoreMocks`

Restores spied-on functions to their original implementations after tests.

## Supertest terms

### In-process HTTP test

Supertest sends a request directly through the Express application. It exercises routing and middleware without calling `app.listen()` or opening a real network port.

### Response

The captured HTTP result, including:

- `response.status` for the status code;
- `response.body` for parsed JSON;
- `response.headers` for headers such as `x-request-id`;
- `response.type` for the response media type.

## TypeScript terms that appear in tests

### Type inference

TypeScript determines a type from context instead of requiring an explicit annotation.

### `unknown`

A value whose shape has not been proven. It is safer than `any` because code must narrow or validate it before using its properties.

### Type narrowing

A runtime check that lets TypeScript learn a more specific type:

```ts
if (typeof requestId === 'string') {
  // requestId is known to be a string here.
}
```

### Generic type argument

The type supplied inside angle brackets:

```ts
vi.fn<() => Promise<void>>()
```

Here it describes a function with no arguments that returns `Promise<void>`.

### `ReturnType<typeof createApp>`

A TypeScript utility that obtains the return type of `createApp` without writing that type manually. Use it when it improves clarity; a simple inferred `const app = createApp()` is often enough.

## Test levels Trace will use

### Unit test

Tests a small piece of logic without real infrastructure. Examples include permission policies, state transitions, token-purpose rules, and final-checklist calculations.

### HTTP application test

Runs requests through the Express application with Supertest while replacing selected external dependencies. The current health, readiness, request-ID, and error-response tests fit here.

### PostgreSQL integration test

Runs real SQL against an isolated PostgreSQL test database. These tests prove constraints, transactions, locking, migrations, and repository mappings that a mock cannot prove.

### API contract test

Checks that routes, request bodies, responses, status codes, and the OpenAPI document agree.

### End-to-end test (E2E)

Exercises a complete user workflow across the real application boundaries, such as registration through email verification and login. E2E tests are broader and slower than unit tests.

### Migration test

Creates a clean database, applies every migration in order, and verifies that the resulting schema works. It protects new deployments from migrations that only work on a developer's existing database.

### Security test

Exercises a security rule or abuse case, such as cross-project access denial, session use after revocation, CSRF rejection, or token replay.

### Concurrency test

Runs operations at nearly the same time to prove database rules under races—for example, preventing two active main Reviewers or two consumers of one invitation token.

## Database-testing terms coming later

### Fixture

Known data prepared for a test, such as a user, project, or invitation in a specific state.

### Test factory

A helper that creates valid fixtures while allowing each test to override relevant fields.

### Seed data

Known baseline data inserted for an environment. Trace's four built-in templates are version-controlled product seed data, not disposable test fixtures.

### Database reset

Returning the test database to a known empty or baseline state between tests.

### Transaction rollback in tests

Running test setup and actions in a transaction that is rolled back afterward. This can provide fast cleanup, but it is unsuitable when the behaviour itself needs multiple connections or committed visibility.

### Idempotency

The property that safely repeating an operation does not create duplicate effects. Tests will verify this for invitations, notifications, final requests, and background work.

### Race condition

A bug whose result depends on the timing of concurrent operations. Database constraints, row locks, conditional updates, and concurrency tests protect Trace's role and approval invariants.

## Test-quality terms

### Deterministic test

Produces the same result from the same starting state. Tests should control time, randomness, dependencies, and data where these could change the result.

### Flaky test

Sometimes passes and sometimes fails without a relevant code change. Common causes include shared state, real network calls, timing assumptions, and incomplete asynchronous cleanup.

### Regression test

A test added for a discovered bug so that the same failure cannot silently return.

### Test coverage

A measurement of which code was executed by tests. Coverage can reveal untested areas, but a high percentage does not prove that important business rules or failure cases were tested well.

### Happy path

The expected successful workflow.

### Failure path

A rejected, invalid, unavailable, stale, unauthorised, or conflicting workflow. Trace's risk is concentrated in failure paths and state transitions, so they require deliberate tests.

## Practical rules for Trace tests

- Test externally observable behaviour and important domain invariants.
- Use controlled dependencies for fast unit and HTTP application tests.
- Use real PostgreSQL for SQL, migrations, constraints, transactions, and locking.
- Never run automated tests against production data.
- Keep each test independent and make its starting state explicit.
- Assert meaningful outcomes, not private implementation details.
- Test both success and failure paths.
- Add abstractions only when repeated test setup makes them useful.
- Prefer readable test code over clever generic helpers.
