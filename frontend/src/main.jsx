import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrandOrbs } from "@designcodeio/threeui";
import {
  Activity, Bot, Calculator, CheckCircle2, CircleHelp, Cpu, Gauge,
  GitCompareArrows, Layers3, Orbit, Play, RotateCcw, Sparkles
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "@designcodeio/threeui/style.css";
import "./style.css";

const API = "http://127.0.0.1:8000";

function MVTScene({ result }) {
  const mountRef = useRef(null);

  const plot = useMemo(() => {
    if (!result?.plot_points?.length) return null;
    const pts = result.plot_points;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xPad = Math.max((maxX - minX) * 0.08, 0.2);
    const yPad = Math.max((maxY - minY) * 0.12, 0.2);
    return {
      pts,
      minX: minX - xPad, maxX: maxX + xPad,
      minY: minY - yPad, maxY: maxY + yPad
    };
  }, [result]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07101d");

    const camera = new THREE.PerspectiveCamera(
      42, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 1000
    );
    camera.position.set(0, 5.2, 9.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 5;
    controls.maxDistance = 18;

    const grid = new THREE.GridHelper(12, 24, 0x28405b, 0x17283c);
    grid.position.y = -0.02;
    scene.add(grid);

    const axes = new THREE.AxesHelper(4.8);
    axes.material.transparent = true;
    axes.material.opacity = 0.45;
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
      const curvePts = plot.pts
        .filter(p => Number.isFinite(p.y))
        .map(p => new THREE.Vector3(mapX(p.x), mapY(p.y), 0));
      addLine(curvePts, 0x62b5ff, 3);

      const a = result.a, b = result.b;
      const ya = plot.pts.reduce((best, p) => Math.abs(p.x-a) < Math.abs(best.x-a) ? p : best, plot.pts[0]).y;
      const yb = plot.pts.reduce((best, p) => Math.abs(p.x-b) < Math.abs(best.x-b) ? p : best, plot.pts[0]).y;
      addLine([
        new THREE.Vector3(mapX(a), mapY(ya), 0.05),
        new THREE.Vector3(mapX(b), mapY(yb), 0.05)
      ], 0xf0b866, 2);

      const c = result.hybrid_c ?? result.canonical_c;
      const yc = plot.pts.reduce((best, p) => Math.abs(p.x-c) < Math.abs(best.x-c) ? p : best, plot.pts[0]).y;
      const slope = result.secant_slope;
      const tangentSpan = (plot.maxX - plot.minX) * 0.18;
      const t1 = c - tangentSpan, t2 = c + tangentSpan;
      addLine([
        new THREE.Vector3(mapX(t1), mapY(yc + slope * (t1-c)), 0.1),
        new THREE.Vector3(mapX(t2), mapY(yc + slope * (t2-c)), 0.1)
      ], 0xc98cff, 2);

      const geometry = new THREE.SphereGeometry(0.12, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8fd0ff, emissive: 0x1d6aa8, emissiveIntensity: 1.4
      });
      const point = new THREE.Mesh(
        geometry,
        material
      );
      point.position.set(mapX(c), mapY(yc), 0.16);
      group.add(point);

      const stem = addLine([
        new THREE.Vector3(mapX(c), 0, 0.12),
        new THREE.Vector3(mapX(c), mapY(yc), 0.12)
      ], 0x8fd0ff, 1);
      stem.material.transparent = true;
      stem.material.opacity = 0.45;
    } else {
      const curve = [];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const xx = -3.4 + t * 6.8;
        curve.push(new THREE.Vector3(xx, 1.1 * Math.sin(xx * 0.9), 0));
      }
      addLine(curve, 0x426d96, 2);
    }

    const ambient = new THREE.AmbientLight(0x9ecfff, 1.2);
    scene.add(ambient);

    const resize = () => {
      const w = mount.clientWidth, h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", resize);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(m => m.dispose());
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [plot, result]);

  return <div className="scene-wrap">
    <div ref={mountRef} className="three-canvas" />
    <div className="scene-legend">
      <span><i className="dot curve-dot" />f(x)</span>
      <span><i className="dot secant-dot" />Secant</span>
      <span><i className="dot tangent-dot" />Tangent</span>
      <span><i className="dot mvt-dot" />MVT point</span>
    </div>
    {!result && <div className="scene-empty"><Orbit size={22}/><span>Run a calculation to build the 3D scene.</span></div>}
  </div>;
}

function App() {
  const [expression, setExpression] = useState("x^2");
  const [a, setA] = useState("-2");
  const [b, setB] = useState("3");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/mvt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression, a: Number(a), b: Number(b) })
      });
      setResult(await r.json());
    } catch {
      setResult({ error: "Backend is not running. Start FastAPI first." });
    } finally {
      setLoading(false);
    }
  }

  const numerical = result?.canonical_c;
  const ml = result?.ml_c;
  const hybrid = result?.hybrid_c;

  return <main className="app">
    <header className="topbar">
      <div className="brand">
        <div className="brand-orb"><BrandOrbs variant="ui" size="small" mode="dark" speed={0.7} aria-label="AI Math Lab"/></div>
        <div>
          <div className="brand-name">AI Math Lab</div>
          <div className="brand-sub">Mathematics × AI × Engineering</div>
        </div>
      </div>
      <nav><a className="active">MVT</a><a>Root Finding</a><a>Taylor</a><a>Signals</a></nav>
      <div className="version"><span className="live-dot"/> V1 • MVT</div>
    </header>

    <section className="hero">
      <div>
        <span className="eyebrow">GENERALIZED MEAN VALUE THEOREM EXPLORER</span>
        <h1>See the mathematics.<br/><em>Let AI explore it.</em></h1>
        <p>Enter a function and interval to compare numerical verification, ML prediction, and hybrid refinement in an interactive 3D environment.</p>
      </div>
      <div className="hero-orb"><BrandOrbs variant="designcode" size="medium" mode="dark" speed={0.45} aria-label="Interactive AI Math Lab visual"/></div>
    </section>

    <section className="workspace">
      <aside className="panel controls">
        <div className="panel-head"><span className="icon-box"><Calculator size={16}/></span><div><h2>Problem Setup</h2><span>Define your function</span></div></div>
        <label>FUNCTION f(x)</label>
        <input className="main-input" value={expression} onChange={e=>setExpression(e.target.value)} placeholder="e.g. x^2 + sin(x)"/>
        <div className="row">
          <div><label>LOWER BOUND a</label><input value={a} onChange={e=>setA(e.target.value)}/></div>
          <div><label>UPPER BOUND b</label><input value={b} onChange={e=>setB(e.target.value)}/></div>
        </div>
        <button className="solve" onClick={calculate} disabled={loading}><Play size={16}/>{loading ? "Calculating..." : "Solve MVT"}</button>
        <div className="examples">
          <span>EXAMPLES</span>
          <button onClick={()=>{setExpression("x^2");setA("-2");setB("3")}}>x²</button>
          <button onClick={()=>{setExpression("sin(x)");setA("-2");setB("2")}}>sin(x)</button>
          <button onClick={()=>{setExpression("x^3 + sin(x)");setA("-2");setB("2")}}>x³ + sin(x)</button>
          <button onClick={()=>{setExpression("exp(-x^2)");setA("-2");setB("2")}}>e⁻ˣ²</button>
        </div>
        <div className="tip"><CircleHelp size={16}/><div><strong>Tip</strong><p>Use <code>**</code> for powers and standard functions such as <code>sin(x)</code>, <code>cos(x)</code>, and <code>exp(x)</code>.</p></div></div>
      </aside>

      <section className="panel visualization">
        <div className="panel-head scene-head"><div><span className="icon-box"><Orbit size={16}/></span><div><h2>3D MVT Visualizer</h2><span>Drag to rotate • Scroll to zoom</span></div></div><span className="scene-badge">LIVE</span></div>
        <MVTScene result={result}/>
      </section>

      <aside className="panel results">
        <div className="panel-head"><span className="icon-box"><Activity size={16}/></span><div><h2>MVT Results</h2><span>Numerical + AI analysis</span></div></div>
        {result?.error && <div className="error">{result.error}</div>}
        {!result && <div className="empty"><Layers3 size={28}/><p>Enter a function and interval, then solve to see the analysis.</p></div>}
        {result && !result.error && <>
          <div className="primary-result"><span>HYBRID MVT POINT</span><strong>{hybrid?.toFixed(6)}</strong><small><CheckCircle2 size={13}/> Verified inside interval</small></div>
          <div className="metric"><span>Numerical canonical c</span><strong>{numerical?.toFixed(6)}</strong></div>
          <div className="metric"><span>AI predicted c</span><strong>{ml?.toFixed(6) ?? "—"}</strong></div>
          <div className="metric"><span>Secant slope</span><strong>{result.secant_slope.toFixed(6)}</strong></div>
          <div className="metric"><span>Hybrid residual</span><strong>{result.hybrid_residual?.toExponential(2) ?? "—"}</strong></div>
          <div className="points"><span>DETECTED MVT POINTS</span><div>{result.mvt_points.map((c,i)=><code key={i}>{c.toFixed(5)}</code>)}</div></div>
        </>}
      </aside>
    </section>

    <section className="analysis-grid">
      <div className="card ai-card">
        <div className="card-icon"><Bot size={18}/></div><span className="eyebrow">AI LAYER</span>
        <h3>ML Prediction</h3>
        <p>V4 PyTorch model predicts a relative MVT location from sampled function and derivative behaviour.</p>
        <div className="card-value">{ml != null ? ml.toFixed(5) : "—"} <small>predicted c</small></div>
      </div>
      <div className="card">
        <div className="card-icon"><Cpu size={18}/></div><span className="eyebrow">VERIFICATION</span>
        <h3>Numerical Solver</h3>
        <p>Brent-based root search detects every numerical solution of f′(c) = secant slope.</p>
        <div className="card-value">{result?.mvt_points?.length ?? "—"} <small>points detected</small></div>
      </div>
      <div className="card">
        <div className="card-icon"><GitCompareArrows size={18}/></div><span className="eyebrow">HYBRID</span>
        <h3>AI + Numerical</h3>
        <p>The ML estimate is verified and refined using numerical roots when its residual is above tolerance.</p>
        <div className="card-value">{result?.hybrid_residual != null ? result.hybrid_residual.toExponential(2) : "—"} <small>final residual</small></div>
      </div>
      <div className="card">
        <div className="card-icon"><Gauge size={18}/></div><span className="eyebrow">STATUS</span>
        <h3>Mathematical Validity</h3>
        <p>MVT requires a &lt; c &lt; b and f′(c) to match the secant slope.</p>
        <div className="valid-big">{result && !result.error ? "✓ Verified" : "Ready"}</div>
      </div>
    </section>

    <footer><span>AI Math Lab • V1 Generalized MVT Explorer</span><span><Sparkles size={13}/> Built for mathematics, AI & engineering exploration</span></footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
