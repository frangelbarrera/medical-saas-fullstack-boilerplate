# Contributing to Medical SaaS Boilerplate

Thanks for your interest in contributing! This is a security-focused medical SaaS boilerplate, so contributions must meet a high bar for code quality, security, and HIPAA-awareness.

## Code of Conduct

Be respectful. Be constructive. Harassment of any kind will not be tolerated.

## How to Contribute

### Reporting Bugs

Open a GitHub issue with:

1. **Clear title** describing the problem.
2. **Steps to reproduce** (numbered list, exact commands or UI clicks).
3. **Expected vs actual behavior**.
4. **Environment**: OS, Node version, browser, deployment mode (dev/mock-DB vs prod/Postgres).
5. **Logs** (redact any PHI or secrets before pasting).
6. **Screenshots** if applicable.

### Reporting Security Vulnerabilities

**Do NOT open a public issue for security vulnerabilities.** See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

### Suggesting Enhancements

Open a GitHub issue with the `enhancement` label:

1. **Use case**: what problem does this solve?
2. **Proposed solution**: how would it work?
3. **Alternatives considered**: what other approaches did you reject, and why?
4. **HIPAA impact**: does this touch PHI? If yes, how is it encrypted, audited, and access-controlled?

## Development Setup

```bash
git clone https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate.git
cd medical-saas-fullstack-boilerplate
npm install

# Generate secrets
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # ENCRYPTION_KEY
openssl rand -hex 16  # PAYMENT_WEBHOOK_SECRET

cp .env.example .env
# Edit .env and fill in the generated secrets

# Run in dev mode (Vite HMR + tsx watch)
npm run dev
```

## Coding Standards

### TypeScript
- **Strict mode is enabled** in `tsconfig.json`. All code must pass `npm run typecheck`.
- Avoid `any` — use `unknown` and narrow with type guards, or define proper interfaces.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Use `const` by default; `let` only when reassignment is needed; never `var`.

### Security Checklist (Required for PRs)

Every PR that touches the backend must verify:

- [ ] **No new `console.log` of PHI** (names, DNI, emails, phones, diagnoses). Use the logger with PHI redaction.
- [ ] **No new endpoints without RBAC**. Every authenticated endpoint must have `requireRole(...)` if it's privileged.
- [ ] **No new IDOR**. Every query must filter by `req.user.clinicId` from the JWT, not from the request body or query string.
- [ ] **No new `Math.random()` for IDs**. Use `crypto.randomUUID()`.
- [ ] **No new `err.message` leaks**. Catch blocks must return generic error messages (`"Internal server error"`) and log the real error server-side.
- [ ] **No new dependencies without justification**. If you add a dep, explain why an existing one can't do the job.
- [ ] **PHI fields encrypted**. Any new column storing PHI must go through `encryptPHI` / `decryptPHI`.
- [ ] **Audit trail updated**. Any new state-changing endpoint must call `appendAuditLog()`.
- [ ] **Tests added**. New endpoints need at least one test in `tests/api.test.ts`.

### Frontend
- **No `dangerouslySetInnerHTML`** without explicit justification and sanitization.
- **No PHI in `localStorage`**. Use `sessionStorage` (cleared on tab close) or in-memory state.
- **No client-side secret keys**. All API keys stay server-side.
- **Use named imports** for `lucide-react` icons (`import { Heart } from 'lucide-react'`), not `import * as LucideIcons`.

### Commit Messages

Follow Conventional Commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: new feature
- `fix`: bug fix
- `refactor`: code change that neither adds a feature nor fixes a bug
- `test`: adding or correcting tests
- `docs`: documentation only
- `chore`: build, deps, config, tooling
- `security`: security fix (use this for any change that closes a vulnerability)

Scopes: `auth`, `rbac`, `idor`, `csrf`, `encryption`, `audit`, `payment`, `frontend`, `infra`, `ci`, `db`, `ai`, `docs`.

Example:
```
fix(security): add requireRole('ADMIN') to /api/admin/populate

The populate endpoint was accessible to any authenticated user, allowing
non-admins to inject synthetic patients/appointments into the clinic's
data. Apply the RBAC middleware to restrict to ADMIN role only.
```

### Pull Requests

1. **Fork and branch** from `main`: `git checkout -b fix/my-bugfix`.
2. **One concern per PR**. Don't mix a bug fix with a refactor.
3. **Tests must pass**: `npm test`.
4. **Typecheck must pass**: `npm run typecheck`.
5. **Build must pass**: `npm run build`.
6. **Audit must pass**: `npm audit --audit-level=high`.
7. **Update the README** if your change adds, removes, or renames a feature.
8. **Document security implications** in the PR description if your change touches auth, encryption, RBAC, or audit.

### PR Description Template

```markdown
## What
<one-paragraph summary>

## Why
<the problem this solves>

## How
<key implementation decisions>

## Security Impact
- [ ] Touches authentication: yes/no
- [ ] Touches authorization (RBAC): yes/no
- [ ] Touches PHI encryption: yes/no
- [ ] Touches audit trail: yes/no
- [ ] Touches payment flow: yes/no
- [ ] Adds new dependencies: yes/no (if yes, list)

## Testing
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Manually tested in dev mode

## Checklist
- [ ] Code follows the style guide
- [ ] Self-reviewed
- [ ] Comments added for complex logic
- [ ] Documentation updated (README, SECURITY, DEPLOYMENT as needed)
- [ ] No new `console.log` of PHI
- [ ] No new `any` types
- [ ] No new `Math.random()` for IDs
```

## Testing

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:ci
```

Tests use Vitest. Integration tests spawn the server as a child process with test env vars. See `tests/` for examples.

When adding a new endpoint, add at minimum:
- One test for the happy path (200/201).
- One test for unauthenticated access (401).
- One test for unauthorized role (403).
- One test for IDOR (404 when accessing another clinic's resource).

## Release Process

1. Update `package.json` version (semver).
2. Update `CHANGELOG.md` (if it exists) with the changes.
3. Tag the release: `git tag v1.x.y && git push origin v1.x.y`.
4. GitHub Actions will build and (if configured) deploy.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
