// ============================================================
// THE REMOTE'S OWN LAYOUT.
//
// The walkthrough's colours and font, arranged for a phone held in one hand in
// a dim room: the two buttons at the bottom are 64 pixels tall so they can be
// pressed without looking, and the cue is 18 pixels so it can be read at arm's
// length. Those values are the ones Habib specified, and the cue and the points
// were made bigger again on the evening of 17 September: "the prompt text on
// the phone is too small, please make the size larger cause I have bad eyes."
// A note that has to be squinted at in a dim room is a note that is not read.
//
// Between them the phone now carries what he asked for after using it: the same
// four buttons the screen's own header has, across the top where they can be
// reached, the talking points for the screen that is up, and a row for moving
// the reading panel, holding the sequence and changing its pace.
// ============================================================

export const REMOTE_CSS = `
.gtcvw-remote{display:flex;flex-direction:column;min-height:100vh;height:100vh;background:var(--ground);color:var(--ink)}
.gtcvw-remote .rm-top{display:flex;align-items:center;gap:12px;padding:16px 18px;background:var(--bar);border-bottom:1px solid var(--line)}
.gtcvw-remote .rm-where{flex:1;min-width:0;font-size:14px;font-weight:600;letter-spacing:.02em;color:var(--ink)}
.gtcvw-remote .rm-menu{flex:none;font-size:13px;font-weight:600;padding:8px 14px;background:transparent;color:var(--ink-2);border:1px solid var(--line-2);cursor:pointer}
.gtcvw-remote .rm-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--ink-3)}
.gtcvw-remote .rm-dot.connected{background:#82BC7B}
.gtcvw-remote .rm-dot.connecting{background:#D9B268}
.gtcvw-remote .rm-dot.lost{background:#D9B268;animation:pulse 1.4s ease-in-out infinite}
.gtcvw-remote .rm-warn{margin:0;padding:12px 18px;font-size:14px;color:var(--ink-2);background:rgba(217,178,104,.14);border-bottom:1px solid var(--line)}
.gtcvw-remote .rm-body{flex:1;min-height:0;overflow:auto;padding:20px 18px 24px}
.gtcvw-remote .rm-note{margin:0;font-size:23px;line-height:1.4;font-weight:500;color:var(--ink);letter-spacing:-.01em}
.gtcvw-remote .rm-note.quiet{margin-top:18px;font-size:15px;font-weight:400;color:var(--ink-3)}
.gtcvw-remote .rm-beat{display:inline-block;margin-bottom:12px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}
.gtcvw-remote .rm-open{display:block;margin-top:22px;text-align:center;font-size:16px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);padding:14px 12px}
.gtcvw-remote .rm-modes{display:flex;border-bottom:1px solid var(--line)}
.gtcvw-remote .rm-modes button{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--ink-2);background:transparent;border:0;border-right:1px solid var(--line);padding:12px 4px;cursor:pointer;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gtcvw-remote .rm-modes button:last-child{border-right:0}
.gtcvw-remote .rm-modes button.on{background:var(--blue);color:var(--on-blue)}
.gtcvw-remote .rm-points{margin:18px 0 0;padding-left:22px}
.gtcvw-remote .rm-points li{font-size:19px;line-height:1.45;color:var(--ink-2);margin-bottom:16px}
.gtcvw-remote .rm-points li::marker{color:var(--blue)}
.gtcvw-remote .rm-tools{display:flex;gap:6px;padding:8px 14px;border-top:1px solid var(--line)}
.gtcvw-remote .rm-tools button{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--ink-2);background:transparent;border:1px solid var(--line-2);padding:12px 4px;cursor:pointer;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gtcvw-remote .rm-tools button:disabled{opacity:.3}
.gtcvw-remote .rm-tools button.on{background:var(--cv-prog);color:#0F1A2B;border-color:var(--cv-prog)}
.gtcvw-remote .rm-tools button.wants{border-color:var(--blue);color:var(--blue)}
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
