# auth-system: 1-week roadmap to an intermediate-level project

**Goal:** turn this working NestJS + React JWT demo into a secure, tested, documented auth service that a reviewer would call "production-minded".

## Where it stands today (analysis, 2026-11-19)

**What's already good**
- Short-lived access token (15 min) and long-lived refresh token (7 days)
- Refresh token in an `httpOnly`, `sameSite=strict` cookie scoped to `/auth/refresh`
- Refresh token rotation, with every token tracked in the DB by `jti` and revocable
- bcrypt password hashing
- Client keeps the access token in memory (not localStorage) and auto-refreshes on 401

**Critical problems**
| # | Problem | Where |
|---|---|---|
| 1 | MySQL root password hardcoded and committed to a **public** repo | `auth-backend/src/app.module.ts:15` |
| 2 | JWT secret is the literal `'secretKey'` (5 places), and access and refresh share one secret | `auth.service.ts`, `jwt.strategy.ts` |
| 3 | `/users/me` and `/users/register` return the **password hash** | `users.service.ts` (`findById`, `create`) |
| 4 | Sign-up is broken: the client posts to `/auth/register`, but the API route is `/users/register` | `auth-client/src/context/AuthContext.tsx:35` |
| 5 | `console.log(req)` on refresh writes cookies and tokens to the logs | `auth.controller.ts:24` |
| 6 | No input validation (any body is accepted), and a duplicate email causes a 500 error | controllers |
| 7 | `synchronize: true`, which auto-alters the DB schema and can drop data | `app.module.ts:18` |

**Other gaps**
- No rate limiting on login (brute force), no `helmet`, CORS origin hardcoded
- Refresh token reuse isn't detected (a stolen, already-rotated token just fails silently and doesn't revoke the family)
- Race condition: React StrictMode plus multiple 401s fire parallel `/auth/refresh` calls. The second one hits a revoked token and can log the user out.
- `/users/summary` returns fake hardcoded data
- No roles or permissions
- Tests: only the default "Hello World" test. The e2e test needs a live MySQL.
- 6 lint errors, 6 npm vulnerabilities in the client, default boilerplate READMEs
- UI: unstyled forms and `alert()` popups (MUI is installed but unused)
- No Docker setup, no CI, no API docs, 1 commit in total

---

## The plan (about 2–4 hours a day)

### Day 1: Lock down security and config
- [ ] **Rotate the leaked MySQL password** (anyone can read it on GitHub) and stop using `root`
- [x] Add `@nestjs/config` with a validated `.env` (DB settings, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`), and commit a `.env.example`
- [x] Use separate secrets for access and refresh tokens, read once from config
- [x] Remove `console.log(req)` and the inline `require('bcrypt')`
- [x] Fix the register URL bug in the client
- [x] Fix all lint errors
- **Done when:** no secrets in the code, the app runs from `.env`, and sign-up works end to end

### Day 2: Validation, errors and safe responses
- [ ] DTOs with `class-validator` (`RegisterDto`, `LoginDto`) and a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
- [ ] Password rules (minimum length, complexity) and email normalization (trim, lowercase)
- [ ] Never return the password: `@Exclude()` with `ClassSerializerInterceptor`, or `select: false`
- [ ] Duplicate email returns `409 Conflict`
- [ ] A global exception filter that gives every error the same JSON shape
- **Done when:** bad input gets a clean 400 or 409, and no response ever contains a hash

### Day 3: Database done right and Docker
- [ ] `synchronize: false`, with TypeORM **migrations** (initial schema)
- [ ] `docker-compose.yml` with MySQL (plus an optional Adminer DB browser), so the project runs with one command
- [ ] Index `refresh_tokens.jti` and `user`, and a cleanup job that deletes expired or revoked tokens (`@nestjs/schedule`)
- [ ] Seed script for a demo user and an admin user
- **Done when:** `docker compose up` followed by `npm run migration:run` gives a working DB from scratch

### Day 4: Intermediate-level auth features
- [ ] **Role-based access control**: a `role` column (`USER` / `ADMIN`), a `@Roles()` decorator and a `RolesGuard`, and make `/users/summary` admin-only with real data (user counts)
- [ ] **Refresh token reuse detection**: a token `familyId`. If a revoked token is used again, revoke the whole family (a theft signal).
- [ ] Store a **hash** of the refresh token or `jti`, not just the raw ID
- [ ] Log out of this device vs **log out of all devices**, plus a "My sessions" endpoint (device and IP list)
- [ ] `@nestjs/throttler` rate limiting on `/auth/login` and `/auth/register`, plus `helmet`
- **Done when:** an admin route is blocked for normal users, and replaying an old refresh token kills the session family

### Day 5: Tests and CI
- [ ] Unit tests for `AuthService`: login, refresh rotation, reuse detection, logout, bad password
- [ ] Unit tests for `UsersService` and `RolesGuard`
- [ ] E2E tests (supertest) against a test MySQL: register → login → me → refresh → logout → refresh fails
- [ ] GitHub Actions workflow: install, lint, build, unit and e2e tests (MySQL service container) for both apps
- [ ] Fix the npm audit vulnerabilities
- **Done when:** the CI badge is green and core auth logic has at least 80% coverage

### Day 6: Frontend polish
- [ ] Fix the refresh race: a single in-flight refresh promise shared by all 401s, with a request queue
- [ ] When refresh fails, clear the user and redirect to `/login`
- [ ] Use MUI (already installed): proper Login, Register, Profile and Admin pages and a layout with a navbar
- [ ] `react-hook-form` and `zod` for form validation, inline error messages instead of `alert()`, and loading states
- [ ] `VITE_API_URL` env variable instead of a hardcoded URL, and role-aware routes (admin page)
- [ ] A "Sessions" page that lists devices, with "log out everywhere"
- **Done when:** a clean, responsive UI where every error is shown properly in the app

### Day 7: Docs, demo and ship
- [ ] Swagger / OpenAPI docs at `/api/docs` (`@nestjs/swagger`)
- [ ] A real root `README.md`: features, architecture, **auth flow sequence diagram** (Mermaid), security decisions, how to run locally, env vars, testing, and screenshots or a GIF
- [ ] Replace both boilerplate READMEs
- [ ] Dockerfiles for the API and client, and a full-stack `docker compose up`
- [ ] Optional: deploy (API on Render or Railway, client on Vercel) and add a live demo link
- [ ] Add repo description and topics, and pin the repo on your profile
- **Done when:** a stranger can clone the repo, run one command and understand the design from the README

---

### Stretch goals (week 2)
- Email verification and forgot or reset password (with a mail catcher like Mailpit in Docker)
- Google OAuth login (`passport-google-oauth20`)
- Two-factor auth (TOTP with an authenticator app)
- Redis for the rate limiter and token denylist
- Audit log of logins, failed logins and token reuse events

### Commit habit
Make small, focused commits each day (e.g. `feat(auth): add refresh token reuse detection`). That gives you 5–15 real commits a day, so your contribution graph fills in naturally while the project gets better.
