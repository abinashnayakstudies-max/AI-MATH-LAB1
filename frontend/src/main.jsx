import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, CircleHelp, Crosshair, FlaskConical, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";

const API = "https://ai-math-lab1.onrender.com";

function MVTScene({ result, inspectX, inspectValue }) {
  const mountRef = useRef(null);
  const plot = useMemo(() => {
    if (!result?.plot_points?.length) return null;
    const pts = result.plot_points;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xPad = Math.max((maxX - minX) * 0.08, 0.2);
    const yPad = Math.max((maxY - minY) * 0.12, 0.2);
    return { pts, minX: minX - xPad, maxX: maxX + xPad, minY: minY - yPad, maxY: maxY + yPad };
  }, [result]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#08111b");
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 1000);
    camera.position.set(0, 4.8, 9.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 4.5;
    controls.maxDistance = 18;

    const grid = new THREE.GridHelper(12, 24, 0x31485d, 0x1b2a39);
    grid.position.y = -0.02;
    scene.add(grid);
    const axes = new THREE.AxesHelper(4.8);
    axes.material.transparent = true;
    axes.material.opacity = 0.55;
    scene.add(axes);

    const group = new THREE.Group();
    scene.add(group);
    const addLine = (points, color, width = 2) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color, linewidth: width });
      const line = new THREE.Line(geometry, material);
      group.add(line);
      return line;
    };

    const scaleX = 7.5 / Math.max(plot ? plot.maxX - plot.minX : 6, 1);
    const scaleY = 4.8 / Math.max(plot ? plot.maxY - plot.minY : 4, 1);
    const mapX = x => ((x - (plot?.minX ?? -3)) * scaleX) - 3.75;
    const mapY = y => ((y - (plot?.minY ?? -2)) * scaleY) - 2.4;

    if (plot) {
      const valid = plot.pts.filter(p => Number.isFinite(p.y));
      addLine(valid.map(p => new THREE.Vector3(mapX(p.x), mapY(p.y), 0)), 0x73b8e6, 3);

      const nearest = target => plot.pts.reduce((best, p) => Math.abs(p.x - target) < Math.abs(best.x - target) ? p : best, plot.pts[0]);
      const pa = nearest(result.a), pb = nearest(result.b);
      addLine([
        new THREE.Vector3(mapX(result.a), mapY(pa.y), 0.05),
        new THREE.Vector3(mapX(result.b), mapY(pb.y), 0.05)
      ], 0xd7a85e, 2);

      const c = result.hybrid_c ?? result.canonical_c;
      const pc = nearest(c);
      const tangentSpan = (plot.maxX - plot.minX) * 0.18;
      const t1 = c - tangentSpan, t2 = c + tangentSpan;
      addLine([
        new THREE.Vector3(mapX(t1), mapY(pc.y + result.secant_slope * (t1 - c)), 0.1),
        new THREE.Vector3(mapX(t2), mapY(pc.y + result.secant_slope * (t2 - c)), 0.1)
      ], 0xb88ad7, 2);

      const point = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0x9ed2ff, emissive: 0x245e83, emissiveIntensity: 1.1 })
      );
      point.position.set(mapX(c), mapY(pc.y), 0.16);
      group.add(point);

      if (inspectX != null && inspectValue != null) {
        const ip = new THREE.Mesh(
          new THREE.SphereGeometry(0.10, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0xe0c77c, emissive: 0x806b26, emissiveIntensity: 0.7 })
        );
        ip.position.set(mapX(inspectX), mapY(inspectValue), 0.2);
        group.add(ip);
        const stem = addLine([
          new THREE.Vector3(mapX(inspectX), 0, 0.15),
          new THREE.Vector3(mapX(inspectX), mapY(inspectValue), 0.15)
        ], 0xe0c77c, 1);
        stem.material.transparent = true;
        stem.material.opacity = 0.6;
      }
    }

    scene.add(new THREE.AmbientLight(0xb7d7ee, 1.1));
    const resize = () => {
      const w = mount.clientWidth, h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", resize);
    let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [plot, result, inspectX, inspectValue]);

  return <div className="scene-wrap">
    <div ref={mountRef} className="three-canvas" />
    <div className="scene-labels">
      <span><i className="line-key curve-key" />f(x)</span>
      <span><i className="line-key secant-key" />secant</span>
      <span><i className="line-key tangent-key" />tangent</span>
      <span><i className="point-key" />verified c</span>
      {inspectX != null && <span><i className="inspect-key" />f(x) point</span>}
    </div>
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
        <MVTScene result={result} inspectX={valueResult?.x} inspectValue={valueResult?.value}/>
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
          <div className="detected"><span>DETECTED MVT POINTS</span><div>{result.mvt_points.map((c,i)=><code key={i}>{c.toFixed(5)}</code>)}</div></div>
        </>}
      </aside>
    </section>

    <section className="finder panel">
      <div className="finder-copy"><span>04 / FUNCTION VALUE FINDER</span><h2>Evaluate any point on the curve</h2><p>Enter x to calculate f(x) and mark the coordinate directly in the visualization.</p></div>
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
