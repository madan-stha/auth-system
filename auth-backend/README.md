# auth-backend

The NestJS API for **[Auth System](../README.md)**: JWT access tokens, rotating refresh tokens stored in MySQL, and env-validated configuration.

```bash
npm install
cp .env.example .env   # fill in the DB password and two different JWT secrets
npm run start:dev      # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run start:dev` | Start with hot reload |
| `npm run build` / `npm run start:prod` | Build and run the compiled app |
| `npm run lint` | ESLint and Prettier |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |

See the [main README](../README.md) for the auth flow, API endpoints and environment variables.
