// ============================================================
// THE WALKTHROUGH'S OWN STYLES.
//
// Every value here is copied from the approved reference build, which is kept
// beside it at docs/walkthrough-reference/reference.html. Nothing is
// reinterpreted: the sizes, colours, borders and spacing are the ones Habib
// approved in the nineteen screenshots in that folder.
//
// WHY EVERY LINE STARTS WITH .gtcvw. The reference is a page on its own, so it
// styles .app, .top, .card and half a dozen other names that this application
// also uses. Dropped into ClearView as written, it would repaint components on
// other pages, and ClearView's own styles would repaint it back. The prefix
// makes both impossible: these rules only apply inside the walkthrough's own
// wrapper, and nothing outside that wrapper can reach in, because the wrapper
// sets its own colours, its own font and its own box sizing.
//
// ONE ADAPTATION, AND IT IS WRITTEN DOWN. The reference is a whole page, so it
// sets html and body to full height and then asks its wrapper for 100% of that.
// Here the wrapper is one element inside an application, and 100% of an
// automatic height is the height of the content, which left a strip of the
// application's own background under the footer. The wrapper measures itself
// against the window instead, which is the same height in a full window and the
// only value that behaves the same way inside a page it does not own.
//
// A SECOND ADAPTATION, FOR PHONES, AND THE SAME REASON. The reference lets the
// whole page grow on a phone and pins its footer with position:sticky. That
// works on a page of its own. It does not work here, because this application
// sets overflow-x:hidden on html and body at phone widths, which makes the body
// itself the scrolling box and leaves a sticky footer sitting at the bottom of
// the content instead of the bottom of the screen: Back and Next were below the
// fold on every canvas screen, which is most of the walkthrough.
//
// So on a phone the walkthrough is exactly one screen tall and the middle
// scrolls inside it. The header stays at the top, Back and Next stay at the
// bottom, and the canvas and the narration scroll between them, which is what
// the approved design shows. The application's own rule is untouched.
//
// The reference loads Poppins from Google. This application already carries
// Poppins at 400, 500, 600 and 700 in /public/fonts and forbids fetching fonts
// from anywhere else, so the same font resolves here with nothing fetched.
// ============================================================

/** The reference stylesheet, scoped to the walkthrough's wrapper. */
export const WALKTHROUGH_CSS = `
.gtcvw{--ground:#111111; --bar:#12222C; --panel:#12222C; --line:rgba(245,245,220,.16); --line-2:rgba(245,245,220,.32); --ink:#F5F5DC; --ink-2:rgba(245,245,220,.78); --ink-3:rgba(245,245,220,.5); --blue:#00AFEF; --on-blue:#111111; --glow:rgba(0,175,239,.32); --font:"Poppins",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; --cv-card:#192439; --cv-signed:#1C2F3A; --cv-border:#51678E; --cv-ink:#EEF2F8; --cv-ink-2:#ADB9C8; --cv-ink-3:#7E899A; --cv-cyan:#70E8E9; --cv-on-cyan:#0F1A2B; --cv-slate:#445C87; --cv-gold:#D9B268; --cv-lav:#B29CD2; --cv-teal:#496D71; --cv-green:#457B3C; --cv-glow:rgba(112,232,233,.38); --cv-done:#82BC7B; --cv-prog:#D9B268; --cv-prog-glow:rgba(217,178,104,.42);}
.gtcvw[data-room="light"]{--ground:#F5F5DC; --bar:#EDEDCF; --panel:#FAFAEC; --line:rgba(18,34,44,.16); --line-2:rgba(18,34,44,.34); --ink:#12222C; --ink-2:rgba(18,34,44,.8); --ink-3:rgba(18,34,44,.54); --blue:#0083BA; --on-blue:#FFFFFF; --glow:rgba(0,131,186,.24); --cv-card:#FFFFFF; --cv-signed:#EAF4E8; --cv-border:#7F90AE; --cv-ink:#12222C; --cv-ink-2:#4A5A70; --cv-ink-3:#6F7C8F; --cv-cyan:#139EA2; --cv-on-cyan:#FFFFFF; --cv-glow:rgba(19,158,162,.28);}
.gtcvw{min-height:100vh;height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:var(--ground);color:var(--ink);font-family:var(--font);font-size:16px;line-height:1.55;transition:background .35s,color .35s}
.gtcvw *{box-sizing:border-box}
.gtcvw button{font-family:var(--font)}
.gtcvw .top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px;padding:18px 36px;background:var(--bar);border-bottom:1px solid var(--line)}
.gtcvw .brand{display:flex;align-items:center;gap:24px;min-width:0}
.gtcvw .logo{height:68px;width:auto;display:block}
.gtcvw .logo.navy{display:none}
.gtcvw[data-room="light"] .logo.cream{display:none}
.gtcvw[data-room="light"] .logo.navy{display:block}
.gtcvw .brand .rule{width:1px;align-self:stretch;background:var(--line-2)}
.gtcvw .brand .name{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.gtcvw .brand .name b{font-weight:600;font-size:26px;letter-spacing:-.02em;line-height:1.15}
.gtcvw .brand .name span{font-size:14px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--blue);margin-top:4px}
.gtcvw .tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.gtcvw .modes{display:flex;border:1px solid var(--line-2)}
.gtcvw .modes button,.gtcvw .tbtn{font-weight:600;font-size:15px;color:var(--ink-2);background:transparent;border:0;padding:11px 18px;cursor:pointer;line-height:1}
.gtcvw .modes button[aria-pressed="true"]{background:var(--blue);color:var(--on-blue)}
.gtcvw .tbtn{border:1px solid var(--line-2);display:inline-flex;align-items:center;gap:7px}
.gtcvw .tbtn[aria-pressed="true"]{color:var(--blue);border-color:var(--blue)}
.gtcvw .tbtn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2}
.gtcvw button:focus-visible,.gtcvw .gate:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.gtcvw .stage{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:24px;padding:16px 24px;min-height:0}
.gtcvw .canvas-wrap{min-height:0;display:flex;align-items:center;justify-content:center;touch-action:pan-y}
.gtcvw .canvas-wrap svg{width:100%;height:100%;display:block}
.gtcvw .narr{min-height:0;overflow:auto;padding:24px 26px;background:var(--panel);border:1px solid var(--line-2)}
.gtcvw .eyebrow{display:flex;align-items:center;gap:12px;margin:0 0 14px;font-size:11.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--blue)}
.gtcvw .eyebrow::before{content:"";width:34px;height:2px;background:var(--blue);flex:none}
.gtcvw .eyebrow .count{margin-left:auto;color:var(--ink-3);letter-spacing:.12em;font-weight:600}
.gtcvw .narr h2{font-weight:700;font-size:31px;line-height:1.08;letter-spacing:-.035em;margin:0 0 16px;text-wrap:balance}
.gtcvw .narr h2 em,.gtcvw .s-h1 em{font-style:normal;color:var(--blue);display:block}
.gtcvw .narr p{margin:0 0 12px;color:var(--ink-2)}
.gtcvw .narr strong{color:var(--ink);font-weight:600}
.gtcvw .narr ol,.gtcvw .narr ul{margin:0 0 14px;padding-left:20px;color:var(--ink-2)}
.gtcvw .narr li{margin-bottom:8px;transition:color .25s}
.gtcvw .narr li::marker{color:var(--blue);font-weight:600}
.gtcvw .narr .q{font-weight:500;font-size:16.5px;color:var(--ink);line-height:1.42;letter-spacing:-.01em}
.gtcvw .narr .quiet{font-size:14px;color:var(--ink-3)}
.gtcvw .tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;border:1px solid var(--line-2);color:var(--ink-2);padding:4px 10px;margin:0 0 12px}
.gtcvw .tag.gold{border-color:var(--cv-gold);color:var(--cv-gold)}
.gtcvw .block{border-top:1px solid var(--line);padding-top:12px;margin-top:8px}
.gtcvw .block h3{font-weight:600;font-size:15px;margin:0 0 6px;color:var(--ink);letter-spacing:-.01em}
.gtcvw .sync li{color:var(--ink-3)}
.gtcvw .sync li.on{color:var(--ink)}
.gtcvw .beats{list-style:none;padding:0!important;margin:4px 0 14px}
.gtcvw .beats li{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink-3)}
.gtcvw .beats li:last-child{border-bottom:0}
.gtcvw .beats li i{width:14px;height:14px;border-radius:50%;border:2px solid var(--ink-3);margin-top:5px;transition:all .25s}
.gtcvw .beats li b{display:block;font-weight:600;font-size:14.5px;color:var(--ink-2)}
.gtcvw .beats li.on{color:var(--ink-2)}
.gtcvw .beats li.on b{color:var(--ink)}
.gtcvw .beats li.on i{background:var(--blue);border-color:var(--blue);box-shadow:0 0 0 5px var(--glow)}
.gtcvw .back{font-weight:600;font-size:13px;background:transparent;color:var(--blue);border:1px solid var(--blue);padding:8px 14px;cursor:pointer;margin-top:8px}
.gtcvw .scene{display:none;min-height:0;overflow:auto;padding:clamp(24px,4.5vw,72px) clamp(20px,5vw,80px);position:relative}
.gtcvw[data-kind="scene"] .stage{display:none}
.gtcvw[data-kind="scene"] .scene{display:flex;flex-direction:column;justify-content:center}
.gtcvw .reveal>*{animation:up .7s cubic-bezier(.2,.7,.2,1) both}
.gtcvw .reveal>*:nth-child(2){animation-delay:.08s}
.gtcvw .reveal>*:nth-child(3){animation-delay:.18s}
.gtcvw .reveal>*:nth-child(4){animation-delay:.28s}
.gtcvw .reveal>*:nth-child(5){animation-delay:.38s}
@keyframes up{from{opacity:.001;transform:translateY(14px)}to{opacity:1;transform:none}}
.gtcvw .s-h1{font-weight:700;font-size:clamp(38px,5.4vw,92px);line-height:1;letter-spacing:-.045em;margin:0 0 clamp(18px,2.4vw,34px);max-width:19ch;text-wrap:balance}
.gtcvw .s-h1.mid{font-size:clamp(34px,4.2vw,68px);max-width:24ch}
.gtcvw .s-body{font-size:clamp(18px,1.7vw,26px);color:var(--ink-2);max-width:48ch;line-height:1.5;margin:0}
.gtcvw .s-quote{font-size:clamp(20px,2.2vw,34px);font-weight:500;color:var(--ink);max-width:40ch;line-height:1.38;letter-spacing:-.015em;border-left:4px solid var(--blue);padding-left:clamp(16px,2vw,28px);margin:0}
.gtcvw .hold .logo-lg{height:clamp(44px,5.5vw,80px);width:auto;display:block;margin-bottom:clamp(24px,4vw,56px)}
.gtcvw[data-room="light"] .hold .logo-lg.cream,.gtcvw:not([data-room="light"]) .hold .logo-lg.navy{display:none}
.gtcvw .hold .status{display:inline-flex;align-items:center;gap:10px;margin-top:clamp(24px,3.5vw,48px);font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.gtcvw .hold .status i{width:10px;height:10px;border-radius:50%;background:var(--ink-3);animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{50%{opacity:.3}}
.gtcvw .ghost{position:absolute;right:-9vw;top:50%;transform:translateY(-50%);width:min(52vw,760px);opacity:.14;pointer-events:none}
.gtcvw .ghost rect{fill:none;stroke:var(--cv-cyan);stroke-width:2}
.gtcvw .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(10px,1.2vw,18px);max-width:1280px}
.gtcvw .card{border:1.5px solid var(--line-2);background:var(--panel);padding:clamp(16px,1.6vw,26px)}
.gtcvw .card b{display:block;font-size:12px;font-weight:700;letter-spacing:.18em;color:var(--blue);margin-bottom:10px}
.gtcvw .card p{margin:0;font-size:clamp(15px,1.3vw,21px);line-height:1.4;color:var(--ink);letter-spacing:-.01em}
.gtcvw .card.hl{border-color:var(--blue)}
.gtcvw .rep{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:clamp(24px,4vw,64px);align-items:center}
.gtcvw .paper{background:#F5F5DC;color:#12222C;padding:clamp(18px,2.2vw,34px);box-shadow:0 30px 60px rgba(0,0,0,.45);transform:rotate(-1.2deg);position:relative;max-width:620px;justify-self:center;width:100%}
.gtcvw .paper .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #12222C;padding-bottom:10px;margin-bottom:14px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.gtcvw .paper h4{margin:0 0 4px;font-size:clamp(16px,1.5vw,22px);letter-spacing:-.02em;line-height:1.2}
.gtcvw .paper .meta{font-size:12px;color:#4A5560;margin-bottom:14px}
.gtcvw .paper .sec{font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#00769F;margin:14px 0 6px}
.gtcvw .paper .bar{height:9px;background:rgba(18,34,44,.14);margin:7px 0}
.gtcvw .paper .sign{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid rgba(18,34,44,.25);margin-top:16px;padding-top:12px;font-size:12px;font-weight:600}
.gtcvw .paper .sent{background:#12222C;color:#F5F5DC;padding:4px 9px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase}
.gtcvw .paper .sample{position:absolute;top:-12px;right:18px;background:var(--cv-gold);color:#12222C;font-size:10.5px;font-weight:700;letter-spacing:.16em;padding:4px 10px}
.gtcvw .tl{max-width:1280px;margin-top:clamp(8px,1.5vw,20px)}
.gtcvw .tl .axis{position:relative;height:44px;border-bottom:2px solid var(--line-2);margin-bottom:0}
.gtcvw .tl .axis span{white-space:nowrap;position:absolute;bottom:10px;font-size:12px;font-weight:600;letter-spacing:.12em;color:var(--ink-3);transform:translateX(-50%)}
.gtcvw .tl .axis span:first-child{transform:none}
.gtcvw .tl .axis span:last-child{transform:translateX(-100%)}
.gtcvw .tl .cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(10px,1.2vw,18px)}
.gtcvw .tl .col{position:relative;padding-top:26px}
.gtcvw .tl .col::before{content:"";position:absolute;top:-8px;left:0;width:14px;height:14px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 5px var(--glow)}
.gtcvw .tl .col h3{margin:0 0 8px;font-size:clamp(18px,1.7vw,26px);letter-spacing:-.025em;line-height:1.1}
.gtcvw .tl .col p{margin:0;font-size:clamp(14px,1.2vw,18px);color:var(--ink-2);line-height:1.45}
.gtcvw .tl .note{margin-top:22px;font-size:13px;color:var(--ink-3)}
.gtcvw .cta{display:inline-flex;align-items:center;gap:12px;margin-top:clamp(22px,3vw,40px);background:var(--blue);color:var(--on-blue);font-weight:600;font-size:clamp(16px,1.4vw,20px);padding:18px 30px;border:0;cursor:pointer}
.gtcvw .qlist{margin:0;padding-left:1.4em;max-width:44ch}
.gtcvw .qlist li{font-size:clamp(20px,2.2vw,34px);font-weight:500;line-height:1.3;letter-spacing:-.02em;margin-bottom:.7em;color:var(--ink)}
.gtcvw .qlist li::marker{color:var(--blue);font-weight:700}
.gtcvw .ctrl{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 20px;padding:10px 24px 14px;border-top:1px solid var(--line);background:var(--ground)}
.gtcvw .nav{display:flex;align-items:center;gap:10px}
.gtcvw .nb{font-weight:600;font-size:14px;background:transparent;color:var(--ink);border:1px solid var(--line-2);padding:10px 18px;cursor:pointer;line-height:1}
.gtcvw .nb.primary{background:var(--blue);color:var(--on-blue);border-color:var(--blue)}
.gtcvw .nb:disabled{opacity:.35;cursor:default}
.gtcvw .dots{display:flex;flex-wrap:wrap;gap:6px;margin-left:6px}
.gtcvw .dots button{width:10px;height:10px;border-radius:50%;border:0;padding:0;background:var(--line-2);cursor:pointer}
.gtcvw .dots button[aria-current="step"]{background:var(--blue);transform:scale(1.3)}
.gtcvw .stepnum{display:none;font-size:13px;font-weight:600;color:var(--ink-3);letter-spacing:.06em}
.gtcvw .keys{font-size:11.5px;color:var(--ink-3)}
.gtcvw .keys kbd{font-family:inherit;border:1px solid var(--line-2);padding:0 5px;color:var(--ink-2);font-size:11px}
.gtcvw .foot{font-size:12px;color:var(--ink-3)}
.gtcvw .hdr{fill:var(--cv-ink-3);font-weight:700;letter-spacing:.2em}
.gtcvw .region{fill:var(--cv-glow);stroke:var(--cv-cyan);stroke-width:3;opacity:0;pointer-events:none;transition:opacity .45s}
.gtcvw .region.on{opacity:.55}
.gtcvw .gate{cursor:pointer;transition:opacity .45s}
.gtcvw .gate .box{fill:var(--cv-card);stroke:var(--cv-border);stroke-width:1.8;transition:fill .4s,stroke .4s,stroke-width .3s}
.gtcvw .gate:hover .box{stroke:var(--cv-cyan)}
.gtcvw .gate:focus{outline:none}
.gtcvw .gate.locked{opacity:.42}
.gtcvw .gate.active .box{stroke:var(--cv-prog);stroke-width:3.2;filter:drop-shadow(0 0 12px var(--cv-prog-glow))}
.gtcvw .gate.signed .box{fill:var(--cv-signed)}
.gtcvw .gate.reopened .box{stroke:var(--cv-gold);stroke-width:3.2}
.gtcvw .gate.wave .box{stroke:var(--cv-done);stroke-width:3.2}
.gtcvw .gate .pip{fill:none;stroke:var(--cv-ink-3);stroke-width:1.5;transition:all .25s}
.gtcvw .gate .pip.on{fill:var(--cv-cyan);stroke:var(--cv-cyan)}
.gtcvw .gate.reopened .pip.on{fill:var(--cv-gold);stroke:var(--cv-gold)}
.gtcvw .gate .status{fill:var(--cv-ink-3);font-weight:600;letter-spacing:.06em}
.gtcvw .gate.signed .status{fill:var(--cv-done)}
.gtcvw .gate.reopened .status{fill:var(--cv-gold)}
.gtcvw .stamp{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .45s cubic-bezier(.3,1.6,.5,1)}
.gtcvw .stamp circle{fill:var(--cv-done)}
.gtcvw .stamp path{fill:none;stroke:#0F1A2B;stroke-linecap:round;stroke-linejoin:round}
.gtcvw .gate.signed .stamp{transform:scale(1)}
.gtcvw .gate.v2 .stamp circle{fill:var(--cv-done)}
.gtcvw .fitbar{transition:opacity .3s}
.gtcvw .gtxt{font-family:var(--font);padding:12px 16px 0;height:100%;overflow:hidden}
.gtcvw .g-num{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;background:var(--cv-cyan);color:var(--cv-on-cyan);padding:2px 7px;border-radius:3px;text-transform:uppercase}
.gtcvw .g-num.slate{background:#445C87;color:#EEF2F8}
.gtcvw .g-num.gold{background:#D9B268;color:#0F1A2B}
.gtcvw .g-num.cyan{background:#70E8E9;color:#0F1A2B}
.gtcvw .g-num.lav{background:#B29CD2;color:#0F1A2B}
.gtcvw .colbar text{font-weight:700;letter-spacing:.2em}
.gtcvw .g-kind{font-size:10px;font-weight:600;letter-spacing:.16em;color:var(--cv-ink-3);margin-left:8px;text-transform:uppercase}
.gtcvw .g-name{font-weight:600;font-size:18.5px;line-height:1.16;letter-spacing:-.02em;color:var(--cv-ink);margin:6px 0 5px;padding-right:18px}
.gtcvw .g-q{font-size:13px;line-height:1.38;color:var(--cv-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gtcvw .gtxt.tr .g-q{display:none}
.gtcvw .gtxt.nm2 .g-q{-webkit-line-clamp:1}
.gtcvw .narrow .gtxt .g-q{-webkit-line-clamp:8}
.gtcvw .fit{display:inline-block;font-family:var(--font);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 8px;border-radius:3px;color:#0F1A2B;white-space:nowrap;line-height:1}
.gtcvw .fit.gold{background:#D9B268}
.gtcvw .fit.lav{background:#B29CD2}
.gtcvw .fit.cyan{background:#70E8E9}
.gtcvw .fit.slate{background:#445C87;color:#EEF2F8}
.gtcvw .narrow .gtxt{padding:12px 11px 0}
.gtcvw .narrow .g-name{font-size:17px;padding-right:0}
.gtcvw .narrow .g-q{font-size:12.5px}
.gtcvw .compact .gtxt{padding:7px 7px 0}
.gtcvw .compact .g-num{font-size:7.5px;padding:1px 4px;letter-spacing:.04em}
.gtcvw .compact .g-name{font-size:11.5px;line-height:1.15;margin:4px 0 0;padding-right:0;letter-spacing:-.01em}
.gtcvw .compact .strip .gtxt{display:flex;align-items:center;gap:8px;padding:0 10px;height:100%}
.gtcvw .compact .strip .g-name{margin:0;font-size:13px}
.gtcvw .setup{cursor:pointer}
.gtcvw .setup .box{fill:var(--cv-card);stroke:var(--cv-border);stroke-width:1.8;transition:all .4s}
.gtcvw .setup.active .box{stroke:var(--cv-prog);stroke-width:3.2;filter:drop-shadow(0 0 12px var(--cv-prog-glow))}
.gtcvw .setup .t1{fill:var(--cv-cyan);font-weight:700;letter-spacing:.2em}
.gtcvw .setup .t2{fill:var(--cv-ink);font-weight:500}
.gtcvw .scale text{font-weight:700;letter-spacing:.04em}
.gtcvw .reading circle{fill:transparent;stroke:var(--cv-ink-3);stroke-width:2;stroke-dasharray:3 3;transition:all .35s}
.gtcvw .reading.on circle{fill:#EEF2F8;stroke:#111111;stroke-dasharray:none}
.gtcvw .reading text{fill:var(--cv-ink-3);font-weight:700;letter-spacing:.1em;transition:fill .35s}
.gtcvw .reading.on text{fill:var(--cv-ink)}
.gtcvw .rec-label{fill:var(--cv-ink-3);font-weight:700;letter-spacing:.18em}
.gtcvw .recwrap{transition:filter .4s}
.gtcvw .recwrap.glow{filter:drop-shadow(0 0 8px var(--cv-glow))}
.gtcvw .rchip{transition:transform .2s}
.gtcvw .rchip rect{fill:none;stroke:var(--cv-border);stroke-width:1.5;transition:all .35s}
.gtcvw .rchip text{fill:var(--cv-ink-3);font-weight:600;transition:fill .35s}
.gtcvw .rchip.signed rect{fill:var(--cv-done);stroke:var(--cv-done)}
.gtcvw .rchip.signed text{fill:#0F1A2B}
.gtcvw .rchip.v2 rect{stroke:var(--cv-gold);stroke-width:3}
.gtcvw .own-track{fill:none;stroke:var(--cv-border);stroke-width:1.5}
.gtcvw .own-fill{fill:var(--cv-cyan);transition:width .8s ease}
.gtcvw .own-lab{fill:var(--cv-ink-3);font-weight:600;letter-spacing:.12em}
.gtcvw #token{pointer-events:none;opacity:0;transition:opacity .2s}
.gtcvw #token .core{fill:var(--cv-cyan)}
.gtcvw #token .halo{fill:var(--cv-cyan);opacity:.28}
.gtcvw .arc{fill:none;stroke:var(--cv-gold);stroke-linecap:round;opacity:0;transition:opacity .4s}
.gtcvw .arrowHead{fill:var(--cv-gold)}
@keyframes rise{from{opacity:.15}to{opacity:1}}
.gtcvw .intro .gate,.gtcvw .intro .setup{animation:rise .7s ease both}
@media (max-width: 720px), (orientation: portrait) and (max-width: 1100px){
.gtcvw{height:100vh;min-height:100vh}
.gtcvw .stage{overflow:auto;align-content:start;grid-auto-rows:max-content}
.gtcvw .top{padding:12px 16px;position:sticky;top:env(safe-area-inset-top,0px);z-index:3}
.gtcvw .logo{height:40px}
.gtcvw .brand .name b{font-size:16px}
.gtcvw .brand .name span{font-size:10.5px}
.gtcvw .stage{grid-template-columns:1fr;padding:12px 16px;gap:14px}
.gtcvw .canvas-wrap{display:block}
.gtcvw .canvas-wrap svg{height:auto;max-height:64vh;margin:0 auto}
.gtcvw .narr{padding:20px}
.gtcvw .narr h2{font-size:26px}
.gtcvw .scene{padding:28px 16px 40px;min-height:70vh}
.gtcvw .ghost{display:none}
.gtcvw .cards,.gtcvw .tl .cols{grid-template-columns:1fr}
.gtcvw .rep{grid-template-columns:1fr}
.gtcvw .ctrl{position:sticky;bottom:0;z-index:3;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px))}
.gtcvw .nav{width:100%}
.gtcvw .nav .nb{flex:1;padding:14px}
.gtcvw .dots,.gtcvw .keys,.gtcvw .foot{display:none}
.gtcvw .stepnum{display:block;flex:none;min-width:52px;text-align:center}
.gtcvw .eyebrow{letter-spacing:.14em;font-size:10.5px}
.gtcvw .eyebrow .count{display:none}
}
@media (max-width: 420px){
.gtcvw .brand .rule,.gtcvw .brand .name{display:none}
.gtcvw .modes button,.gtcvw .tbtn{padding:8px 10px;font-size:12px}
}
@media (prefers-reduced-motion: reduce){
.gtcvw *{transition:none!important;animation:none!important}
}
`

// ============================================================
// THE ONLY THING THE REFERENCE DOES NOT HAVE.
//
// The holding screen carries a square code for the presenter to scan and the
// four digit code underneath it, so the phone can be paired without anybody
// typing a web address in front of the room. Both sit in the bottom right and
// fade out the moment the phone is connected, because after that they are two
// pieces of clutter on a screen a funder is looking at.
//
// Every value here is the one Habib specified: 96 by 96 with a 12 pixel quiet
// zone, cream on the dark ground, and a 400 millisecond fade.
// ============================================================

/** The pairing corner on the holding screen. */
export const WALKTHROUGH_PAIRING_CSS = `
.gtcvw .pairing{position:absolute;right:clamp(20px,5vw,80px);bottom:clamp(24px,4.5vw,72px);display:flex;flex-direction:column;align-items:center;gap:10px;opacity:1;transition:opacity .4s}
.gtcvw .pairing[hidden]{display:none}
.gtcvw .pairing.gone{opacity:0;pointer-events:none}
.gtcvw .pairing canvas,.gtcvw .pairing img{width:96px;height:96px;display:block;background:#12222C;padding:12px;box-sizing:content-box}
.gtcvw .pairing .code{font-size:12px;font-weight:600;letter-spacing:.14em;color:rgba(245,245,220,.5);text-transform:uppercase}
.gtcvw[data-room="light"] .pairing canvas,.gtcvw[data-room="light"] .pairing img{background:#EDEDCF}
.gtcvw[data-room="light"] .pairing .code{color:rgba(18,34,44,.54)}
@media (max-width: 720px), (orientation: portrait) and (max-width: 1100px){
.gtcvw .pairing{position:static;margin-top:28px;align-items:flex-start}
}
`

// ============================================================
// WHAT HABIB ASKED FOR AFTER SEEING IT ON HIS OWN LAPTOP.
// 17 September 2026.
//
// The approved design was drawn at 1600 by 900. On a thirteen inch laptop the
// browser is about 1000 points wide, and at that width three things went wrong,
// all of them the same thing: the design had been given less room than it was
// drawn for, and it spent the shortfall in the worst places.
//
//   1. The header wrapped onto two lines, so Walkthrough, Explore and Play sat
//      under the logo instead of beside it. Habib: "should be at the same level
//      as the bar that has logo and name of the canvas so the entire screen can
//      be seen." Two rows of header is eighty points of height taken off the
//      canvas, which is the thing the room is looking at.
//
//   2. The canvas was therefore too small to read, with empty space either side
//      of it. That empty space is not spare room: the drawing keeps its shape,
//      so when it runs out of height it stops growing sideways too. Giving the
//      height back is what makes it bigger.
//
//   3. On the last screen each question wrapped onto three lines, which pushed
//      the heading off the top of the screen.
//
// So between a phone and a projector the header is made smaller rather than
// taller, the space around the canvas is tightened, and the questions are set
// to fit a line. Above 1400 points nothing here applies and the approved design
// is untouched, which is the size it will be shown at in the room.
// ============================================================

/** Fitting the approved design onto a laptop. */
export const WALKTHROUGH_ROOM_CSS = `
@media (min-width: 721px){
.gtcvw .top{flex-wrap:nowrap}
.gtcvw .brand{flex:1 1 auto;min-width:0}
.gtcvw .brand .name{min-width:0}
.gtcvw .brand .name b,.gtcvw .brand .name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gtcvw .tools{flex:0 0 auto;flex-wrap:nowrap}
.gtcvw .qlist{max-width:none}
.gtcvw .qlist li{font-size:clamp(15px,1.7vw,28px);margin-bottom:.55em}
}
@media (min-width: 721px) and (max-width: 1400px){
.gtcvw .top{padding:10px 20px;gap:8px 16px}
.gtcvw .logo{height:46px}
.gtcvw .brand{gap:16px}
.gtcvw .brand .name b{font-size:19px}
.gtcvw .brand .name span{font-size:10.5px;letter-spacing:.12em;margin-top:2px}
.gtcvw .modes button,.gtcvw .tbtn{font-size:12.5px;padding:8px 11px}
.gtcvw .tbtn svg{width:15px;height:15px}
.gtcvw .stage{padding:10px 16px;gap:16px;grid-template-columns:minmax(0,1fr) 340px}
.gtcvw .narr{padding:18px 20px}
.gtcvw .narr h2{font-size:25px}
.gtcvw .ctrl{padding:8px 16px 10px}
.gtcvw .scene{padding:clamp(16px,2.6vw,40px) clamp(16px,3vw,48px)}
}
`
