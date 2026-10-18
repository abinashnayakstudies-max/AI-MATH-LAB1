import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, CircleHelp, Crosshair, FlaskConical, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";

const API = "https://ai-math-lab1.onrender.com";

function MVTScene({ result, inspectX, inspectValue, onInspectPoint }) {
  const mountRef = useRef(null);
  const onInspectPointRef = useRef(onInspectPoint);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  useEffect(() => { onInspectPointRef.current = onInspectPoint; }, [onInspectPoint]);
  const plot = useMemo(() => {
    if (!result?.plot_points?.length) return null;
    const pts = result.plot_points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return null;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const rawMinX = Math.min(...xs), rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys), rawMaxY = Math.max(...ys);
    const xSpan = Math.max(rawMaxX - rawMinX, 1e-9);
    const ySpan = Math.max(rawMaxY - rawMinY, Math.abs(rawMaxY) * 1e-9, 1e-9);
    // Include zero so the origin and coordinate axes are always represented.
    const minX = Math.min(rawMinX, 0) - xSpan * 0.06;
    const maxX = Math.max(rawMaxX, 0) + xSpan * 0.06;
    const minY = Math.min(rawMinY, 0) - ySpan * 0.08;
    const maxY = Math.max(rawMaxY, 0) + ySpan * 0.08;
    return { pts, minX, maxX, minY, maxY };
  }, [result]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#08111b');
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 2000);
    camera.position.set(0.7, 3.6, 10.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 4.5;
    controls.maxDistance = 22;

    const group = new THREE.Group();
    scene.add(group);
    let curveLine = null;
    const addLine = (points, color, opacity = 1) => {
      if (points.length < 2) return null;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      const line = new THREE.Line(geometry, material);
      group.add(line);
      return line;
    };
    const addText = (text, position, color = '#c6d5e4', size = 0.34) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 44px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(5,12,20,.92)'; ctx.lineWidth = 8;
      ctx.strokeText(String(text), 256, 64);
      ctx.fillStyle = color; ctx.fillText(String(text), 256, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position); sprite.scale.set(size * 3.4, size * 0.85, 1);
      group.add(sprite); return sprite;
    };
    const fmt = value => {
      if (!Number.isFinite(value)) return '—';
      const abs = Math.abs(value);
      if ((abs !== 0 && abs >= 1e4) || (abs > 0 && abs < 1e-3)) return value.toExponential(1);
      return Number(value.toPrecision(3)).toString();
    };

    // Fixed visual ranges preserve the true relative shape while keeping labels in data units.
    const worldW = 8.2, worldH = 5.0;
    const xRange = plot ? plot.maxX - plot.minX : 6;
    const yRange = plot ? plot.maxY - plot.minY : 4;
    const xMin = plot?.minX ?? -3, xMax = plot?.maxX ?? 3;
    const yMin = plot?.minY ?? -2, yMax = plot?.maxY ?? 2;
    const mapX = value => ((value - xMin) / Math.max(xRange, 1e-12) - 0.5) * worldW;
    const mapY = value => ((value - yMin) / Math.max(yRange, 1e-12) - 0.5) * worldH;
    const x0 = mapX(0), y0 = mapY(0);

    // XY grid: unlike GridHelper, this is the same plane as y=f(x).
    const gridColor = 0x1a2c3d;
    for (let i = 0; i <= 8; i++) {
      const gx = -worldW / 2 + worldW * i / 8;
      addLine([new THREE.Vector3(gx, -worldH / 2, -0.08), new THREE.Vector3(gx, worldH / 2, -0.08)], gridColor, 0.72);
    }
    for (let i = 0; i <= 6; i++) {
      const gy = -worldH / 2 + worldH * i / 6;
      addLine([new THREE.Vector3(-worldW / 2, gy, -0.08), new THREE.Vector3(worldW / 2, gy, -0.08)], gridColor, 0.72);
    }

    // Clearly labelled data axes. X = input, Y = f(x), Z = scene depth.
    const xAxisColor = 0x73b9ef, yAxisColor = 0x82d0a8, zAxisColor = 0xd5b46c;
    addLine([new THREE.Vector3(-worldW/2, y0, 0), new THREE.Vector3(worldW/2, y0, 0)], xAxisColor, 1);
    addLine([new THREE.Vector3(x0, -worldH/2, 0), new THREE.Vector3(x0, worldH/2, 0)], yAxisColor, 1);
    addLine([new THREE.Vector3(x0, y0, -2.4), new THREE.Vector3(x0, y0, 2.4)], zAxisColor, 0.85);
    // Positive direction arrows.
    const arrow = (origin, direction, length, color) => {
      const a = new THREE.ArrowHelper(direction, origin, length, color, 0.22, 0.12);
      group.add(a);
    };
    arrow(new THREE.Vector3(worldW/2 - 0.4, y0, 0), new THREE.Vector3(1,0,0), 0.42, xAxisColor);
    arrow(new THREE.Vector3(x0, worldH/2 - 0.4, 0), new THREE.Vector3(0,1,0), 0.42, yAxisColor);
    arrow(new THREE.Vector3(x0, y0, 2.0), new THREE.Vector3(0,0,1), 0.38, zAxisColor);
    addText('X · input x', new THREE.Vector3(worldW/2 - 0.35, y0 - 0.40, 0.08), '#8cc9f4', 0.34);
    addText('Y · f(x)', new THREE.Vector3(x0 + 0.70, worldH/2 - 0.12, 0.08), '#9ce0bb', 0.34);
    addText('Z · depth only', new THREE.Vector3(x0 + 0.85, y0 + 0.38, 2.2), '#e6c981', 0.30);

    // Tick labels use real input/function values, not arbitrary scene coordinates.
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const t = i / tickCount;
      const xv = xMin + t * xRange, xp = mapX(xv);
      addLine([new THREE.Vector3(xp, y0 - 0.07, 0.02), new THREE.Vector3(xp, y0 + 0.07, 0.02)], xAxisColor, 0.9);
      addText(fmt(xv), new THREE.Vector3(xp, y0 - 0.28, 0.04), '#c0d0df', 0.29);
      const yv = yMin + t * yRange, yp = mapY(yv);
      addLine([new THREE.Vector3(x0 - 0.07, yp, 0.02), new THREE.Vector3(x0 + 0.07, yp, 0.02)], yAxisColor, 0.9);
      if (i !== Math.round(tickCount / 2)) addText(fmt(yv), new THREE.Vector3(x0 - 0.58, yp, 0.04), '#c0d0df', 0.29);
    }

    // Mark the true origin when it falls within the displayed coordinate range.
    const origin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf2f6fa }));
    origin.position.set(x0, y0, 0.08); group.add(origin);
    addText('O (0, 0, 0)', new THREE.Vector3(x0 + 0.55, y0 - 0.48, 0.1), '#f2f6fa', 0.24);

    if (plot) {
      const valid = plot.pts.filter(p => Number.isFinite(p.y));
      curveLine = addLine(valid.map(p => new THREE.Vector3(mapX(p.x), mapY(p.y), 0.12)), 0x73b8e6, 1);
      const nearest = target => plot.pts.reduce((best, p) => Math.abs(p.x - target) < Math.abs(best.x - target) ? p : best, plot.pts[0]);
      const pa = nearest(result.a), pb = nearest(result.b);
      addLine([new THREE.Vector3(mapX(result.a), mapY(pa.y), 0.16), new THREE.Vector3(mapX(result.b), mapY(pb.y), 0.16)], 0xd7a85e, 1);

      const c = result.hybrid_c ?? result.canonical_c;
      const pc = nearest(c);
      // Tangent line uses the derivative at c if available; secant slope is the MVT-equivalent slope.
      const tangentSpan = Math.min((plot.maxX - plot.minX) * 0.14, (result.b - result.a) * 0.18);
      const t1 = Math.max(plot.minX, c - tangentSpan), t2 = Math.min(plot.maxX, c + tangentSpan);
      addLine([new THREE.Vector3(mapX(t1), mapY(pc.y + result.secant_slope * (t1-c)), 0.2), new THREE.Vector3(mapX(t2), mapY(pc.y + result.secant_slope * (t2-c)), 0.2)], 0xb88ad7, 1);

      const point = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 24), new THREE.MeshStandardMaterial({ color: 0x9ed2ff, emissive: 0x245e83, emissiveIntensity: 1.1 }));
      point.position.set(mapX(c), mapY(pc.y), 0.24); group.add(point);
      addLine([new THREE.Vector3(mapX(c), y0, 0.18), new THREE.Vector3(mapX(c), mapY(pc.y), 0.18)], 0x9ed2ff, 0.65);
      addText(`Verified c=${fmt(c)}`, new THREE.Vector3(mapX(c), mapY(pc.y) + 0.32, 0.28), '#b9e2ff', 0.27);
      addText(`f(c)≈${fmt(pc.y)}`, new THREE.Vector3(mapX(c), mapY(pc.y) + 0.04, 0.28), '#b9e2ff', 0.23);

      // Mark every detected numerical MVT solution. The verified point above stays prominent.
      (result.mvt_points || []).forEach(root => {
        if (Math.abs(root - c) < 1e-5) return;
        const rp = nearest(root);
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), new THREE.MeshBasicMaterial({ color: 0xa6d8f5 }));
        marker.position.set(mapX(root), mapY(rp.y), 0.23);
        group.add(marker);
      });

      // AI output is shown separately from the verified solution.
      if (Number.isFinite(result.ml_c)) {
        const mp = nearest(result.ml_c);
        const aiMarker = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), new THREE.MeshBasicMaterial({ color: 0xf0c56e }));
        aiMarker.position.set(mapX(result.ml_c), mapY(mp.y), 0.27);
        group.add(aiMarker);
        addText(`AI c=${fmt(result.ml_c)}`, new THREE.Vector3(mapX(result.ml_c), mapY(mp.y) + 0.32, 0.3), '#f0d28a', 0.24);
      }

      if (inspectX != null && inspectValue != null && Number.isFinite(inspectX) && Number.isFinite(inspectValue)) {
        const ip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), new THREE.MeshStandardMaterial({ color: 0xe0c77c, emissive: 0x806b26, emissiveIntensity: 0.7 }));
        ip.position.set(mapX(inspectX), mapY(inspectValue), 0.3); group.add(ip);
        addLine([new THREE.Vector3(mapX(inspectX), y0, 0.2), new THREE.Vector3(mapX(inspectX), mapY(inspectValue), 0.2)], 0xe0c77c, 0.65);
        addText(`(${fmt(inspectX)}, ${fmt(inspectValue)})`, new THREE.Vector3(mapX(inspectX), mapY(inspectValue) + 0.3, 0.34), '#f1d995', 0.24);
      }
    } else {
      const curve = [];
      for (let i = 0; i <= 100; i++) { const xx = -3 + i * 6 / 100; curve.push(new THREE.Vector3(mapX(xx), mapY(Math.sin(xx)), 0.12)); }
      addLine(curve, 0x426d96, 1);
    }

    scene.add(new THREE.AmbientLight(0xb7d7ee, 1.1));

    // Hover over the function curve to read real sampled coordinates; click to pin a point.
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.16;
    const pointer = new THREE.Vector2();
    const onPointerMove = event => {
      if (!curveLine || !plot) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(curveLine, false)[0];
      if (!hit || hit.index == null) {
        setHoveredPoint(null); renderer.domElement.style.cursor = 'grab'; return;
      }
      const pts = plot.pts.filter(p => Number.isFinite(p.y));
      const idx = Math.max(0, Math.min(pts.length - 1, hit.index));
      const sample = pts[idx];
      setHoveredPoint(sample);
      renderer.domElement.style.cursor = 'crosshair';
    };
    const onPointerLeave = () => { setHoveredPoint(null); renderer.domElement.style.cursor = 'grab'; };
    const onPointerClick = event => {
      if (!curveLine || !plot) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(curveLine, false)[0];
      if (!hit || hit.index == null) return;
      const pts = plot.pts.filter(p => Number.isFinite(p.y));
      const sample = pts[Math.max(0, Math.min(pts.length - 1, hit.index))];
      if (sample) onInspectPointRef.current?.(sample.x, sample.y);
    };
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onPointerClick);
    const resize = () => {
      const w = mount.clientWidth, h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener('resize', resize);
    let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener('resize', resize); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerleave', onPointerLeave); renderer.domElement.removeEventListener('click', onPointerClick); controls.dispose(); renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [plot, result, inspectX, inspectValue]);

  return <div className="scene-wrap">
    <div ref={mountRef} className="three-canvas" />
    <div className="axis-key" aria-label="Coordinate axis legend">
      <span><i className="axis-x"/>X = input x</span><span><i className="axis-y"/>Y = f(x)</span><span><i className="axis-z"/>Z = depth only</span>
    </div>
    <div className="scene-labels">
      <span><i className="line-key curve-key" />f(x)</span><span><i className="line-key secant-key" />secant</span><span><i className="line-key tangent-key" />tangent</span><span><i className="point-key" />verified MVT</span><span><i className="ai-key" />AI estimate</span>
      {inspectX != null && <span><i className="inspect-key" />pinned point</span>}
    </div>
    {hoveredPoint && <div className="coordinate-readout"><span>CURVE COORDINATE · HOVER / CLICK</span><strong>({Number(hoveredPoint.x).toFixed(5)}, {Number(hoveredPoint.y).toFixed(5)})</strong><small>Click the curve to pin this point below.</small></div>}
    {!result && <div className="scene-empty"><Crosshair size={18}/><span>Run an MVT calculation to populate the plot.</span></div>}
  </div>;
}

function App() {
  const [expression, setExpression] = useState("x^2");
  const [a, setA] = useState("-2");
  const [b, setB] = useState("3");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [valueX, setValueX] = useState("1");
  const [valueResult, setValueResult] = useState(null);
  const [valueLoading, setValueLoading] = useState(false);

  async function calculate() {
    setLoading(true); setResult(null); setValueResult(null);
    try {
      const r = await fetch(`${API}/mvt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expression, a: Number(a), b: Number(b) }) });
      setResult(await r.json());
    } catch { setResult({ error: "Could not connect to the AI Math Lab backend." }); }
    finally { setLoading(false); }
  }

  async function findValue() {
    setValueLoading(true); setValueResult(null);
    try {
      const r = await fetch(`${API}/function-value`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expression, x: Number(valueX) }) });
      const data = await r.json();
      if (data.error) setValueResult(data); else setValueResult(data);
    } catch { setValueResult({ error: "Function Value Finder is not available on the current backend yet." }); }
    finally { setValueLoading(false); }
  }

  const numerical = result?.canonical_c;
  const ml = result?.ml_c;
  const hybrid = result?.hybrid_c;
  const predictionError = numerical != null && ml != null ? Math.abs(ml - numerical) : null;

  const pinPoint = (x, value) => { setValueX(String(x)); setValueResult({ x, value }); };

  const reset = () => { setExpression("x^2"); setA("-2"); setB("3"); setResult(null); setValueResult(null); };

  return <main className="app">
    <header className="topbar">
      <div className="brand-mark"><FlaskConical size={20}/><div><strong>AI Math Lab</strong><span>Computational Mathematics & Engineering</span></div></div>
      <nav><a className="active">MVT Explorer</a><a>Root Finding</a><a>Taylor</a><a>Signals</a></nav>
      <div className="status"><i/> API ONLINE</div>
    </header>

    <section className="title-row">
      <div><span className="section-code">LAB / CALCULUS / 01</span><h1>Generalized Mean Value Theorem</h1><p>Numerical verification, machine-learning estimation, and hybrid refinement for f(x) on [a, b].</p></div>
      <div className="formula">f′(c) = <span>(f(b) − f(a))</span> / (b − a)</div>
    </section>

    <section className="workspace">
      <aside className="controls panel">
        <div className="panel-title"><span>01</span><div><h2>Problem definition</h2><p>Set the function and interval.</p></div></div>
        <label>FUNCTION</label>
        <input className="function-input" value={expression} onChange={e => setExpression(e.target.value)} placeholder="x^2 + sin(x)" />
        <div className="bounds"><div><label>LOWER a</label><input value={a} onChange={e => setA(e.target.value)}/></div><div><label>UPPER b</label><input value={b} onChange={e => setB(e.target.value)}/></div></div>
        <button className="primary-button" onClick={calculate} disabled={loading}><Play size={15}/>{loading ? "Solving…" : "Solve MVT"}</button>
        <button className="text-button" onClick={reset}><RotateCcw size={13}/> Reset</button>
        <div className="examples"><span>QUICK CASES</span><button onClick={()=>{setExpression("x^2");setA("-2");setB("3")}}>x²</button><button onClick={()=>{setExpression("sin(x)");setA("-2");setB("2")}}>sin x</button><button onClick={()=>{setExpression("x^3 + sin(x)");setA("-2");setB("2")}}>x³ + sin x</button><button onClick={()=>{setExpression("exp(-x^2)");setA("-2");setB("2")}}>e⁻ˣ²</button></div>
        <div className="method-note"><CircleHelp size={15}/><span>AI prediction is an estimate. The hybrid result is numerically verified.</span></div>
      </aside>

      <section className="visual-panel panel">
        <div className="plot-header"><div><span>02 / VISUALIZATION</span><h2>Function, secant & MVT point</h2></div><span className="drag-note">Drag to rotate · scroll to zoom</span></div>
        <MVTScene result={result} inspectX={valueResult?.x} inspectValue={valueResult?.value} onInspectPoint={pinPoint}/>
        <div className="plot-foot"><span>z = 0 plane · interactive Three.js scene</span><span>{result ? `${result.mvt_points?.length ?? 0} numerical solution(s) detected` : "Awaiting calculation"}</span></div>
      </section>

      <aside className="results panel">
        <div className="panel-title"><span>03</span><div><h2>Results</h2><p>Estimate vs verification.</p></div></div>
        {!result ? <div className="result-empty">No calculation yet.<br/>The verified solution will appear here.</div> : result.error ? <div className="error">{result.error}</div> : <>
          <div className="verified-box"><span>FINAL VERIFIED MVT POINT</span><strong>{hybrid?.toFixed(6)}</strong><small><Check size={12}/> satisfies the MVT condition</small></div>
          <div className="result-row"><span>Numerical canonical c</span><b>{numerical?.toFixed(6)}</b></div>
          <div className="result-row"><span>AI predicted c</span><b>{ml?.toFixed(6) ?? "—"}</b></div>
          <div className="result-row"><span>AI prediction error</span><b>{predictionError?.toFixed(6) ?? "—"}</b></div>
          <div className="result-row"><span>Secant slope</span><b>{result.secant_slope?.toFixed(6)}</b></div>
          <div className="result-row"><span>Hybrid residual</span><b>{result.hybrid_residual?.toExponential(2) ?? "—"}</b></div>
          <div className="detected"><span>DETECTED MVT POINTS · COORDINATES</span><div className="coordinate-list">{result.mvt_points.map((c,i)=>{
            const pts = result.plot_points || [];
            const p = pts.reduce((best, point) => Math.abs(point.x-c) < Math.abs(best.x-c) ? point : best, pts[0] || {x:c,y:NaN});
            return <button type="button" key={i} title="Click to pin this MVT point" onClick={()=>pinPoint(c,p.y)}><b>c = {c.toFixed(5)}</b><span>f(c) ≈ {Number.isFinite(p.y) ? p.y.toFixed(5) : "—"}</span></button>;
          })}</div></div>
        </>}
      </aside>
    </section>

    <section className="finder panel">
      <div className="finder-copy"><span>04 / FUNCTION VALUE FINDER</span><h2>Evaluate any point on the curve</h2><p>Enter x to evaluate f(x), or click the curve to pin a sampled coordinate.</p></div>
      <div className="finder-form"><label>x</label><input value={valueX} onChange={e=>setValueX(e.target.value)} /><button className="secondary-button" onClick={findValue} disabled={valueLoading}>{valueLoading ? "Evaluating…" : "Evaluate f(x)"}</button></div>
      <div className="finder-result">{valueResult?.error ? <span className="error-inline">{valueResult.error}</span> : valueResult ? <><span>COORDINATE</span><strong>({Number(valueResult.x).toFixed(5)}, {Number(valueResult.value).toFixed(5)})</strong></> : <span className="muted">No point selected.</span>}</div>
    </section>

    <section className="method-grid">
      <article><span>AI ESTIMATION</span><h3>V4 PyTorch model</h3><p>Uses sampled function and derivative behaviour to estimate a relative MVT location.</p></article>
      <article><span>NUMERICAL VERIFICATION</span><h3>Brent root search</h3><p>Solves f′(c) − secant slope = 0 across the interval and detects multiple roots.</p></article>
      <article><span>HYBRID METHOD</span><h3>Predict → verify → refine</h3><p>If the AI residual exceeds tolerance, the nearest numerical MVT root becomes the final answer.</p></article>
    </section>

    <footer>AI Math Lab · V1 Generalized MVT Explorer · Mathematics × AI × Engineering</footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
