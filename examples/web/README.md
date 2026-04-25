# Web Auth Example

This example starts pibo with Better Auth, the same-origin web host, and the chat web app.

Set these values in `.env` or export them in the shell:

```bash
export BETTER_AUTH_URL=http://localhost:4788
export BETTER_AUTH_SECRET=<32+ character secret>
export GOOGLE_CLIENT_ID=<google oauth client id>
export GOOGLE_CLIENT_SECRET=<google oauth client secret>
export PIBO_AUTH_ALLOWED_EMAILS=you@example.com
```

In Google Cloud Console, configure this exact OAuth redirect URI:

```text
http://localhost:4788/api/auth/callback/google
```

For a server deployment, use the public HTTPS origin instead:

```text
https://pibo.example.com/api/auth/callback/google
```

Google does not support a wildcard redirect URI for this web-server OAuth flow. Every self-hosted instance needs its own Google OAuth client or an explicitly registered redirect URI.

Then start:

```bash
npm run gateway:web
```

Open:

```text
http://localhost:4788/apps/chat
```

Expected behavior:

- startup fails if `BETTER_AUTH_SECRET` is shorter than 32 characters
- startup fails if `PIBO_AUTH_ALLOWED_EMAILS` is missing or empty
- unauthenticated chat API requests return `401`, including localhost
- authenticated users outside `PIBO_AUTH_ALLOWED_EMAILS` return `403`
- Google sign-in creates a Better Auth session
- sign-out clears the Better Auth session and the next sign-in shows Google's account chooser
- the chat app resolves a persistent binding with `channel: chat-web`
- messages from the web app route into the pibo session for that user
