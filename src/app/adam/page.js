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
  DISTRACTOR_PROBS: { none: 0.4, notification: 0.18, pseudo: 0.18, screen: 0.09, shape: 0.15 },
  DISTRACTOR_ONSET_MS: [120, 200],
  DISTRACTOR_DUR_MS: [1800, 2400], // longer duration for more realistic distractions
  // Notification content for realistic distractions
  NOTIFICATION_CONTENT: [
    { title: "New Message", body: "Sarah: Hey, are you free to chat?" },
    { title: "Calendar", body: "Meeting 'Weekly Sync' starts in 15 minutes" },
    { title: "Updates Available", body: "System updates are ready to install" },
    { title: "Weather", body: "Light rain expected in your area" },
    { title: "Battery Low", body: "20% battery remaining" }
  ],
  // 52-card deck, pipe-separated for easy splitting elsewhere
  LETTERS: "Ace of Hearts|2 of Hearts|3 of Hearts|4 of Hearts|5 of Hearts|6 of Hearts|7 of Hearts|8 of Hearts|9 of Hearts|10 of Hearts|Jack of Hearts|Queen of Hearts|King of Hearts|Ace of Diamonds|2 of Diamonds|3 of Diamonds|4 of Diamonds|5 of Diamonds|6 of Diamonds|7 of Diamonds|8 of Diamonds|9 of Diamonds|10 of Diamonds|Jack of Diamonds|Queen of Diamonds|King of Diamonds|Ace of Clubs|2 of Clubs|3 of Clubs|4 of Clubs|5 of Clubs|6 of Clubs|7 of Clubs|8 of Clubs|9 of Clubs|10 of Clubs|Jack of Clubs|Queen of Clubs|King of Clubs|Ace of Spades|2 of Spades|3 of Spades|4 of Spades|5 of Spades|6 of Spades|7 of Spades|8 of Spades|9 of Spades|10 of Spades|Jack of Spades|Queen of Spades|King of Spades",
  TARGET: "Ace of Hearts",
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
.distractor{
  position:absolute !important;
  pointer-events:none;
  z-index:2;
  opacity:0;
  transition:opacity 0.3s ease;
}

/* Notification style distractor */
.distractor.notification {
  background:#fff;
  border-radius:8px;
  padding:12px 16px;
  box-shadow:0 4px 12px rgba(0,0,0,0.15);
  width:280px;
  color:#000;
  font-size:14px;
  line-height:1.4;
}

/* Pseudo-target style distractor */
.distractor.pseudo-target {
  font-weight:800;
  font-size:clamp(28px,5vw,48px);
  color:rgba(247,248,251,0.4);
  padding:8px 16px;
  border-radius:8px;
  background:rgba(0,0,0,0.08);
  max-width:180px;
  text-align:center;
}

/* Shape distractor style */
.distractor.shape-distractor {
  display:flex;
  align-items:center;
  justify-content:center;
  position:absolute;
  z-index:2;
  pointer-events:none;
}

/* Screen effect style distractor */
.distractor.screen-effect {
  position:fixed;
  inset:0;
  background:rgba(255,255,255,0.03);
  mix-blend-mode:difference;
  z-index:1;
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

  // 6) Weighted distractor type picker (use keys from CFG.DISTRACTOR_PROBS)
  const levels = Object.keys(CFG.DISTRACTOR_PROBS);
  const weights = levels.map(l => Number(CFG.DISTRACTOR_PROBS[l]) || 0);
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
  const LETTERS = CFG.LETTERS.split("|");
  for (let i = 0; i < n; i++) {
    const isT = seq[i] ? 1 : 0;
    let L = CFG.TARGET;
    if (!isT) {
      // pick any non-target card
      do { L = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
      while (L === CFG.TARGET);
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
  // Remove all distractors from both layers
  arenaRef.current?.querySelectorAll(".distractor").forEach(n => n.remove());
  bgRef.current?.querySelectorAll(".distractor").forEach(n => n.remove());
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
  // Randomize distractor duration between 1500ms and 3500ms
  const dur = Math.round(r(1500, 3500));
      dParams = spawnDistractor(plan.distractorLevel, onset, dur);
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

  // Realistic distractors: notification popups, pseudo targets, screen color changes
  // Distractor placement with overlap avoidance
  const spawnDistractor = (type, onsetMs, durMs) => {
    const arenaEl = arenaRef.current;
    const bgEl = bgRef.current || wrapRef.current;
    const cardEl = cardRef.current;
    if (!arenaEl || !bgEl || !cardEl) return null;

    const wrapRect = bgEl.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const W = wrapRect.width;
    const H = wrapRect.height;

    // HUD area (top of card)
    // Find .hud inside .card, not bgEl
    let hudRect = {left:0,top:0,right:0,bottom:0};
    const cardHudEl = cardEl.querySelector('.hud');
    if (cardHudEl) {
      const r = cardHudEl.getBoundingClientRect();
      hudRect = {
        left: r.left - wrapRect.left,
        top: r.top - wrapRect.top,
        right: r.right - wrapRect.left,
        bottom: r.bottom - wrapRect.top
      };
    }

    // Forbidden zones: card + HUD
    const PAD = 20;
    const forbiddenRects = [
      {
        left: clamp(cardRect.left - wrapRect.left - PAD, 0, W),
        top: clamp(cardRect.top - wrapRect.top - PAD, 0, H),
        right: clamp(cardRect.right - wrapRect.left + PAD, 0, W),
        bottom: clamp(cardRect.bottom - wrapRect.top + PAD, 0, H)
      },
      hudRect
    ];

    // Track active distractors to avoid overlap
    const activeRects = Array.from(bgEl.querySelectorAll('.distractor')).map(d => {
      const r = d.getBoundingClientRect();
      return {
        left: r.left - wrapRect.left,
        top: r.top - wrapRect.top,
        right: r.right - wrapRect.left,
        bottom: r.bottom - wrapRect.top
      };
    });

    // Helper: check overlap
    function overlaps(r1, r2) {
      return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
    }

    const el = document.createElement("div");
    el.className = "distractor";

    // Configure distractor based on type
    let candidatePositions = [];
    switch(type) {
      case "notification": {
        el.className += " notification";
        const notif = pick(CFG.NOTIFICATION_CONTENT);
        el.innerHTML = `<div style='font-weight:600;margin-bottom:4px'>${notif.title}</div>${notif.body}`;
        // Notification size
        const width = 280, height = 80;
        candidatePositions = [
          {x: 20, y: 20},
          {x: W - width - 20, y: 20},
          {x: 20, y: H - height - 20},
          {x: W - width - 20, y: H - height - 20}
        ];
        break;
      }
      case "pseudo": {
        el.className += " pseudo-target";
        el.textContent = CFG.TARGET;
        // Smaller pseudo-target size
        const width = 180, height = 48;
        candidatePositions = [
          {x: W/4, y: hudRect.bottom + 12},
          {x: W*3/4 - width, y: hudRect.bottom + 12},
          {x: W/4, y: H - height - 50},
          {x: W*3/4 - width, y: H - height - 50}
        ];
        break;
      }
      case "screen": {
        el.className += " screen-effect";
        el.style.opacity = "0.15";
        candidatePositions = [{x:0,y:0}]; // Only one position, covers whole screen
        break;
      }
      case "shape": {
        el.className += " shape-distractor";
        // Random shape and color
        const shapes = ["circle", "square", "triangle"];
        const colors = ["#e57373", "#64b5f6", "#81c784", "#ffd54f", "#ba68c8", "#ff8a65"];
        const shape = pick(shapes);
        const color = pick(colors);
        const size = ri(40, 80);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.position = "absolute";
        el.style.background = "none";
        el.style.opacity = "0.85";
        el.style.pointerEvents = "none";
        // SVG for shape
        let svg = "";
        if (shape === "circle") {
          svg = `<svg width='${size}' height='${size}'><circle cx='${size/2}' cy='${size/2}' r='${size/2-4}' fill='${color}' /></svg>`;
        } else if (shape === "square") {
          svg = `<svg width='${size}' height='${size}'><rect x='4' y='4' width='${size-8}' height='${size-8}' rx='12' fill='${color}' /></svg>`;
        } else if (shape === "triangle") {
          svg = `<svg width='${size}' height='${size}'><polygon points='${size/2},6 6,${size-6} ${size-6},${size-6}' fill='${color}' /></svg>`;
        }
        el.innerHTML = svg;
        // Candidate positions: grid in safe area, avoid HUD
        candidatePositions = [];
        for (let i = 0; i < 4; i++) {
          let x = ri(20, W - size - 20);
          let y = ri(hudRect.bottom + 12, H - size - 20);
          candidatePositions.push({x, y});
        }
        break;
      }
    }

    // Try to find a non-overlapping position
    let placed = false;
    for (const pos of candidatePositions) {
      // Estimate distractor rect
      const width = el.classList.contains('notification') ? 280 : (el.classList.contains('pseudo-target') ? 180 : W);
      const height = el.classList.contains('notification') ? 80 : (el.classList.contains('pseudo-target') ? 80 : H);
      const rect = {left:pos.x,top:pos.y,right:pos.x+width,bottom:pos.y+height};
      // Check forbidden zones
      if (forbiddenRects.some(f => overlaps(rect, f))) continue;
      // Check active distractors
      if (activeRects.some(a => overlaps(rect, a))) continue;
      // Place here
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      placed = true;
      break;
    }
    if (!placed) return null;

    bgEl.appendChild(el);

    // Animate in/out with proper timing
    const startTimer = window.setTimeout(() => {
      el.style.opacity = type === "screen" ? "0.15" : "1";
      const endTimer = window.setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, durMs);
      timers.current.push(endTimer);
    }, onsetMs);
    timers.current.push(startTimer);
    return { type: type };
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
          <p>Press <b>SPACE</b> when you see the card <b>{CFG.TARGET}</b>. Don’t press for any other card.</p>
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
