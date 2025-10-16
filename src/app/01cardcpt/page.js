"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/** Card CPT (game-only) with distractors outside the letter zone */
const CFG = {
  BLOCKS: 2,
  TRIALS_PER_BLOCK: 10,      // shorter while iterating
  TARGET_RATE: 0.15,
  ISI_MS: 300,
  STIM_MS_START: 1000,
  STIM_MS_MIN: 600,
  STIM_MS_MAX: 2000,
  ADAPT_UP_MISS: 100,
  ADAPT_DOWN_AFTER_HITS: 3,
  ADAPT_DOWN_STEP: 50,
  DISTRACTOR_PROBS: { none: 0.5, low: 0.25, high: 0.25 },
  DISTRACTOR_ONSET_MS: [120, 200],
  DISTRACTOR_DUR_MS: [180, 300],
  LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  RESPONSE_KEYS: ["Space", "Spacebar", " "],
};

const css = `
:root { --bg:#0e0e10; --fg:#f7f8fb; --muted:#9aa0a6; }

html,body {
  margin:0; height:100%;
  background:var(--bg); color:var(--fg);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
}

.wrap {
  min-height:100vh;
  display:flex; align-items:center; justify-content:center;
  padding:24px;
}

.card {
  width:min(840px,92vw);
  padding:12px 14px;
  border-radius:16px;
  background:#16171a;
  box-shadow:0 10px 30px rgba(0,0,0,.35);
  box-sizing:border-box;
  display:flex; flex-direction:column; align-items:stretch;
}

h1,h2 { margin:0 0 12px; }
p { margin:0 0 10px; color:var(--muted); }

button {
  background:#22252b; color:#fff;
  border:1px solid #2f333a; border-radius:10px;
  padding:10px 16px; cursor:pointer;
}
button:hover{ background:#2a2e35; }

.row{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }

.hud{
  display:flex; justify-content:space-between; gap:6px;
  margin-bottom:4px; color:#cfd2d6; font-size:11px; flex-wrap:wrap;
}

.progress{ height:6px; background:#24262b; border-radius:999px; overflow:hidden; }
.bar{ height:100%; width:0%; background:#4b8cf5; transition:width .2s ease; }

.stage{ display:none; }
.stage.active{ display:block; }

/* ===== Centered Letter Box (Arena) ===== */
.arena{
  position:relative !important; z-index:2;   /* positioning context for edges */
  width:100%;
  aspect-ratio:16 / 10;
  margin:12px 0;
  background:#0b0c0f;
  border:1px solid #1e2126;
  border-radius:14px;
  display:flex; align-items:center; justify-content:center;
  overflow:hidden;
}
.arena:focus,
.arena:focus-visible { outline: none !important; }

/* Border flash animation (non-sticky) */
@keyframes borderFlash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
.arena.flash::after{
  content:"";
  position:absolute;
  inset:0;
  border:3px solid #fff;
  border-radius:14px;
  pointer-events:none;
  opacity:0;
  animation:borderFlash 160ms ease-out forwards;
}

.letter{
  position:relative; z-index:6; /* above mask & edges */
  font-weight:800;
  font-size:clamp(56px,12.5vw,120px);
  letter-spacing:2px;
  user-select:none;
}

.outer,.inner{
  position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%);
}
.outer{ z-index:1; width:70%; height:70%; }

/* Structural inner box (32% x 32%) + visual mask to hide any stray edge */
.inner{
  z-index:5;               /* above .edge (2), below .letter (6) */
  width:32%; height:32%;
  pointer-events:none;
}
.inner::after {
  content:"";
  position:absolute;
  left:-16px; top:-16px; right:-16px; bottom:-16px;  /* moat */
  background:#0b0c0f;           /* same as .arena background */
  border-radius:8px;
  pointer-events:none;
  z-index:1; /* within .inner stacking context, still above .edge overall */
}

/* Flashes live *inside* the arena only */
.edge{
  position:absolute !important;
  background:#c7d2fe;
  opacity:.55;
  border-radius:6px;
  will-change:opacity,transform;
  pointer-events:none;
  z-index:2; /* sits below the card so flashes are visible outside the arena */
}

.distractor-layer{
  position:absolute; inset:0; pointer-events:none;
  z-index:1; /* fills the wrap behind the card so distractors appear in empty space */
}

.summary{
  display:grid; grid-template-columns:1fr 1fr;
  gap:12px; margin-top:12px;
  font-family:ui-monospace,Menlo,Consolas,monospace;
  color:#e8eaed;
}

.keylamp{
  display:inline-block; width:12px; height:12px; border-radius:50%;
  background:#3a3f45; box-shadow:0 0 0 1px #2f333a inset; vertical-align:middle;
}
.keylamp.on{ background:#4b8cf5; box-shadow:0 0 8px rgba(75,140,245,.9); }
`;

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function r(min, max){ return Math.random() * (max - min) + min; }
function ri(min, max){ return Math.floor(r(min, max + 1)); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

export default function Page(){
  const [stage, setStage] = useState("intro"); // intro | game | break | done
  const [block, setBlock] = useState(1);
  const [trialInBlock, setTrialInBlock] = useState(0);
  const [globalTrial, setGlobalTrial] = useState(0);
  const [letter, setLetter] = useState("");
  const [targetsLeft, setTargetsLeft] = useState("—");
  const [stimMs, setStimMs] = useState(CFG.STIM_MS_START);
  const [spaceFlash, setSpaceFlash] = useState(false);

  const consecHitsRef = useRef(0);
  const planRef = useRef([]);          // current block plan (immutable array)
  const idxRef = useRef(0);            // authoritative trial index
  const allowRespRef = useRef(false);
  const pressTsRef = useRef(null);
  const stimStartRef = useRef(0);
  const timers = useRef([]);
  const rafRef = useRef(null);

  const arenaRef = useRef(null);
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const letterRef = useRef(null);
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const cardRef = useRef(null);

  const dataRef = useRef([]);

  const LETTERS = useMemo(()=>CFG.LETTERS.split(""),[]);
const makePlan = useCallback(() => {
  // 1) Safe, integer N
  const n = Math.max(1, Number(CFG.TRIALS_PER_BLOCK) | 0);

  // 2) Safe target count
  const tCount = Math.min(n, Math.max(0, Math.round(n * Number(CFG.TARGET_RATE))));

  // 3) Build [1,1,...,0,0,...] then shuffle
  const arr = new Array(n).fill(0);
  for (let i = 0; i < tCount; i++) arr[i] = 1;

  // Fisher–Yates with classic swap (no destructuring)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  // 4) No 3-in-a-row constraint
  function ok(seq) {
    let run = 0;
    for (let k = 0; k < seq.length; k++) {
      run = seq[k] ? run + 1 : 0;
      if (run > 2) return false;
    }
    return true;
  }

  // 5) Regenerate if needed (bounded)
  let seq = arr.slice();
  let tries = 0;
  while (!ok(seq) && tries++ < 500) {
    // reshuffle seq in place
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = seq[i];
      seq[i] = seq[j];
      seq[j] = tmp;
    }
  }

  // 6) Weighted distractor level picker
  const levels = ["none", "low", "high"];
  const weights = [
    Number(CFG.DISTRACTOR_PROBS.none) || 0,
    Number(CFG.DISTRACTOR_PROBS.low) || 0,
    Number(CFG.DISTRACTOR_PROBS.high) || 0,
  ];
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const weighted = () => {
    let p = Math.random() * totalW, acc = 0;
    for (let i = 0; i < levels.length; i++) {
      acc += weights[i];
      if (p <= acc) return levels[i];
    }
    return "none";
  };

  // 7) Build the block plan
  const plan = [];
  const LETTERS = CFG.LETTERS.split("");
  for (let i = 0; i < n; i++) {
    const isT = seq[i] ? 1 : 0;
    let L = "X";
    if (!isT) {
      // pick any non-X letter
      do { L = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
      while (L === "X");
    }
    plan.push({ letter: L, isTarget: isT, distractorLevel: weighted() });
  }
  return plan;
}, []);


  // GLOBAL KEY HANDLER (Space + border flash)
  useEffect(() => {
    const onKeyDown = (e) => {
      const isSpace =
        e.code === "Space" ||
        e.key === " " ||
        e.key === "Spacebar" ||
        e.keyCode === 32 ||
        e.which === 32;

      if (!isSpace) return;

      e.preventDefault();
      e.stopPropagation();

      if (!allowRespRef.current) return;

      if (pressTsRef.current == null) {
        pressTsRef.current = performance.now();
        setSpaceFlash(true);
        setTimeout(() => setSpaceFlash(false), 120);
      }

      const a = arenaRef.current;
      if (a) {
        a.classList.remove("flash");
        void a.offsetWidth;          // reflow to restart CSS animation
        a.classList.add("flash");
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  // remove .flash after animation
  useEffect(() => {
    const a = arenaRef.current;
    if (!a) return;
    const onEnd = (ev) => { if (ev.animationName === "borderFlash") a.classList.remove("flash"); };
    a.addEventListener("animationend", onEnd);
    return () => a.removeEventListener("animationend", onEnd);
  }, []);

  // focus arena so keyboard works even after clicks
  useEffect(()=>{
    if(stage==="game") { setTimeout(()=> arenaRef.current?.focus?.(), 0); }
  },[stage, trialInBlock]);

  // cleanup timers
  useEffect(()=>()=>{ timers.current.forEach(clearTimeout); if(rafRef.current) cancelAnimationFrame(rafRef.current); },[]);

  const clearTimers = useCallback(()=>{
    timers.current.forEach(clearTimeout); timers.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
    // scoped cleanup of distractors in either layer
    arenaRef.current?.querySelectorAll(".edge").forEach(n => n.remove());
    bgRef.current?.querySelectorAll(".edge").forEach(n => n.remove());
  },[]);

  const startTask = ()=>{
    dataRef.current = [];
    setStage("game");
    setBlock(1);
    setTrialInBlock(0);
    setGlobalTrial(0);
    setStimMs(CFG.STIM_MS_START);
    consecHitsRef.current = 0;
    planRef.current = makePlan();
    idxRef.current = 0;
    setTargetsLeft(Math.round(CFG.TRIALS_PER_BLOCK * CFG.TARGET_RATE));
    timers.current.push(window.setTimeout(nextTrial, 400));
  };

  const nextBlock = ()=>{
    clearTimers();
    planRef.current = makePlan();
    idxRef.current = 0;
    setTrialInBlock(0);
    setTargetsLeft(Math.round(CFG.TRIALS_PER_BLOCK * CFG.TARGET_RATE));
    setStage("game");
    timers.current.push(window.setTimeout(nextTrial, 400));
  };

  const endBlock = ()=>{
    const nb = block + 1;
    if (nb > CFG.BLOCKS) { setStage("done"); return; }
    setBlock(nb);
    setStage("break");
  };

  const nextTrial = ()=>{
    clearTimers();
    setLetter("");
    allowRespRef.current = false;
    pressTsRef.current = null;
    timers.current.push(window.setTimeout(runStimulus, CFG.ISI_MS));
  };

  const runStimulus = ()=>{
    const i = idxRef.current;
    const plan = planRef.current[i];
    if (!plan) { endBlock(); return; }

    setLetter(plan.letter);
    setTrialInBlock(i+1);
    setGlobalTrial(g=>g+1);
    if (plan.isTarget) setTargetsLeft(v => (typeof v==="number" ? Math.max(v-1,0) : v));

    allowRespRef.current = true;
    pressTsRef.current = null;
    stimStartRef.current = performance.now();

    let dParams = null;
    if (plan.distractorLevel !== "none") {
      const onset = Math.round(r(...CFG.DISTRACTOR_ONSET_MS));
      const dur   = Math.round(r(...CFG.DISTRACTOR_DUR_MS));
      dParams = spawnEdgeFlash(plan.distractorLevel, onset, dur);
    }

    const endT = window.setTimeout(()=> finishTrial(plan, dParams), stimMs);
    timers.current.push(endT);
  };

  const finishTrial = (plan, dParams)=>{
    allowRespRef.current = false;

    const pressed = pressTsRef.current !== null;
    const rt = pressed ? Math.round(pressTsRef.current - stimStartRef.current) : null;

    let isHit=0,isOmit=0,isCom=0;
    if (plan.isTarget) {
      if (pressed) { isHit=1; consecHitsRef.current++; }
      else { isOmit=1; consecHitsRef.current=0; }
    } else {
      if (pressed) isCom=1;
    }

    setStimMs(cur=>{
      if (isOmit) return clamp(cur + CFG.ADAPT_UP_MISS, CFG.STIM_MS_MIN, CFG.STIM_MS_MAX);
      if (plan.isTarget && isHit && consecHitsRef.current >= CFG.ADAPT_DOWN_AFTER_HITS) {
        consecHitsRef.current = 0;
        return clamp(cur - CFG.ADAPT_DOWN_STEP, CFG.STIM_MS_MIN, CFG.STIM_MS_MAX);
      }
      return cur;
    });

    dataRef.current.push({
      participant_id: "anon",
      block_index: block,
      trial_index_global: globalTrial + 1,
      trial_index_block: idxRef.current + 1,
      letter: plan.letter,
      is_target: plan.isTarget,
      has_distractor: plan.distractorLevel !== "none" ? 1 : 0,
      distractor_level: plan.distractorLevel,
      distractor_type: dParams ? dParams.type : "none",
      distractor_onset_ms: dParams ? dParams.onset : null,
      distractor_duration_ms: dParams ? dParams.duration : null,
      distractor_pos_px_x: dParams ? Math.round(dParams.x) : null,
      distractor_pos_px_y: dParams ? Math.round(dParams.y) : null,
      distractor_quadrant: dParams ? dParams.quadrant : null,
      stim_duration_ms: stimMs,
      isi_ms: CFG.ISI_MS,
      response_key: pressed ? "space" : "none",
      response_time_ms: rt,
      is_hit: isHit,
      is_omission: isOmit,
      is_commission: isCom,
      timestamp_ms: Date.now(),
    });

    idxRef.current += 1;

    if (idxRef.current >= CFG.TRIALS_PER_BLOCK) endBlock();
    else nextTrial();
  };

  // Distractor: inside .arena ONLY, NEVER overlapping the *actual* letter glyph (+ moat)
  const spawnEdgeFlash = (level, onsetMs, durMs) => {
    const arenaEl  = arenaRef.current;
    const letterEl = letterRef.current;
    const bgEl = bgRef.current || wrapRef.current;
    if (!arenaEl || !bgEl) return null;

    const aRect = arenaEl.getBoundingClientRect();
    const wrapRect = bgEl.getBoundingClientRect();
    const W = wrapRect.width;
    const H = wrapRect.height;

    // Forbidden: prefer the whole card rect (includes HUD). fallback to arena/letter if card not ready.
    const PAD = 18;
    let forbid = null;
    const cardEl = cardRef.current;
    if (cardEl) {
      const cRect = cardEl.getBoundingClientRect();
      forbid = {
        left:   clamp(cRect.left - wrapRect.left - PAD, 0, W),
        top:    clamp(cRect.top  - wrapRect.top  - PAD, 0, H),
        right:  clamp(cRect.right - wrapRect.left + PAD, 0, W),
        bottom: clamp(cRect.bottom - wrapRect.top + PAD, 0, H),
      };
    } else {
      // fallback to arena/letter based forbid area
      forbid = {
        left: aRect.left + aRect.width * 0.34 - wrapRect.left,
        top:  aRect.top  + aRect.height * 0.34 - wrapRect.top,
        right: aRect.left + aRect.width * 0.66 - wrapRect.left,
        bottom: aRect.top + aRect.height * 0.66 - wrapRect.top,
      };
      if (letterEl) {
        const lRect = letterEl.getBoundingClientRect();
        const lLeft   = lRect.left   - wrapRect.left;
        const lTop    = lRect.top    - wrapRect.top;
        const lRight  = lRect.right  - wrapRect.left;
        const lBottom = lRect.bottom - wrapRect.top;
        forbid = {
          left:   clamp(lLeft   - PAD, 0, W),
          top:    clamp(lTop    - PAD, 0, H),
          right:  clamp(lRight  + PAD, 0, W),
          bottom: clamp(lBottom + PAD, 0, H),
        };
      }
    }

    // Element size/orientation (use arena dimensions for length scaling)
    const isH = Math.random() < 0.5;
    const aW = arenaEl.clientWidth;
    const aH = arenaEl.clientHeight;
    const thickness = level === "low" ? 8 : 16;
    const lenFrac   = level === "low" ? (0.20 + Math.random()*0.20) : (0.32 + Math.random()*0.26);
    const length    = Math.round((isH ? aW : aH) * lenFrac);

    const el = document.createElement("div");
    el.className = "edge";
    el.style.position = "absolute";
    el.style.opacity  = String(level === "low" ? 0.45 : 0.75);
    if (isH) { el.style.width = `${length}px`; el.style.height = `${thickness}px`; }
    else     { el.style.width = `${thickness}px`; el.style.height = `${length}px`; }
    const elW = parseFloat(el.style.width);
    const elH = parseFloat(el.style.height);

    // Overlap test (touching counts as overlap)
    const overlaps = (x0, y0) => {
      const rL = x0, rR = x0 + elW, rT = y0, rB = y0 + elH;
      return !(rR < forbid.left || rL > forbid.right || rB < forbid.top || rT > forbid.bottom);
    };

    // Four “lobe” regions outside the forbidden rect (in wrap/bg coords)
    const regions = [];
    if (forbid.top - elH > 0)                                             regions.push({ xMin: 0, xMax: W - elW, yMin: 0, yMax: forbid.top - elH });
    if (H - forbid.bottom - elH > 0)                                      regions.push({ xMin: 0, xMax: W - elW, yMin: forbid.bottom, yMax: H - elH });
    if (forbid.left - elW > 0 && (forbid.bottom - forbid.top - elH) > 0)  regions.push({ xMin: 0, xMax: forbid.left - elW, yMin: forbid.top, yMax: forbid.bottom - elH });
    if (W - forbid.right - elW > 0 && (forbid.bottom - forbid.top - elH) > 0) regions.push({ xMin: forbid.right, xMax: W - elW, yMin: forbid.top, yMax: forbid.bottom - elH });

    if (!regions.length) return null;

    // Sample a point inside a random lobe
    const R = regions[Math.floor(Math.random()*regions.length)];
    let x = Math.round(R.xMin + Math.random() * Math.max(0, R.xMax - R.xMin));
    let y = Math.round(R.yMin + Math.random() * Math.max(0, R.yMax - R.yMin));
    let tries = 0;
    while (overlaps(x, y) && tries++ < 50) {
      x = Math.round(R.xMin + Math.random() * Math.max(0, R.xMax - R.xMin));
      y = Math.round(R.yMin + Math.random() * Math.max(0, R.yMax - R.yMin));
    }
    if (overlaps(x, y)) return null;

    // Place inside bg layer (wrap coords)
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    bgEl.appendChild(el);

    // Animate & cleanup
    const startTimer = window.setTimeout(() => {
      const t0 = performance.now();
      const D = Math.round(durMs);
      const startA = parseFloat(el.style.opacity);
      const step = (now) => {
        const p = Math.min((now - t0) / D, 1);
        const op = 0.1 + (1 - Math.abs(0.5 - p) * 2) * (startA - 0.1);
        el.style.opacity = String(op);
        if (p < 1) requestAnimationFrame(step);
        else el.remove();
      };
      requestAnimationFrame(step);
    }, Math.round(onsetMs));
    timers.current.push(startTimer);

    return { type:"bg-flash", x, y };
  };

  const downloadCSV = ()=>{
    const rows = dataRef.current; if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const out = [cols.join(",")];
    rows.forEach((r)=>{
      out.push(cols.map(k=> (r[k]===null||r[k]===undefined)?"":String(r[k]).replace(/,/g,";")).join(","));
    });
    const blob = new Blob([out.join("\n")], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "cpt_trials.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const pct = (trialInBlock / CFG.TRIALS_PER_BLOCK) * 100;

  return (
    <div className="wrap" ref={wrapRef}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
  <div className="card" ref={cardRef}>

        {/* INTRO */}
        <div className={`stage ${stage==="intro"?"active":""}`}>
          <h1>Card CPT (Game)</h1>
          <p>Press <b>SPACE</b> when you see the letter <b>X</b>. Don’t press for any other letter.</p>
          <div className="row">
            <button onClick={startTask}>Start</button>
            <button onClick={()=>document.documentElement.requestFullscreen?.()}>Fullscreen</button>
          </div>
        </div>

        {/* GAME */}
        <div className={`stage ${stage==="game"?"active":""}`}>
          <div className="hud">
            <div>Block <b>{block}</b> / {CFG.BLOCKS}</div>
            <div>Trial <b>{trialInBlock}</b> / {CFG.TRIALS_PER_BLOCK}</div>
            <div className="row" style={{ gap: 8 }}>
              <span>Space:</span>
              <span className={`keylamp ${spaceFlash ? "on" : ""}`} />
            </div>
          </div>

          <div className="progress"><div className="bar" style={{ width: `${pct}%` }} /></div>

          <div
            className="arena"
            ref={arenaRef}
            tabIndex={0}
            onMouseDown={(e) => { e.currentTarget.focus(); }}
          >
            <div className="outer" ref={outerRef} />
            <div className="inner" ref={innerRef} />
            <div className="letter" ref={letterRef}>{letter}</div>
          </div>
        </div>

        {/* BREAK */}
        <div className={`stage ${stage==="break"?"active":""}`}>
          <h2>Break</h2>
          <p>Click resume when you’re ready.</p>
          <div className="row">
            <button onClick={nextBlock}>Resume</button>
          </div>
        </div>

        {/* DONE */}
        <div className={`stage ${stage==="done"?"active":""}`}>
          <h2>All Done 🎉</h2>
          <Summary data={dataRef.current} />
          <div className="row" style={{marginTop:8}}>
            <button onClick={downloadCSV}>Download CSV</button>
            <button onClick={()=>location.reload()}>Restart</button>
          </div>
        </div>

      </div>
      {/*here*/}
      <div className="distractor-layer" ref={bgRef} />
    </div>
  );
}

function Summary({ data }){
  const total = data.length;
  const hits = data.filter(d=>d.is_hit).length;
  const om   = data.filter(d=>d.is_omission).length;
  const fa   = data.filter(d=>d.is_commission).length;
  const rtHits = data.filter(d=>d.is_hit && Number.isFinite(d.response_time_ms)).map(d=>d.response_time_ms);
  const mean = rtHits.length ? Math.round(rtHits.reduce((a,b)=>a+b,0)/rtHits.length) : "—";
  const sd   = rtHits.length ? Math.round(Math.sqrt(rtHits.map(x => (x-mean)**2).reduce((a,b)=>a+b,0)/rtHits.length)) : "—";
  return (
    <div className="summary">
      <div>Total trials: <b>{total}</b></div>
      <div>Hits: <b>{hits}</b></div>
      <div>Omissions: <b>{om}</b></div>
      <div>Commissions: <b>{fa}</b></div>
      <div>Hit RT (ms): <b>{mean}</b></div>
      <div>RT SD (ms): <b>{sd}</b></div>
    </div>
  );
}
