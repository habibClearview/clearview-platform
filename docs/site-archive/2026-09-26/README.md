# The public site as it stood on 26 September 2026

These nine pages were taken off habibonifade.com when the site moved from
speaking to NGOs to speaking to programmes, implementers and funders. Their
addresses now send visitors to the home page. Nothing here is built or served.

Kept so they can be rewritten later rather than lost:

| Address | Page |
| --- | --- |
| /score | Commercial Readiness Score (the ten-question diagnostic) |
| /library | The library |
| /watch | Videos |
| /evidence | All fifteen findings and the frameworks behind them |
| /what-i-do/grant-to-commercial-viability | Grant to Commercial Viability Canvas |
| /what-i-do/market-intelligence | Market Intelligence |
| /what-i-do/investment-case | Investment Case Canvas |
| /what-i-do/intervention-design | Intervention Design Canvas |
| /what-i-do/trade-liquidity | Enterprise Trade Liquidity Multiplier |

`CanvasCoachSite.tsx`, `data.ts` and `design.css.ts` are the whole site
component and its words as they were that day, so every page above can be
read in full. The one edit made on the way in: "fortnightly" became "every
Wednesday", as instructed.

To bring a page back, move its `pages/<address>/page.tsx` back under
`app/site/`, point it at the live component, remove its redirect from
`next.config.js`, and rewrite the words first.
