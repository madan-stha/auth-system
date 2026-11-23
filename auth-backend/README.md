# auth-backend

The NestJS API for **[Auth System](../README.md)**: JWT access tokens, rotating refresh tokens stored in MySQL, and env-validated configuration.

```bash
npm install
cp .env.example .env   # set DB_PASSWORD and two different JWT secrets
docker compose up -d   # local MySQL
npm run migration:run  # create the tables
npm run seed           # optional demo and admin users
npm run start:dev      # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run start:dev` | Start with hot reload |
| `npm run build` / `npm run start:prod` | Build and run the compiled app |
| `npm run lint` | ESLint and Prettier |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |
| `npm run migration:run` / `migration:revert` / `migration:generate` | Manage the database schema |
| `npm run seed` | Create demo and admin users |

See the [main README](../README.md) for the auth flow, API endpoints and environment variables.
