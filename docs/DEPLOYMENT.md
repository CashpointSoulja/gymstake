# Deployment

I publish this prototype as static assets on Cloudflare Workers with public access. I do not require a visitor account or any payment credentials. I keep the product state in each visitor’s browser; hosting does not make the simulated wallets shared.

I build the same checked source I publish to the public repository. My build command is `npm run build`, and the deployable directory is `dist/`.

For an independent deployment in a Cloudflare account, I use the included `wrangler.jsonc` configuration:

```sh
npm ci
npm test
npm run build
npx wrangler deploy
```

I authenticate deployment from my own environment and do not put credentials in the repository. The `assets` binding serves the web app over HTTPS, which allows browser geolocation. I verify that the deployed app opens without a sign-in prompt and retains the play-money disclosures.

I let the service worker cache the shell after a first online load. Live gym search and map tiles still need a connection. Browser storage and location permission remain device-specific.
