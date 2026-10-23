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

Cloudflare Pages project `bitnik-tech` (account `fda92d10…`). DNS for the apex
and `www` is declared in the `platform` repo, `projects/bitnik-tech/dns.tf`.

Pushing to `main` deploys it. `wrangler.toml` is the source of truth for the
project's bindings: anything set in the dashboard is replaced on deploy.

## The contact form

The page posts JSON to `/api/contact`. The function checks the request came
from this site, drops anything that fills the hidden `website` field, validates
name and email, and hands the submission to the `form-mailer` Worker over the
`FORM_MAILER` service binding. form-mailer verifies an HMAC signature and sends
the email through Cloudflare Email Service from `forms@send.bitnik.tech`, with
reply-to set to the visitor.

It needs, once:

- form-mailer's `CLIENTS` variable to have a `bitnik` entry, e.g.
  `"bitnik":{"name":"Bitnik Technology","site":"bitnik.tech","to":["brad@bitnik.tech"]}`
- the same random value as form-mailer's secret `SECRET_BITNIK` and this Pages
  project's secret `FORM_SECRET`. Generate it once and pipe it to both, so it is
  never copied by hand:

  ```sh
  s=$(openssl rand -hex 32)
  printf %s "$s" | npx wrangler secret put SECRET_BITNIK --name form-mailer
  printf %s "$s" | npx wrangler pages secret put FORM_SECRET --project-name bitnik-tech
  unset s
  ```

Until both exist the form answers 503 and the page shows an error with the phone
number. These are secrets set by hand on a provider, so nothing rotates them.

## Running it locally

```sh
echo 'FORM_SECRET=test-secret' > .dev.vars     # gitignored
npx wrangler@4.148.0 pages dev                  # http://localhost:8788
```

To exercise the form end to end, run a copy of form-mailer with `wrangler dev`
alongside it (its `MAILER` binding replaced by one that logs); `pages dev`
connects the `FORM_MAILER` binding to it automatically.
