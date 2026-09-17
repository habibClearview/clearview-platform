// ============================================================
// THE REMOTE'S OWN LAYOUT.
//
// The walkthrough's colours and font, arranged for a phone held in one hand in
// a dim room: the two buttons are 64 pixels tall so they can be pressed without
// looking, and the notes are 18 pixels so they can be read at arm's length.
// Every value here is the one Habib specified.
// ============================================================

export const REMOTE_CSS = `
.gtcvw-remote{display:flex;flex-direction:column;min-height:100vh;height:auto;background:var(--ground);color:var(--ink)}
.gtcvw-remote .rm-top{display:flex;align-items:center;gap:12px;padding:16px 18px;background:var(--bar);border-bottom:1px solid var(--line)}
.gtcvw-remote .rm-where{flex:1;min-width:0;font-size:14px;font-weight:600;letter-spacing:.02em;color:var(--ink)}
.gtcvw-remote .rm-menu{flex:none;font-size:13px;font-weight:600;padding:8px 14px;background:transparent;color:var(--ink-2);border:1px solid var(--line-2);cursor:pointer}
.gtcvw-remote .rm-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--ink-3)}
.gtcvw-remote .rm-dot.connected{background:#82BC7B}
.gtcvw-remote .rm-dot.connecting{background:#D9B268}
.gtcvw-remote .rm-dot.lost{background:#D9B268;animation:pulse 1.4s ease-in-out infinite}
.gtcvw-remote .rm-warn{margin:0;padding:12px 18px;font-size:14px;color:var(--ink-2);background:rgba(217,178,104,.14);border-bottom:1px solid var(--line)}
.gtcvw-remote .rm-body{flex:1;min-height:0;overflow:auto;padding:20px 18px 24px}
.gtcvw-remote .rm-note{margin:0;font-size:18px;line-height:1.5;color:var(--ink)}
.gtcvw-remote .rm-note.quiet{margin-top:18px;font-size:14px;color:var(--ink-3)}
.gtcvw-remote .rm-list{display:flex;flex-direction:column;gap:6px;margin-bottom:22px}
.gtcvw-remote .rm-list button{display:block;width:100%;text-align:left;font-size:16px;font-weight:500;color:var(--ink-2);background:transparent;border:1px solid var(--line-2);padding:12px 14px;cursor:pointer}
.gtcvw-remote .rm-list button.on{border-color:var(--blue);color:var(--ink)}
.gtcvw-remote .rm-list button b{font-weight:700;color:var(--blue);margin-right:8px}
.gtcvw-remote .rm-toggles{display:flex;flex-wrap:wrap;gap:8px}
.gtcvw-remote .rm-toggles button{flex:1 1 40%;font-size:14px;font-weight:600;color:var(--ink-2);background:transparent;border:1px solid var(--line-2);padding:14px 10px;cursor:pointer}
.gtcvw-remote .rm-foot{position:sticky;bottom:0;display:flex;gap:10px;padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px));background:var(--ground);border-top:1px solid var(--line)}
.gtcvw-remote .rm-foot button{flex:1;height:64px;font-size:18px;font-weight:600;cursor:pointer}
.gtcvw-remote .rm-back{background:transparent;color:var(--ink);border:1px solid rgba(245,245,220,.32)}
.gtcvw-remote .rm-next{background:#00AFEF;color:#111111;border:0}
`
