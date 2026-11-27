/**
 * Styles of the dossier banner, injected once by the banner itself so that
 * the standalone pages need nothing but the script. Prefixed `sird-` to stay
 * clear of the pages' own classes.
 */
export const STYLE_BANDEAU = `
.sird {
  --sird-ink: #0d2421;
  --sird-muted: #4f625f;
  --sird-line: #d3dcda;
  --sird-bg: #f2f5f5;
  --sird-panel: #ffffff;
  --sird-mint: #00ffbe;
  --sird-accent: #00756a;
  --sird-ok: #1f6b45;
  --sird-warn: #a3671a;
  --sird-warn-bg: #f6ecd9;
  --sird-err: #c34a35;
  --sird-err-bg: #f7e3dd;
  position: relative;
  font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--sird-ink);
  background: var(--sird-bg);
  border-bottom: 1px solid var(--sird-line);
  text-align: left;
}
.sird *, .sird *::before, .sird *::after { box-sizing: border-box; }
.sird-barre {
  max-width: 74rem;
  margin: 0 auto;
  padding: 0.45rem 1.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1rem;
  min-height: 2.6rem;
}
.sird-gauche { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.6rem; min-width: 0; }
.sird-droite { margin-left: auto; display: flex; gap: 0.4rem; }
.sird-etiquette {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sird-accent);
}
.sird-discret { color: var(--sird-muted); }
.sird-synchro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.6rem;
  color: var(--sird-muted);
  min-width: 0;
}
.sird-synchro--ok::before { content: '✓'; color: var(--sird-ok); font-weight: 700; }
.sird-synchro--attention, .sird-synchro--alerte {
  flex-basis: 100%;
  order: 3;
  color: var(--sird-ink);
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--sird-warn);
  background: var(--sird-warn-bg);
}
.sird-synchro--alerte { border-left-color: var(--sird-err); background: var(--sird-err-bg); }
.sird-presence {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: var(--sird-warn);
}
.sird-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.4em 0.95em;
  border-radius: 999px;
  border: 1px solid var(--sird-ink);
  background: transparent;
  color: var(--sird-ink);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.sird-btn:hover { background: var(--sird-ink); color: var(--sird-panel); }
.sird-btn--plein { background: var(--sird-mint); border-color: var(--sird-mint); color: #0d2421; }
.sird-btn--plein:hover { background: #00e0a7; border-color: #00e0a7; color: #0d2421; }
.sird-btn:disabled, .sird-recent:disabled { opacity: 0.45; cursor: not-allowed; }
.sird-btn:focus-visible, .sird-recent:focus-visible, .sird-oublier:focus-visible, .sird-champ input:focus-visible {
  outline: 2px solid var(--sird-accent);
  outline-offset: 2px;
}
.sird-menu {
  position: absolute;
  z-index: 3000;
  right: max(1.5rem, calc((100% - 74rem) / 2 + 1.5rem));
  top: calc(100% + 4px);
  width: min(30rem, calc(100vw - 2rem));
  max-height: min(80vh, 44rem);
  overflow: auto;
  background: var(--sird-panel);
  border: 1px solid var(--sird-line);
  border-radius: 6px;
  box-shadow: 0 14px 40px -12px rgba(13, 36, 33, 0.35);
}
.sird-section { padding: 0.9rem 1.1rem; border-bottom: 1px solid var(--sird-line); }
.sird-section:last-of-type { border-bottom: 0; }
.sird-section p { margin: 0 0 0.45rem; }
.sird-titre {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sird-muted);
}
.sird-gros { font-size: 1.05rem; font-weight: 600; }
.sird-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem !important; }
.sird-ligne { display: grid; grid-template-columns: 9rem 1fr; gap: 0.6rem; margin-bottom: 0.6rem; }
@media (max-width: 480px) { .sird-ligne { grid-template-columns: 1fr; } }
.sird-champ {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sird-muted);
}
.sird-champ input {
  font: inherit;
  font-size: 0.9rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--sird-ink);
  background: var(--sird-panel);
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--sird-line);
  border-radius: 4px;
  width: 100%;
}
.sird-aide { font-size: 0.78rem; color: var(--sird-muted); margin-top: 0.5rem !important; }
.sird-aide--attention { color: var(--sird-warn); font-weight: 600; }
.sird-question { margin-top: 0.7rem; padding: 0.6rem 0.75rem; background: var(--sird-warn-bg); border-left: 3px solid var(--sird-warn); display: flex; flex-wrap: wrap; gap: 0.4rem; }
.sird-question p { flex-basis: 100%; }
.sird-recents { list-style: none; padding: 0; margin: 0.7rem 0 0; }
.sird-recents li { display: flex; align-items: stretch; border-top: 1px solid var(--sird-line); }
.sird-recent {
  flex: 1;
  text-align: left;
  font: inherit;
  color: var(--sird-ink);
  background: none;
  border: 0;
  padding: 0.5rem 0.3rem;
  cursor: pointer;
}
.sird-recent:hover { background: var(--sird-bg); }
.sird-oublier {
  border: 0;
  background: none;
  color: var(--sird-muted);
  font-size: 1.1rem;
  padding: 0 0.6rem;
  cursor: pointer;
}
.sird-oublier:hover { color: var(--sird-err); }
.sird-message { margin: 0 !important; padding: 0.7rem 1.1rem; background: #e2f8f2; font-size: 0.85rem; }
.sird-message--erreur { background: var(--sird-err-bg); }

/* In the app, with a dossier open: kept in view while scrolling. */
.sird-colle { position: sticky; top: 0; z-index: 1100; }

/* Standalone pages: a floating card that leaves their layout alone. */
.sird--flottant {
  position: fixed;
  z-index: 3000;
  right: 1rem;
  bottom: 1rem;
  max-width: min(34rem, calc(100vw - 2rem));
  border: 1px solid var(--sird-line);
  border-radius: 8px;
  box-shadow: 0 10px 30px -12px rgba(13, 36, 33, 0.4);
  background: var(--sird-panel);
}
.sird--flottant .sird-barre { padding: 0.45rem 0.75rem; }
.sird--flottant .sird-menu { right: 0; top: auto; bottom: calc(100% + 6px); }
@media (prefers-color-scheme: dark) {
  .sird--flottant {
    --sird-ink: #e6efed;
    --sird-muted: #9fb3af;
    --sird-line: #2a4541;
    --sird-bg: #0b1d1b;
    --sird-panel: #102a27;
    --sird-accent: #00ffbe;
    --sird-ok: #6fd3a0;
    --sird-warn: #e3a464;
    --sird-warn-bg: #3a2c16;
    --sird-err: #f0857a;
    --sird-err-bg: #3d1f1a;
  }
  .sird--flottant .sird-message { background: #1a3a36; }
}
`
