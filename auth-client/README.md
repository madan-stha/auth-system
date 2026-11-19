# auth-client

The React + Vite client for **[Auth System](../README.md)**. It keeps the access token in memory, restores the session from the refresh cookie on load, and retries requests automatically after a `401`.

```bash
npm install
npm run dev     # http://localhost:5173 (expects the API on http://localhost:3000)
```

| Page | Route | Access |
|---|---|---|
| Login | `/login` | Public |
| Register | `/register` | Public |
| Profile | `/profile` | Signed in |
| Reports | `/reports` | Signed in |

Key files: `src/api/axiosClient.ts` (token and refresh interceptor), `src/context/AuthContext.tsx` (session state), `src/components/ProtectedRoute.tsx`.

See the [main README](../README.md) for the full auth flow.
