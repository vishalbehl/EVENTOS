export const PREVIEW_RUNTIME_CSS = `
@keyframes wb-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-slide-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes wb-zoom-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes wb-rotate-in { from { opacity: 0; transform: rotate(-3deg) scale(0.98); } to { opacity: 1; transform: rotate(0) scale(1); } }
@keyframes wb-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes wb-soft-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.78; } }
@keyframes wb-slow-zoom { from { transform: scale(1); } to { transform: scale(1.08); } }
@keyframes wb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes wb-ac-aurora-shift { 0%, 100% { transform: translate3d(-8%, -5%, 0) rotate(-8deg) scale(1); } 50% { transform: translate3d(8%, 5%, 0) rotate(7deg) scale(1.14); } }
@keyframes wb-ac-spotlight-enter { to { opacity:1; transform:translateY(0) rotate(0); } }
@keyframes wb-ac-gradient-position { 0% { background-position:0 50%; } 50% { background-position:100% 50%; } 100% { background-position:0 50%; } }
@keyframes wb-ac-gradient-spin { to { transform: rotate(360deg); } }
@keyframes wb-ac-border-orbit { 0% { transform: translate3d(-45%, -45%, 0) rotate(0deg); } 100% { transform: translate3d(-45%, -45%, 0) rotate(360deg); } }
@keyframes wb-ac-text-reveal { from { opacity: 0; filter: blur(10px); transform: translateY(14px); } to { opacity: 1; filter: blur(0); transform: translateY(0); } }
@keyframes wb-ac-type { from { max-width: 0; } to { max-width: 100%; } }
@keyframes wb-ac-caret { 50% { border-color: transparent; } }
@keyframes wb-ac-track { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes wb-ac-sparkle { 0%, 100% { opacity: .18; transform: scale(.7); } 50% { opacity: .9; transform: scale(1.25); } }
@keyframes wb-ac-meteor { 0% { opacity: 0; transform: rotate(215deg) translateX(0); } 12% { opacity: 1; } 75%, 100% { opacity: 0; transform: rotate(215deg) translateX(-620px); } }

body.wb-runtime-ready [data-aos]:not([data-aos="none"]) { opacity:0; animation-duration:var(--wb-aos-duration,400ms); animation-delay:var(--wb-aos-delay,0ms); animation-timing-function:cubic-bezier(.22,1,.36,1); animation-fill-mode:both; animation-play-state:paused; }
body.wb-runtime-ready [data-aos].wb-in-view { animation-play-state:running; }
body.wb-runtime-ready [data-aos="fade"].wb-in-view { animation-name:wb-fade-in; }
body.wb-runtime-ready [data-aos="slide"].wb-in-view { animation-name:wb-slide-up; }
body.wb-runtime-ready [data-aos="zoom"].wb-in-view { animation-name:wb-zoom-in; }
body.wb-runtime-ready [data-aos="rotate"].wb-in-view { animation-name:wb-rotate-in; }

.wb-ac-component { --ac-primary: #8b5cf6; --ac-secondary: #22d3ee; }
.wb-ac-aurora-clip { position:absolute;inset:0;overflow:hidden;pointer-events:none; }
.wb-ac-aurora-layer { position:absolute;inset:-10px;background-image:repeating-linear-gradient(100deg,#0f172a 0 7%,transparent 10% 12%,#0f172a 16%),repeating-linear-gradient(100deg,var(--ac-primary) 10%,#a5b4fc 15%,var(--ac-secondary) 20%,#ddd6fe 25%,var(--ac-primary) 30%);background-size:300% 200%;background-position:50% 50%;filter:blur(10px) invert(0);opacity:.58;will-change:transform;animation:wb-ac-aurora-shift 18s ease-in-out infinite;mask-image:radial-gradient(ellipse at 100% 0%,#000 10%,transparent 70%); }
.wb-ac-spotlight-beam { position:absolute;z-index:1;width:138%;height:169%;left:-18%;top:-50%;color:var(--ac-primary);opacity:0;transform:translateY(-14%) rotate(-8deg);animation:wb-ac-spotlight-enter 1.8s ease .25s both;pointer-events:none; }
.wb-ac-gradient-card { isolation:isolate; }
.wb-ac-gradient-blur,.wb-ac-gradient-edge { position:absolute;inset:0;border-radius:inherit;background:radial-gradient(circle farthest-side at 0 100%,#00ccb1,transparent),radial-gradient(circle farthest-side at 100% 0,var(--ac-primary),transparent),radial-gradient(circle farthest-side at 100% 100%,#ffc414,transparent),radial-gradient(circle farthest-side at 0 0,var(--ac-secondary),#141316);background-size:400% 400%;animation:wb-ac-gradient-position 5s ease-in-out infinite alternate; }
.wb-ac-gradient-blur { z-index:0;opacity:.6;filter:blur(20px);transition:opacity .5s ease; }
.wb-ac-gradient-card:hover .wb-ac-gradient-blur { opacity:1; }
.wb-ac-gradient-edge { z-index:0; }
.wb-ac-hover-border { position:relative; background:linear-gradient(115deg, var(--ac-primary), var(--ac-secondary), var(--ac-primary)); background-size:220% 100%; transition:transform .2s ease, background-position .35s ease, box-shadow .2s ease; }
.wb-ac-hover-border:hover { transform:translateY(-2px); background-position:100% 0; box-shadow:0 16px 34px color-mix(in srgb, var(--ac-primary) 28%, transparent); }
.wb-ac-moving-border { background:#151827; }
.wb-ac-moving-border-orbit { position:absolute; left:50%; top:50%; width:220%; height:36px; background:linear-gradient(90deg, transparent, var(--ac-secondary), var(--ac-primary), transparent); transform-origin:center; animation:wb-ac-border-orbit 3.5s linear infinite; }
.wb-ac-bento-item { min-height:210px; display:flex; flex-direction:column; justify-content:flex-end; padding:26px; border:1px solid rgba(255,255,255,.1); border-radius:14px; background:linear-gradient(145deg,#111522,#0c0f19); box-sizing:border-box; transition:transform .22s ease,border-color .22s ease,background .22s ease; }
.wb-ac-bento-item:hover { transform:translateY(-4px); border-color:color-mix(in srgb, var(--ac-primary) 58%, transparent); background:linear-gradient(145deg,#161a2a,#0d101b); }
.wb-ac-bento-item--wide { grid-column:span 2; }
.wb-ac-bento-item h3 { margin:12px 0 8px; font-size:24px; color:#f8fafc; }
.wb-ac-bento-item p { margin:0; color:#9aa5b6; line-height:1.55; }
.wb-ac-bento-kicker { color:var(--ac-secondary); font-size:11px; font-weight:900; }
.wb-ac-generated-text { animation:wb-ac-text-reveal .8s cubic-bezier(.22,1,.36,1) both; }
.wb-ac-typewriter-text { max-width:100%; overflow:hidden; white-space:nowrap; border-right:2px solid var(--ac-secondary); animation:wb-ac-type 4s steps(34,end) both,wb-ac-caret .8s step-end infinite; }
.wb-ac-infinite-track { display:flex; width:max-content; gap:16px; padding:0 8px; animation:wb-ac-track 28s linear infinite; }
.wb-ac-infinite-cards:hover .wb-ac-infinite-track { animation-play-state:paused; }
.wb-ac-quote-card { width:min(420px,78vw); flex:0 0 auto; padding:24px; border:1px solid rgba(255,255,255,.11); border-radius:14px; background:#10131f; box-sizing:border-box; }
.wb-ac-quote-card p { margin:0 0 18px; color:#e5e7eb; font-size:17px; line-height:1.6; }
.wb-ac-quote-card strong { color:#8f9bad; font-size:12px; }
.wb-ac-grid-background { background-image:linear-gradient(rgba(148,163,184,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.1) 1px,transparent 1px) !important; background-size:40px 40px !important; }
.wb-ac-grid-fade { position:absolute; inset:0; background:radial-gradient(circle at center,transparent 12%,#06070d 76%); pointer-events:none; }
.wb-ac-sparkle-field { position:absolute; inset:0; opacity:.8; background-image:radial-gradient(circle at 15% 20%,#fff 0 1px,transparent 2px),radial-gradient(circle at 78% 26%,var(--ac-secondary) 0 1px,transparent 2px),radial-gradient(circle at 33% 72%,var(--ac-primary) 0 1.5px,transparent 3px),radial-gradient(circle at 88% 82%,#fff 0 1px,transparent 2px),radial-gradient(circle at 58% 48%,#fff 0 1px,transparent 2px); background-size:180px 180px,220px 220px,260px 260px,200px 200px,240px 240px; animation:wb-ac-sparkle 4.5s ease-in-out infinite; pointer-events:none; }
.wb-ac-meteor-field { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.wb-ac-meteor-field i { position:absolute; top:-20%; left:calc(12% * var(--meteor-index,1)); width:110px; height:1px; background:linear-gradient(90deg,#fff,transparent); opacity:0; animation:wb-ac-meteor 6s linear infinite; }
.wb-ac-meteor-field i:nth-child(1) { left:12%; animation-delay:.2s; }.wb-ac-meteor-field i:nth-child(2) { left:28%; animation-delay:1.4s; }.wb-ac-meteor-field i:nth-child(3) { left:46%; animation-delay:2.6s; }.wb-ac-meteor-field i:nth-child(4) { left:63%; animation-delay:3.2s; }.wb-ac-meteor-field i:nth-child(5) { left:78%; animation-delay:4.4s; }.wb-ac-meteor-field i:nth-child(6) { left:92%; animation-delay:5.1s; }

@keyframes wb-ac-beam-drop { 0% { opacity:0; transform:translateY(-45%) scaleY(.3); } 18% { opacity:.8; } 100% { opacity:0; transform:translateY(65%) scaleY(1.25); } }
@keyframes wb-ac-pan { from { background-position:0 0; } to { background-position:120px 80px; } }
@keyframes wb-ac-gradient-flow { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }
@keyframes wb-ac-line-flow { from { transform:translateX(-16%) skewX(-12deg); } to { transform:translateX(16%) skewX(12deg); } }
@keyframes wb-ac-grain { 0%,100% { transform:translate(0); } 25% { transform:translate(2%,-3%); } 50% { transform:translate(-3%,2%); } 75% { transform:translate(3%,3%); } }
@keyframes wb-ac-wave { from { transform:translateX(-12%); } to { transform:translateX(12%); } }
@keyframes wb-ac-vortex { to { transform:rotate(360deg) scale(1.04); } }
@keyframes wb-ac-color-cycle { 0%,100% { filter:hue-rotate(0deg); } 50% { filter:hue-rotate(80deg); } }
@keyframes wb-ac-squiggle { from { background-position-x:0; } to { background-position-x:48px; } }
@keyframes wb-ac-loader-spin { to { transform:rotate(360deg); } }
@keyframes wb-ac-extended-drift { 0%,100% { transform:translate3d(-4%,-3%,0) rotate(-3deg); } 50% { transform:translate3d(5%,4%,0) rotate(4deg); } }

.wb-ac-extended { --ac-primary:#8b5cf6;--ac-secondary:#22d3ee; }
.wb-ac-extended-content { position:relative;z-index:2;width:100%;max-width:980px;margin:0 auto; }
.wb-ac-extended-content > p:first-child { margin:0 0 12px;color:var(--ac-secondary);font-size:11px;font-weight:900;text-transform:uppercase; }
.wb-ac-extended-content h2 { margin:0 0 16px;font-size:clamp(38px,6vw,70px);line-height:1.06;color:#f8fafc; }
.wb-ac-extended-content > p:last-of-type { max-width:680px;margin:0 0 26px;color:#9aa5b6;font-size:17px;line-height:1.65; }
.wb-ac-extended-content > a,.wb-ac-extended-form button { display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:0 20px;border:0;border-radius:9px;background:var(--ac-primary);color:#fff;text-decoration:none;font-weight:850;cursor:pointer; }
.wb-ac-extended-effect { position:absolute;inset:-30%;opacity:.8;background:conic-gradient(from 45deg,transparent,color-mix(in srgb,var(--ac-primary) 48%,transparent),transparent 38%,color-mix(in srgb,var(--ac-secondary) 36%,transparent),transparent 72%);filter:blur(58px);animation:wb-ac-extended-drift 12s ease-in-out infinite;pointer-events:none; }
.wb-ac-extended-effect i { position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 20px var(--ac-secondary); }.wb-ac-extended-effect i:nth-child(1){left:28%;top:38%}.wb-ac-extended-effect i:nth-child(2){right:23%;top:27%}.wb-ac-extended-effect i:nth-child(3){left:54%;bottom:25%}
.wb-ac-extended-card { transform-style:preserve-3d;transition:transform .24s ease,border-color .24s ease,box-shadow .24s ease; }.wb-ac-extended-card:hover { transform:perspective(900px) rotateX(1.5deg) rotateY(-2deg) translateY(-5px);border-color:color-mix(in srgb,var(--ac-primary) 58%,transparent);box-shadow:0 28px 70px rgba(0,0,0,.36); }.wb-ac-extended-card-glow { position:absolute;inset:-45%;background:radial-gradient(circle at 70% 24%,color-mix(in srgb,var(--ac-primary) 28%,transparent),transparent 36%);pointer-events:none; }
.wb-ac-extended-text h2 { max-width:1000px;background:linear-gradient(90deg,#fff,var(--ac-secondary),#fff);background-size:220% auto;background-clip:text;-webkit-background-clip:text;color:transparent !important;animation:wb-ac-gradient-flow 7s linear infinite; }
.wb-ac-extended-form h2 { margin:0 0 10px;font-size:32px; }.wb-ac-extended-form p { margin:0 0 24px;color:#9aa5b6;line-height:1.55; }.wb-ac-extended-form label { display:block;margin:0 0 8px;color:#dbe3ef;font-size:13px;font-weight:800; }.wb-ac-extended-form input { width:100%;min-height:48px;margin:0 0 14px;padding:0 14px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#111522;color:#fff;font:inherit;box-sizing:border-box; }.wb-ac-extended-form input:focus { outline:2px solid var(--ac-primary);outline-offset:2px; }
.wb-ac-extended-utility .wb-ac-extended-content { max-width:1060px; }.wb-ac-extended-demo { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px; }.wb-ac-extended-demo span { min-height:120px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:linear-gradient(145deg,#151827,#0c0f18);transition:transform .2s ease,border-color .2s ease; }.wb-ac-extended-demo span:hover { transform:translateY(-4px);border-color:var(--ac-primary); }

.wb-ac-static .wb-ac-effect-layer { position:absolute; inset:0; pointer-events:none; }
.wb-ac-background-beams .wb-ac-effect-layer,.wb-ac-background-beams-with-collision .wb-ac-effect-layer { inset:-20% 0; opacity:.75; background:repeating-linear-gradient(90deg,transparent 0 8%,color-mix(in srgb,var(--ac-primary) 72%,transparent) 8.2%,transparent 8.6% 16%); mask-image:linear-gradient(to bottom,transparent,#000 20%,#000 70%,transparent); animation:wb-ac-beam-drop 7s linear infinite; }
.wb-ac-background-beams-with-collision::after { content:"";position:absolute;left:12%;right:12%;bottom:18%;height:1px;background:linear-gradient(90deg,transparent,var(--ac-secondary),transparent);box-shadow:0 0 28px var(--ac-secondary); }
.wb-ac-background-boxes .wb-ac-effect-layer { background-image:linear-gradient(rgba(139,92,246,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.12) 1px,transparent 1px);background-size:54px 54px;animation:wb-ac-pan 14s linear infinite;mask-image:radial-gradient(circle,#000 12%,transparent 76%); }
.wb-ac-background-gradient-animation { background:linear-gradient(125deg,#06070d,var(--ac-primary),#111827,var(--ac-secondary),#06070d) !important;background-size:320% 320% !important;animation:wb-ac-gradient-flow 14s ease infinite; }
.wb-ac-background-gradient-animation .wb-ac-effect-layer { background:rgba(2,4,10,.56);backdrop-filter:blur(22px); }
.wb-ac-background-lines .wb-ac-effect-layer { inset:8% -25%;background:repeating-linear-gradient(170deg,transparent 0 22px,color-mix(in srgb,var(--ac-primary) 55%,transparent) 23px,transparent 25px 47px);mask-image:radial-gradient(ellipse,#000,transparent 72%);animation:wb-ac-line-flow 10s ease-in-out infinite alternate; }
.wb-ac-dotted-glow-background .wb-ac-effect-layer { background-image:radial-gradient(circle,color-mix(in srgb,var(--ac-secondary) 70%,transparent) 1px,transparent 1.8px);background-size:28px 28px;mask-image:radial-gradient(circle,#000 10%,transparent 74%);filter:drop-shadow(0 0 5px var(--ac-secondary));animation:wb-ac-soft-pulse 4s ease-in-out infinite; }
.wb-ac-noise-background .wb-ac-effect-layer { inset:-40%;opacity:.18;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.9'/%3E%3C/svg%3E");animation:wb-ac-grain .45s steps(2) infinite; }
.wb-ac-shooting-stars .wb-ac-effect-layer,.wb-ac-stars-background .wb-ac-effect-layer { background-image:radial-gradient(circle at 18% 28%,#fff 0 1px,transparent 1.8px),radial-gradient(circle at 68% 18%,var(--ac-secondary) 0 1px,transparent 2px),radial-gradient(circle at 38% 78%,#fff 0 1px,transparent 2px),radial-gradient(circle at 88% 68%,var(--ac-primary) 0 1px,transparent 2px);background-size:170px 170px,230px 230px,210px 210px,260px 260px;animation:wb-ac-soft-pulse 4s ease-in-out infinite; }
.wb-ac-shooting-stars::after { content:"";position:absolute;top:22%;right:14%;width:140px;height:1px;background:linear-gradient(90deg,#fff,transparent);transform:rotate(-28deg);animation:wb-ac-meteor 4.8s linear infinite; }
.wb-ac-spotlight-new .wb-ac-effect-layer { background:radial-gradient(ellipse 52% 70% at 50% -8%,color-mix(in srgb,var(--ac-primary) 58%,transparent),transparent 72%);filter:blur(5px); }
.wb-ac-wavy-background .wb-ac-effect-layer { inset:12% -24%;background:repeating-radial-gradient(ellipse at 50% 100%,transparent 0 32px,color-mix(in srgb,var(--ac-secondary) 45%,transparent) 34px,transparent 37px 66px);mask-image:linear-gradient(transparent,#000 25%,#000 78%,transparent);animation:wb-ac-wave 7s ease-in-out infinite alternate; }
.wb-ac-vortex .wb-ac-effect-layer { inset:-45%;border-radius:50%;background:repeating-conic-gradient(from 0deg,transparent 0 8deg,color-mix(in srgb,var(--ac-primary) 42%,transparent) 9deg,transparent 11deg 19deg,color-mix(in srgb,var(--ac-secondary) 28%,transparent) 20deg,transparent 22deg 30deg);mask-image:radial-gradient(circle,transparent 0 16%,#000 28%,transparent 70%);animation:wb-ac-vortex 24s linear infinite; }

.wb-ac-card-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px; }
.wb-ac-effect-card { position:relative;min-height:250px;display:flex;flex-direction:column;justify-content:flex-end;padding:26px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background-color:#10131f;overflow:hidden;box-sizing:border-box;transition:transform .22s ease,opacity .22s ease,filter .22s ease,border-color .22s ease,box-shadow .22s ease; }
.wb-ac-effect-card > * { position:relative;z-index:2; }.wb-ac-effect-card > span { color:var(--ac-secondary);font-size:11px;font-weight:900; }.wb-ac-effect-card h3 { margin:12px 0 8px;color:#f8fafc;font-size:23px; }.wb-ac-effect-card p { margin:0;color:#9aa5b6;line-height:1.55; }
.wb-ac-card-hover-effect .wb-ac-effect-card:hover,.wb-ac-wobble-card .wb-ac-effect-card:hover { transform:translateY(-7px) rotate(.35deg);border-color:color-mix(in srgb,var(--ac-primary) 55%,transparent); }
.wb-ac-card-spotlight .wb-ac-effect-card::before { content:"";position:absolute;inset:-40%;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--ac-primary) 28%,transparent),transparent 42%);opacity:.35;transition:opacity .2s ease; }.wb-ac-card-spotlight .wb-ac-effect-card:hover::before { opacity:1; }
.wb-ac-glowing-effect .wb-ac-effect-card:hover { border-color:var(--ac-primary);box-shadow:0 0 0 1px var(--ac-primary),0 18px 50px color-mix(in srgb,var(--ac-primary) 26%,transparent); }
.wb-ac-glowing-stars .wb-ac-effect-card { background-image:radial-gradient(circle at 20% 20%,rgba(255,255,255,.55) 0 1px,transparent 2px),radial-gradient(circle at 80% 32%,rgba(34,211,238,.65) 0 1px,transparent 2px);background-size:80px 80px,120px 120px; }
.wb-ac-focus-cards .wb-ac-card-grid:hover .wb-ac-effect-card:not(:hover) { opacity:.48;filter:blur(1.5px);transform:scale(.98); }.wb-ac-focus-cards .wb-ac-effect-card:hover { transform:scale(1.015); }

.wb-ac-colourful-text .wb-ac-text-effect { color:transparent !important;background:linear-gradient(90deg,var(--ac-primary),var(--ac-secondary),#f472b6,var(--ac-primary));background-size:220% auto;background-clip:text;-webkit-background-clip:text;animation:wb-ac-gradient-flow 5s linear infinite; }
.wb-ac-flip-words .wb-ac-text-effect { animation:wb-ac-text-reveal .75s ease both; }
.wb-ac-hero-highlight .wb-ac-text-effect { display:inline;background:linear-gradient(transparent 58%,color-mix(in srgb,var(--ac-primary) 48%,transparent) 58% 92%,transparent 92%); }
.wb-ac-pointer-highlight .wb-ac-text-effect { display:inline;padding:0 8px;border:2px solid color-mix(in srgb,var(--ac-primary) 74%,transparent);border-radius:6px;box-shadow:-8px 8px 0 color-mix(in srgb,var(--ac-secondary) 20%,transparent); }
.wb-ac-squiggly-text .wb-ac-text-effect { display:inline;background-image:url("data:image/svg+xml,%3Csvg width='48' height='8' viewBox='0 0 48 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 5 Q6 1 12 5 T24 5 T36 5 T48 5' fill='none' stroke='%2322d3ee' stroke-width='2'/%3E%3C/svg%3E");background-repeat:repeat-x;background-position:left bottom;background-size:48px 8px;padding-bottom:10px;animation:wb-ac-squiggle 1.8s linear infinite; }
.wb-ac-text-hover-effect .wb-ac-text-effect { color:transparent !important;-webkit-text-stroke:1px #8f9bad;transition:color .25s ease,-webkit-text-stroke .25s ease; }.wb-ac-text-hover-effect:hover .wb-ac-text-effect { color:var(--ac-primary) !important;-webkit-text-stroke:1px transparent; }
.wb-ac-magnetic-button,.wb-ac-stateful-button { transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease; }.wb-ac-magnetic-button:hover { transform:translateY(-3px) scale(1.025);box-shadow:0 16px 34px color-mix(in srgb,var(--ac-primary) 25%,transparent); }.wb-ac-stateful-button:hover { background-color:var(--ac-primary) !important;box-shadow:0 12px 30px color-mix(in srgb,var(--ac-primary) 25%,transparent); }
.wb-ac-sticky-banner { box-shadow:0 8px 26px rgba(0,0,0,.2); }
.wb-ac-primary-action { display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:0 22px;border:0;border-radius:10px;background:var(--ac-primary);color:#fff;text-decoration:none;font-weight:850;cursor:pointer; }
.wb-ac-modal-backdrop { position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:rgba(2,4,10,.76);backdrop-filter:blur(10px); }.wb-ac-modal-backdrop[hidden] { display:none; }.wb-ac-modal-panel { position:relative;width:min(520px,100%);padding:32px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:#0c0f19;text-align:left;box-shadow:0 30px 100px rgba(0,0,0,.55);animation:wb-ac-text-reveal .28s ease both; }.wb-ac-modal-panel h2 { margin:0 36px 12px 0;font-size:30px; }.wb-ac-modal-panel p { margin:0 0 24px;color:#9aa5b6;line-height:1.6; }.wb-ac-modal-close { position:absolute;top:14px;right:14px;width:34px;height:34px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#151827;color:#fff;font-size:20px;cursor:pointer; }
.wb-ac-tooltip-group .wb-ac-avatar { position:relative;width:52px;height:52px;margin-left:-8px;border:2px solid #070812;border-radius:50%;background:linear-gradient(135deg,var(--ac-primary),var(--ac-secondary));color:#fff;font-weight:900;cursor:pointer;transition:transform .18s ease,z-index .18s ease; }.wb-ac-tooltip-group .wb-ac-avatar:first-child { margin-left:0; }.wb-ac-tooltip-group .wb-ac-avatar:hover,.wb-ac-tooltip-group .wb-ac-avatar:focus-visible { z-index:2;transform:translateY(-7px) scale(1.08); }.wb-ac-tooltip-group .wb-ac-avatar::after { content:attr(data-tooltip);position:absolute;left:50%;bottom:calc(100% + 10px);width:max-content;max-width:190px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#111522;color:#fff;font-size:10px;opacity:0;pointer-events:none;transform:translate(-50%,5px);transition:opacity .16s ease,transform .16s ease; }.wb-ac-tooltip-group .wb-ac-avatar:hover::after,.wb-ac-tooltip-group .wb-ac-avatar:focus-visible::after { opacity:1;transform:translate(-50%,0); }
.wb-ac-carousel-viewport { overflow:hidden;border-radius:16px; }.wb-ac-carousel-track { display:flex;transition:transform .45s cubic-bezier(.22,1,.36,1); }.wb-ac-carousel-slide { min-width:100%;min-height:360px;display:flex;flex-direction:column;justify-content:flex-end;padding:38px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:linear-gradient(145deg,#151a2a,#0c0f18);box-sizing:border-box; }.wb-ac-carousel-slide > span { color:var(--ac-secondary);font-size:12px;font-weight:900; }.wb-ac-carousel-slide h3 { margin:14px 0 10px;font-size:34px;color:#fff; }.wb-ac-carousel-slide p { max-width:600px;margin:0;color:#9aa5b6;font-size:17px;line-height:1.6; }.wb-ac-carousel-controls { display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px; }.wb-ac-carousel-controls button { width:40px;height:40px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#111522;color:#fff;cursor:pointer; }.wb-ac-carousel-controls span { min-width:48px;color:#8f9bad;font-size:11px;text-align:center; }
.wb-ac-runtime-tabs [role="tablist"] { display:flex;gap:6px;margin-bottom:14px;padding:5px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0c0f18; }.wb-ac-runtime-tabs [role="tab"] { flex:1;min-height:42px;border:0;border-radius:8px;background:transparent;color:#8f9bad;font-weight:800;cursor:pointer; }.wb-ac-runtime-tabs [role="tab"][aria-selected="true"] { background:var(--ac-primary);color:#fff; }.wb-ac-runtime-tabs [role="tabpanel"] { min-height:220px;padding:30px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#10131f; }.wb-ac-runtime-tabs [role="tabpanel"][hidden] { display:none; }.wb-ac-runtime-tabs h3 { margin:0 0 10px;font-size:28px; }.wb-ac-runtime-tabs p { margin:0;color:#9aa5b6;line-height:1.65; }
.wb-ac-runtime-nav { display:flex;align-items:center;justify-content:space-between;gap:18px;backdrop-filter:blur(18px);transition:max-width .24s ease,background-color .24s ease,box-shadow .24s ease; }.wb-ac-runtime-nav.is-scrolled { max-width:880px !important;background-color:rgba(8,10,18,.97) !important;box-shadow:0 18px 50px rgba(0,0,0,.3); }.wb-ac-nav-brand { color:#fff;text-decoration:none;font-weight:900; }.wb-ac-runtime-nav nav { display:flex;align-items:center;gap:18px; }.wb-ac-runtime-nav nav a { color:#aeb7c8;text-decoration:none;font-size:13px;font-weight:750; }.wb-ac-runtime-nav .wb-ac-nav-cta { padding:10px 14px;border-radius:8px;background:var(--ac-primary);color:#fff; }.wb-ac-runtime-nav [data-nav-toggle] { display:none;min-height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#111522;color:#fff; }
.wb-ac-runtime-sidebar strong { display:block;margin-bottom:24px;font-size:22px; }.wb-ac-runtime-sidebar nav { display:grid;gap:6px; }.wb-ac-runtime-sidebar a { padding:11px 12px;border-radius:8px;color:#aeb7c8;text-decoration:none;font-size:14px;font-weight:750; }.wb-ac-runtime-sidebar a:hover { background:rgba(255,255,255,.06);color:#fff; }
.wb-ac-floating-dock a { display:grid;width:42px;height:42px;place-items:center;border-radius:10px;background:#151827;color:#fff;text-decoration:none;font-size:12px;font-weight:900;transition:transform .18s ease,background .18s ease; }.wb-ac-floating-dock a:hover { transform:translateY(-7px) scale(1.1);background:var(--ac-primary); }
.wb-ac-sticky-reveal-grid { max-width:1040px;margin:0 auto;display:grid;grid-template-columns:.8fr 1.2fr;gap:42px; }.wb-ac-sticky-copy { position:sticky;top:120px;align-self:start;display:grid;gap:8px; }.wb-ac-sticky-copy p { margin:0;padding:12px;border-left:2px solid rgba(255,255,255,.12);color:#667085;transition:color .2s ease,border-color .2s ease; }.wb-ac-sticky-copy p.is-active { border-color:var(--ac-primary);color:#fff; }.wb-ac-reveal-panels { display:grid;gap:30px; }.wb-ac-reveal-panels article { min-height:360px;padding:34px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#10131f;opacity:.42;transform:scale(.98);transition:opacity .3s ease,transform .3s ease; }.wb-ac-reveal-panels article.is-active { opacity:1;transform:scale(1); }.wb-ac-reveal-panels h3 { margin:0 0 12px;font-size:34px; }.wb-ac-reveal-panels p { margin:0;color:#9aa5b6;line-height:1.65; }
.wb-ac-step-loader { display:flex;align-items:flex-start;gap:18px; }.wb-ac-loader-ring { width:24px;height:24px;flex:0 0 auto;border:2px solid rgba(255,255,255,.14);border-top-color:var(--ac-primary);border-radius:50%;animation:wb-ac-loader-spin .8s linear infinite; }.wb-ac-step-loader ol { display:grid;gap:8px;margin:14px 0 0;padding:0;list-style:none; }.wb-ac-step-loader li { color:#667085;font-size:12px; }.wb-ac-step-loader li.is-active { color:#fff; }
.wb-ac-link-preview a { position:relative;color:var(--ac-secondary);font-weight:850; }.wb-ac-link-preview [role="tooltip"] { position:absolute;left:50%;bottom:calc(100% + 12px);z-index:20;width:240px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#111522;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.4);opacity:0;pointer-events:none;transform:translate(-50%,6px);transition:opacity .18s ease,transform .18s ease; }.wb-ac-link-preview [role="tooltip"] strong,.wb-ac-link-preview [role="tooltip"] small { display:block; }.wb-ac-link-preview [role="tooltip"] small { margin-top:5px;color:#8f9bad;font-size:11px; }.wb-ac-link-preview a:hover [role="tooltip"],.wb-ac-link-preview a:focus-visible [role="tooltip"] { opacity:1;transform:translate(-50%,0); }
[data-hover-effect="lift"]:hover { transform:translateY(-5px);box-shadow:0 18px 42px rgba(0,0,0,.2); }
[data-hover-effect="scale"]:hover { transform:scale(1.025); }
[data-hover-effect="glow"]:hover { border-color:var(--primary);box-shadow:0 0 0 1px var(--primary),0 18px 46px color-mix(in srgb,var(--primary) 24%,transparent); }
[data-hover-effect="grayscale"] img { filter:grayscale(1);transition:filter .22s ease; }
[data-hover-effect="grayscale"]:hover img { filter:grayscale(0); }
[data-hover-effect="pulse"]:hover { animation:wb-soft-pulse .8s ease-in-out infinite; }
[data-wb-runtime="tabs"] [role="tabpanel"][hidden] { display:none !important; }
[data-wb-runtime="tabs"] [role="tab"][aria-selected="true"] { color:var(--primary) !important;border-bottom-color:var(--primary) !important; }
[data-wb-runtime="tabs"][data-tab-style="pills"] [role="tab"],[data-wb-runtime="tabs"][data-tab-style="buttons"] [role="tab"] { border:1px solid var(--border) !important;border-radius:999px;background:var(--muted); }
[data-wb-runtime="tabs"][data-tab-style="cards"] [role="tab"] { border:1px solid var(--border) !important;border-radius:8px;background:var(--card); }
[data-wb-runtime="accordion"] details + details { margin-top:8px; }
[data-wb-runtime="accordion"][data-chevron="plus-minus"] summary::after { content:"+";float:right; }
[data-wb-runtime="accordion"][data-chevron="plus-minus"] details[open] summary::after { content:"-"; }
[data-wb-runtime="gallery"] [data-lightbox-item] { display:block;cursor:zoom-in; }
.wb-gallery-lightbox { position:fixed;inset:0;z-index:99999;place-items:center;padding:28px;border:0;background:rgba(2,4,10,.88);backdrop-filter:blur(10px); }
.wb-gallery-lightbox[open] { display:grid; }
.wb-gallery-lightbox img { display:block;max-width:min(1200px,94vw);max-height:88vh;object-fit:contain;border-radius:10px; }

@media (max-width: 760px) {
  .wb-ac-bento-grid { grid-template-columns:1fr !important; }
  .wb-ac-bento-item--wide { grid-column:span 1; }
  .wb-ac-typewriter-text { white-space:normal; border-right:0; animation:wb-ac-text-reveal .7s ease both; }
  .wb-ac-card-grid { grid-template-columns:1fr; }
  .wb-ac-runtime-nav { top:8px !important;margin:8px !important; }.wb-ac-runtime-nav [data-nav-toggle] { display:inline-flex;align-items:center; }.wb-ac-runtime-nav nav { position:absolute;left:0;right:0;top:calc(100% + 8px);display:none;align-items:stretch;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0b0e18; }.wb-ac-runtime-nav nav.is-open { display:grid; }.wb-ac-sticky-reveal-grid { grid-template-columns:1fr; }.wb-ac-sticky-copy { position:static; }.wb-ac-carousel-slide { min-height:300px;padding:26px; }
}

@media (min-width:1025px) { [data-hide-desktop="true"] { display:none !important; } }
@media (min-width:768px) and (max-width:1024px) {
  [data-hide-tablet="true"] { display:none !important; }
  [data-responsive-grid="true"] { grid-template-columns:repeat(var(--wb-grid-tablet,2),minmax(0,1fr)) !important; }
  [data-responsive-height-tablet] { height:var(--wb-height-tablet,40px) !important; }
}
@media (max-width:767px) {
  [data-hide-mobile="true"] { display:none !important; }
  [data-stack="true"] { display:flex !important;flex-direction:column !important; }
  [data-reverse-cols="true"] { display:flex !important;flex-direction:column-reverse !important; }
  [data-responsive-grid="true"] { grid-template-columns:repeat(var(--wb-grid-mobile,1),minmax(0,1fr)) !important; }
  [data-responsive-height-mobile] { height:var(--wb-height-mobile,24px) !important; }
}

@media (prefers-reduced-motion: reduce) {
  body.wb-runtime-ready [data-aos] { opacity:1 !important; transform:none !important; animation:none !important; }
  .wb-ac-component, .wb-ac-component *, .wb-ac-component::before { animation-duration:.001ms !important; animation-iteration-count:1 !important; scroll-behavior:auto !important; }
}
`;

export const WEBSITE_RUNTIME_SCRIPT = `
(() => {
  const pad = value => String(Math.max(0, value)).padStart(2, '0');
  const setText = (root, selector, value) => {
    root.querySelectorAll(selector).forEach(node => {
      node.textContent = value;
    });
  };
  const updateCountdown = root => {
    const targetValue = root.getAttribute('data-target') || root.getAttribute('data-countdown');
    if (!targetValue) return;
    const target = new Date(targetValue).getTime();
    if (!Number.isFinite(target)) return;
    const diff = target - Date.now();
    if (diff <= 0) {
      const message = root.getAttribute('data-expired-message') || root.getAttribute('data-expired-msg') || 'Started';
      setText(root, '[data-role="days"]', message);
      setText(root, '[data-role="hours"], [data-role="minutes"], [data-role="seconds"]', '00');
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setText(root, '[data-role="days"]', pad(days));
    setText(root, '[data-role="hours"]', pad(hours));
    setText(root, '[data-role="minutes"]', pad(minutes));
    setText(root, '[data-role="seconds"]', pad(seconds));
    const numericNodes = Array.from(root.querySelectorAll('div')).filter(node => /^\\d+$/.test((node.textContent || '').trim()));
    const fallbackValues = [pad(days), pad(hours), pad(minutes), pad(seconds)];
    numericNodes.slice(0, fallbackValues.length).forEach((node, index) => {
      if (!node.getAttribute('data-role')) node.textContent = fallbackValues[index];
    });
  };
  const tick = () => {
    document.querySelectorAll('[data-gjs-type="countdown"], [data-countdown]').forEach(updateCountdown);
  };
  if (window.__eventosCountdownTimer) window.clearInterval(window.__eventosCountdownTimer);
  tick();
  window.__eventosCountdownTimer = window.setInterval(tick, 1000);

  document.body.classList.add('wb-runtime-ready');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animated = Array.from(document.querySelectorAll('[data-aos]:not([data-aos="none"])'));
  animated.forEach(node => {
    const duration = Math.max(0, Number(node.getAttribute('data-aos-duration')) || 400);
    const delay = Math.max(0, Number(node.getAttribute('data-aos-delay')) || 0);
    node.style.setProperty('--wb-aos-duration', duration + 'ms');
    node.style.setProperty('--wb-aos-delay', delay + 'ms');
  });
  if (reducedMotion || !('IntersectionObserver' in window)) {
    animated.forEach(node => node.classList.add('wb-in-view'));
  } else {
    const entranceObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const node = entry.target;
        if (entry.isIntersecting) {
          node.classList.add('wb-in-view');
          if (node.getAttribute('data-aos-repeat') !== 'true') entranceObserver.unobserve(node);
        } else if (node.getAttribute('data-aos-repeat') === 'true') {
          node.classList.remove('wb-in-view');
        }
      });
    }, { threshold:.12, rootMargin:'0px 0px -6% 0px' });
    animated.forEach(node => {
      if (node.getAttribute('data-scroll-trigger') === 'false') node.classList.add('wb-in-view');
      else entranceObserver.observe(node);
    });
  }

  const animateStat = node => {
    if (node.dataset.wbAnimated === 'true') return;
    node.dataset.wbAnimated = 'true';
    const raw = node.getAttribute('data-stat-value') || node.textContent || '';
    const match = raw.match(/-?[\d,.]+/);
    if (!match) return;
    const target = Number(match[0].replace(/,/g, ''));
    if (!Number.isFinite(target)) return;
    const prefix = raw.slice(0, match.index || 0);
    const suffix = raw.slice((match.index || 0) + match[0].length);
    if (reducedMotion) { node.textContent = raw; return; }
    const start = performance.now();
    const duration = 900;
    const frame = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const statNodes = Array.from(document.querySelectorAll('[data-animate-counter="true"] [data-stat-value]'));
  if (!('IntersectionObserver' in window)) statNodes.forEach(animateStat);
  else {
    const statObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animateStat(entry.target);
      statObserver.unobserve(entry.target);
    }), { threshold:.35 });
    statNodes.forEach(node => statObserver.observe(node));
  }

  document.querySelectorAll('[data-wb-runtime="counter"]').forEach(root => {
    const valueNode = root.querySelector('[data-role="counter-value"]') || root.firstElementChild;
    if (!valueNode || valueNode.dataset.wbAnimated === 'true') return;
    valueNode.dataset.wbAnimated = 'true';
    const startValue = Number(root.getAttribute('data-counter-start')) || 0;
    const endValue = Number(root.getAttribute('data-counter-end')) || 0;
    const prefix = root.getAttribute('data-counter-prefix') || '';
    const suffix = root.getAttribute('data-counter-suffix') || '';
    const duration = Math.max(100, Number(root.getAttribute('data-counter-duration')) || 1200);
    const render = value => { valueNode.textContent = prefix + Math.round(value).toLocaleString() + suffix; };
    if (reducedMotion) { render(endValue); return; }
    const startedAt = performance.now();
    const frame = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      render(startValue + (endValue - startValue) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  document.querySelectorAll('[data-wb-runtime="progress"]').forEach(root => {
    const fill = root.firstElementChild;
    if (!fill) return;
    const update = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
      fill.style.width = value + '%';
      root.setAttribute('aria-valuenow', String(Math.round(value)));
    };
    window.addEventListener('scroll', update, { passive:true });
    update();
  });

  document.querySelectorAll('[data-wb-runtime="alert"]').forEach(root => {
    if (root.querySelector('[data-alert-dismiss]')) return;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('data-alert-dismiss', 'true');
    dismiss.setAttribute('aria-label', 'Dismiss alert');
    dismiss.textContent = 'x';
    dismiss.style.cssText = 'margin-left:auto;border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer';
    dismiss.addEventListener('click', () => root.remove());
    root.appendChild(dismiss);
  });

  document.querySelectorAll('[data-wb-runtime="tabs"]').forEach(root => {
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
    const activate = index => {
      tabs.forEach((tab, tabIndex) => {
        const active = tabIndex === index;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== index; });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(index));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activate(next);
        tabs[next].focus();
      });
    });
    activate(Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')));
  });

  document.querySelectorAll('[data-wb-runtime="accordion"]').forEach(root => {
    if (root.getAttribute('data-allow-multiple') === 'true') return;
    const items = Array.from(root.querySelectorAll('details'));
    items.forEach(item => item.addEventListener('toggle', () => {
      if (!item.open) return;
      items.forEach(candidate => { if (candidate !== item) candidate.open = false; });
    }));
  });

  document.querySelectorAll('[data-wb-runtime="gallery"] [data-lightbox-item]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      let dialog = document.querySelector('.wb-gallery-lightbox');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'wb-gallery-lightbox';
        dialog.innerHTML = '<img alt="Expanded gallery image" />';
        dialog.addEventListener('click', () => dialog.close());
        document.body.appendChild(dialog);
      }
      dialog.querySelector('img').src = link.getAttribute('href') || '';
      dialog.showModal();
    });
  });

  document.querySelectorAll('[data-wb-runtime="carousel"]').forEach(root => {
    const track = root.querySelector('[data-role="carousel-track"]');
    if (!track) return;
    const slides = Array.from(track.children);
    const status = root.querySelector('[data-carousel-status]');
    let index = 0;
    let timer = 0;
    const show = nextIndex => {
      index = (nextIndex + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + (index * 100) + '%)';
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle('is-active', slideIndex === index);
        slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true');
      });
      if (status) status.textContent = (index + 1) + ' / ' + slides.length;
    };
    const start = () => {
      window.clearInterval(timer);
      if (root.getAttribute('data-autoplay') !== 'true') return;
      const interval = Math.max(1600, Number(root.getAttribute('data-interval')) || 5000);
      timer = window.setInterval(() => show(index + 1), interval);
    };
    root.querySelector('[data-carousel-prev]')?.addEventListener('click', () => { show(index - 1); start(); });
    root.querySelector('[data-carousel-next]')?.addEventListener('click', () => { show(index + 1); start(); });
    root.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });
    root.addEventListener('mouseenter', () => window.clearInterval(timer));
    root.addEventListener('mouseleave', start);
    show(0);
    start();
  });

  document.querySelectorAll('[data-wb-runtime="modal"]').forEach(root => {
    const backdrop = root.querySelector('[data-modal-backdrop]');
    const open = root.querySelector('[data-modal-open]');
    const close = root.querySelector('[data-modal-close]');
    if (!backdrop || !open) return;
    let previousFocus = null;
    const hide = () => { backdrop.hidden = true; previousFocus?.focus?.(); };
    const show = () => { previousFocus = document.activeElement; backdrop.hidden = false; close?.focus(); };
    open.addEventListener('click', show);
    close?.addEventListener('click', hide);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) hide(); });
    backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  });

  document.querySelectorAll('[data-wb-runtime="navigation"]').forEach(root => {
    const toggle = root.querySelector('[data-nav-toggle]');
    const menu = root.querySelector('[data-role="nav-menu"]');
    toggle?.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu?.classList.toggle('is-open', open);
    });
    const update = () => root.classList.toggle('is-scrolled', window.scrollY > 60);
    window.addEventListener('scroll', update, { passive: true });
    update();
  });

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const panel = entry.target;
      const root = panel.closest('[data-wb-runtime="reveal"]');
      const index = panel.getAttribute('data-reveal-panel');
      root?.querySelectorAll('[data-reveal-panel]').forEach(item => item.classList.toggle('is-active', item === panel));
      root?.querySelectorAll('[data-reveal-index]').forEach(item => item.classList.toggle('is-active', item.getAttribute('data-reveal-index') === index));
    });
  }, { threshold: .55 }) : null;
  document.querySelectorAll('[data-wb-runtime="reveal"] [data-reveal-panel]').forEach(panel => revealObserver?.observe(panel));

  document.querySelectorAll('[data-wb-runtime="step-loader"]').forEach(root => {
    const steps = Array.from(root.querySelectorAll('li'));
    const current = root.querySelector('[data-loader-current]');
    if (!steps.length) return;
    let index = 0;
    const interval = Math.max(600, Number(root.getAttribute('data-interval')) || 1200);
    window.setInterval(() => {
      index = (index + 1) % steps.length;
      steps.forEach((step, stepIndex) => step.classList.toggle('is-active', stepIndex === index));
      if (current) current.textContent = steps[index].textContent || '';
    }, interval);
  });

  document.querySelectorAll('form[data-wb-instance-id]').forEach(form => {
    const componentType = form.getAttribute('data-gjs-type') || '';
    if (!['contact-form', 'newsletter', 'sponsor-inquiry', 'registration-interest-form'].includes(componentType)) return;
    const statusNode = form.querySelector('[data-form-status]') || document.createElement('div');
    if (!statusNode.hasAttribute('data-form-status')) {
      statusNode.setAttribute('data-form-status', '');
      statusNode.setAttribute('role', 'status');
      statusNode.setAttribute('aria-live', 'polite');
      form.appendChild(statusNode);
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const endpoint = document.body.getAttribute('data-wb-form-endpoint');
      if (!endpoint) {
        statusNode.textContent = 'Form submission is available on the published website.';
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      const payload = {};
      const consent = {};
      let honeypot = '';
      data.forEach((value, key) => {
        const field = form.elements.namedItem(key);
        if (field?.hasAttribute?.('data-honeypot') || key === 'website_url') {
          honeypot = String(value);
        } else if (field?.hasAttribute?.('data-consent') || key.toLowerCase().includes('consent')) {
          consent[key] = true;
        } else if (typeof value === 'string') {
          payload[key] = value;
        }
      });
      if (submit) submit.disabled = true;
      statusNode.textContent = 'Submitting...';
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            component_instance_id: form.getAttribute('data-wb-instance-id'),
            payload,
            consent,
            honeypot,
          }),
        });
        if (!response.ok) throw new Error('Submission failed');
        form.reset();
        statusNode.textContent = form.getAttribute('data-success-message') || 'Thank you. Your submission was received.';
      } catch {
        statusNode.textContent = form.getAttribute('data-error-message') || 'We could not submit the form. Please try again.';
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
})();
`;
