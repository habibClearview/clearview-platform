// The approved design's stylesheet, verbatim, plus one rule per style-hover
// attribute in the markup. The design is almost entirely inline styles; this
// is everything that could not be.
export const DESIGN_CSS = `body { margin: 0; background: #12222c; font-family: 'Poppins', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: #00afef; }
  a:hover { color: #f5f5dc; }
  * { box-sizing: border-box; }
  ::selection { background: #00afef; color: #12222c; }
  input::placeholder, textarea::placeholder { color: rgba(245,245,220,0.4); }
  @keyframes om-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes om-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .om-rail::-webkit-scrollbar { height: 6px; }
  .om-rail::-webkit-scrollbar-thumb { background: rgba(245,245,220,0.3); }
.hv1:hover{color: #00afef;}
.hv2:hover{border-color: #00afef; color: #00afef;}
.hv3:hover{border-color: #00afef; color: #00afef;}
.hv4:hover{color: #00afef;}
.hv5:hover{color: #00afef;}
.hv6:hover{color: #00afef;}
.hv7:hover{color: #00afef;}
.hv8:hover{color: #00afef;}
.hv9:hover{background: #f5f5dc;}
.hv10:hover{background: #f5f5dc;}
.hv11:hover{border-color: #00afef; color: #00afef;}
.hv12:hover{background: #00afef; color: #12222c;}
.hv13:hover{background: #0b1620;}
.hv14:hover{background: #00afef; color: #12222c;}
.hv15:hover{background: #12222c; color: #f5f5dc;}
.hv16:hover{background: #12222c;}
.hv17:hover{background: #12222c;}
.hv18:hover{color: #00afef;}
.hv19:hover{background: #1b2a41;}
.hv20:hover{background: #f5f5dc;}
.hv21:hover{border-color: #00afef; color: #00afef;}
.hv22:hover{background: #0b1620;}
.hv23:hover{background: #12222c; color: #f5f5dc;}
.hv24:hover{background: #0b1620;}
.hv25:hover{background: #12222c; color: #f5f5dc;}
.hv26:hover{border-color: #00afef; background: rgba(0,175,239,0.07);}
.hv27:hover{border-color: #00afef; background: rgba(0,175,239,0.07);}
.hv28:hover{color: #00afef;}
.hv29:hover{background: #f5f5dc;}
.hv30:hover{background: #2e7d32; border-color: #2e7d32;}
.hv31:hover{background: #00afef; border-color: #00afef; color: #12222c;}
.hv32:hover{color: #00afef;}
.hv33:hover{background: #f5f5dc;}
.hv34:hover{background: #f5f5dc;}
.hv35:hover{border-color: #00afef; color: #00afef;}
.hv36:hover{background: #f5f5dc;}
.hv37:hover{background: #f5f5dc;}
.hv38:hover{background: #f5f5dc;}
.hv39:hover{background: #f5f5dc;}
.hv40:hover{color: #00afef;}
.hv41:hover{color: #00afef;}
.hv42:hover{color: #00afef;}
.hv43:hover{color: #00afef;}
.hv44:hover{color: #00afef;}
.hv45:hover{color: #00afef;}
.hv46:hover{color: #00afef;}
.hv47:hover{color: #00afef;}
.hv48:hover{color: #00afef;}
.hv49:hover{color: #f5f5dc;}`
