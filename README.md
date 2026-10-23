# bitnik-tech

The public site for Bitnik Technology (Bitnik LLC, Asheville, NC) at
`bitnik.tech`: one page of work (AVL.LIVE, Rally Trace, Planeshift, Boundless),
the automation story and a contact form, plus privacy and accessibility pages.
There is no build step.

| Path | What it is |
| --- | --- |
| `public/` | everything served: `index.html`, `img/`, `privacy/`, `accessibility/`, `404.html` |
| `public/_redirects` | 301s from the old multi-page site's URLs to sections of the one page |
| `public/_headers` | security headers; fonts cached a year, images 30 days |
| `public/fonts/` | self-hosted Hubot Sans, Mona Sans, JetBrains Mono (unmodified Fontsource Latin files, OFL; `LICENSE.txt`) |
| `functions/api/contact.js` | `POST /api/contact`, the contact form's endpoint |
| `wrangler.toml` | the Pages project's configuration, including its bindings |

## How it is served

Cloudflare Pages project `bitnik-tech` in Brad's account (`fda92d10…`), the account
that holds the bitnik.tech zone and the `form-mailer` Worker. DNS for the apex and
`www` is declared in the `platform` repo, `projects/bitnik-tech/dns.tf`.

Deploy from a clean checkout of `main`:

```sh
CLOUDFLARE_ACCOUNT_ID=fda92d10e4a8d782ba78b35a860e47a1 npx wrangler@4.148.0 pages deploy --branch main
```

`wrangler.toml` is the source of truth for the project's bindings: anything set
in the dashboard is replaced on deploy.

## The contact form

The page posts JSON to `/api/contact`. The function checks the request came
from this site, drops anything that fills the hidden `website` field, validates
name and email, and hands the submission to the `form-mailer` Worker
(`jsindy/website-ai`, `infra/form-mailer`) over the `MAILER` service binding,
signed with `MAILER_SECRET`. form-mailer verifies the signature and sends the
email through Cloudflare Email Service from `forms@send.bitnik.tech`, with
reply-to set to the visitor. form-mailer has no public URL, so this project must
stay in its account.

form-mailer is configured from `website-ai`, not here. Its client record
`clients/bitnik-tech/client.json` needs, under `live`:
`"cloudflare_account": "fda92d10e4a8d782ba78b35a860e47a1"` and
`"form_to": ["brad@bitnik.tech"]`. Then, in `website-ai`:

```sh
bash infra/form-mailer/deploy.sh --add bitnik-tech
```

That rebuilds form-mailer's client list and allowed recipients, and pipes one new
secret into both form-mailer (`SECRET_BITNIK_TECH`) and this project
(`MAILER_SECRET`). Redeploy this site afterwards so it picks the secret up. Until
then the form answers 503 and the page shows an error with the phone number.

## Running it locally

```sh
echo 'MAILER_SECRET=test-secret' > .dev.vars   # gitignored
npx wrangler@4.148.0 pages dev                  # http://localhost:8788
```

To exercise the form end to end, run a copy of form-mailer with `wrangler dev`
alongside it (its `MAILER` email binding replaced by one that logs);
`pages dev` connects this project's `MAILER` service binding to it automatically.
