# Roadmap

Planned development of **Auth System**, from a working JWT prototype to a secure, tested and documented authentication service.

| Milestone | Focus | Status | Issue |
|---|---|---|---|
| [1. Security & configuration](#1-security--configuration) | Env-based config, secret management | ✅ Done | [#4](https://github.com/madan-stha/auth-system/issues/4) |
| [2. Validation & error handling](#2-validation--error-handling) | Input validation, safe responses | ✅ Done | [#5](https://github.com/madan-stha/auth-system/issues/5) |
| [3. Database & infrastructure](#3-database--infrastructure) | Migrations, Docker | ✅ Done | [#6](https://github.com/madan-stha/auth-system/issues/6) |
| [4. Advanced authentication](#4-advanced-authentication) | Roles, sessions, token reuse detection | 🔄 In progress | [#7](https://github.com/madan-stha/auth-system/issues/7) |
| [5. Testing & CI](#5-testing--ci) | Unit and e2e tests, GitHub Actions | 🔄 In progress | [#8](https://github.com/madan-stha/auth-system/issues/8) |
| [6. Frontend](#6-frontend) | UI, form validation, session handling | ⬜ Planned | [#9](https://github.com/madan-stha/auth-system/issues/9) |
| [7. Documentation & deployment](#7-documentation--deployment) | API docs, containers, hosting | 🔄 In progress | [#10](https://github.com/madan-stha/auth-system/issues/10) |

Progress on each milestone is tracked in its GitHub issue.

---

## 1. Security & configuration
- [x] Load all settings from environment variables, validated at startup (`@nestjs/config` + Joi)
- [x] Provide `.env.example`, and keep secrets out of source control
- [x] Sign access and refresh tokens with separate secrets
- [x] Configure CORS origins from the environment
- [x] Remove logging of request data that contains tokens
- [x] Fix the client sign-up endpoint
- [x] Resolve all lint errors

## 2. Validation & error handling
- [x] DTOs with `class-validator` and a global `ValidationPipe` that rejects unknown fields
- [x] Password policy (8–72 characters, mixed case and a number) and email normalization
- [x] Never expose password hashes (`select: false` and a global serializer)
- [x] Constant-time login response for unknown emails
- [x] `409 Conflict` for duplicate emails, including concurrent sign-ups
- [x] Global exception filter with a consistent error format

## 3. Database & infrastructure
- [x] Replace `synchronize` with TypeORM migrations
- [x] Docker Compose for MySQL for local development
- [x] Indexes on refresh tokens, and a scheduled cleanup of expired tokens
- [x] Seed script for demo and admin users

## 4. Advanced authentication
- [x] Role-based access control (`USER`, `ADMIN`) with a `@Roles()` decorator and guard
- [ ] Refresh token reuse detection with token families
- [ ] Hashed refresh token storage
- [ ] Per-device sessions: list sessions, log out of one device or all devices
- [x] Rate limiting on authentication endpoints (`@nestjs/throttler`) and security headers (`helmet`)

## 5. Testing & CI
- [x] End-to-end tests for the full auth flow (register, login, refresh rotation, logout)
- [x] Validation, duplicate-account and error-format tests
- [ ] Unit tests for `AuthService`, `UsersService` and guards
- [ ] GitHub Actions pipeline: lint, build and tests for API and client
- [ ] Resolve dependency vulnerabilities

## 6. Frontend
- [ ] Single in-flight token refresh shared by concurrent requests
- [ ] Redirect to login when the session can't be restored
- [ ] Material UI layout and pages
- [ ] Form validation with `react-hook-form` and `zod`, with inline error messages
- [ ] Configurable API URL (`VITE_API_URL`)
- [ ] Admin and active-sessions pages

## 7. Documentation & deployment
- [x] Project README with architecture, auth flow diagram and setup guide
- [ ] OpenAPI / Swagger documentation at `/api/docs`
- [ ] Dockerfiles for API and client, and a full-stack Compose setup
- [ ] Hosted demo deployment

---

## Future enhancements
- Email verification and password reset
- OAuth sign-in (Google)
- Two-factor authentication (TOTP)
- Redis-backed rate limiting and token denylist
- Audit logging of authentication events
