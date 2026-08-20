// Inline SVG marks, one per vendor. No external requests, no image files.
//
// Where a vendor's mark is genuinely geometric (Mistral's bar grid, Google's G)
// this reproduces it. Where it is not, this uses a monogram badge in the brand
// colour rather than a bad freehand trace of a trademark.

const sq = (fill, inner) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="${fill}"/>${inner}</svg>`;

const mono = (bg, ch, fg = "#fff") =>
  sq(bg, `<text x="12" y="16.5" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif"
    font-size="13" font-weight="700" fill="${fg}">${ch}</text>`);

// Eight tapered spokes around the centre.
const burst = () => {
  const spokes = Array.from({ length: 8 }, (_, i) =>
    `<rect x="11.1" y="2.4" width="1.8" height="7.4" rx=".9" transform="rotate(${i * 45} 12 12)"/>`
  ).join("");
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#D97757">${spokes}</g></svg>`;
};

// Six overlapping petals, white on black.
const rosette = () => {
  const petals = Array.from({ length: 6 }, (_, i) =>
    `<ellipse cx="12" cy="12" rx="3.1" ry="7.4" transform="rotate(${i * 30} 12 12)"/>`
  ).join("");
  return sq("#000", `<g fill="none" stroke="#fff" stroke-width="1.1" opacity=".95">${petals}</g>`);
};

export const LOGOS = {
  anthropic: burst(),

  openai: rosette(),

  google: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7C21.7 18.5 23 15.6 23 12.2z"/>
    <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 20.9 7.6 23.5 12 23.5z"/>
    <path fill="#FBBC05" d="M5.6 14.3c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7H1.8C1 8.5.6 10.2.6 12.1s.4 3.6 1.2 5.1l3.8-2.9z"/>
    <path fill="#EA4335" d="M12 5.3c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.8 15.1.7 12 .7 7.6.7 3.7 3.3 1.8 7l3.8 2.9C6.5 7.3 9 5.3 12 5.3z"/>
  </svg>`,

  xai: sq("#000", `<path fill="#fff" d="M4.6 4h3.2l3.9 5.4L15.6 4h3.2l-5.5 7.5 5.9 8.5h-3.2l-4.3-6.1L7.4 20H4.2l6-8.2L4.6 4z"/>`),

  mistral: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2.5" width="4.6" height="4.3" fill="#141413"/>
    <rect x="17.4" y="2.5" width="4.6" height="4.3" fill="#141413"/>
    <rect x="2" y="6.8" width="4.6" height="4.3" fill="#F7D046"/>
    <rect x="9.7" y="6.8" width="4.6" height="4.3" fill="#F7D046"/>
    <rect x="17.4" y="6.8" width="4.6" height="4.3" fill="#F7D046"/>
    <rect x="2" y="11.1" width="4.6" height="4.3" fill="#F2A73B"/>
    <rect x="9.7" y="11.1" width="4.6" height="4.3" fill="#F2A73B"/>
    <rect x="17.4" y="11.1" width="4.6" height="4.3" fill="#F2A73B"/>
    <rect x="2" y="15.4" width="4.6" height="4.3" fill="#EE792F"/>
    <rect x="17.4" y="15.4" width="4.6" height="4.3" fill="#EE792F"/>
    <rect x="2" y="19.7" width="4.6" height="1.8" fill="#EA3326"/>
    <rect x="17.4" y="19.7" width="4.6" height="1.8" fill="#EA3326"/>
  </svg>`,

  zai: mono("#1E6FFF", "Z"),
  moonshot: mono("#16161A", "K"),
  alibaba: mono("#615CED", "Q"),
  minimax: mono("#E8452C", "M")
};

export const logoFor = (provider) => LOGOS[provider] || mono("#6b6a61", "?");
