'use client';
import { useEffect, useRef } from 'react';

const imageUrl = '/home-river-valley-v3.webp';
const vertex = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;
const fragment = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D landscape;
  uniform vec2 crop;
  uniform float time;
  varying vec2 uv;

  float tree(vec2 p, vec2 center, vec2 radius, float phase) {
    vec2 distance = (p - center) / radius;
    float canopy = 1.0 - smoothstep(0.3, 1.0, dot(distance, distance));
    float height = clamp((center.y + radius.y - p.y) / (2.0 * radius.y), 0.0, 1.0);
    return canopy * height * height * sin(time * 1.05 + phase);
  }

  void main() {
    vec2 source = (uv - 0.5) * crop + 0.5;
    vec2 p = vec2(source.x, 1.0 - source.y);
    vec3 original = texture2D(landscape, source).rgb;
    // Colour masks keep moving water inside the illustrated channel, off the banks.
    float water = smoothstep(0.025, 0.075, original.g - original.r)
      * smoothstep(0.025, 0.075, original.b - original.r)
      * (1.0 - smoothstep(0.08, 0.2, abs(original.g - original.b)))
      * smoothstep(0.50, 0.57, p.y);
    float depth = smoothstep(0.50, 1.0, p.y);
    vec2 flow = vec2(
      sin(p.y * 120.0 - time * 3.4 + sin(p.x * 30.0)) * 0.006,
      sin(p.x * 96.0 + p.y * 65.0 - time * 3.0) * 0.0032
    ) * water * depth;
    // Small, softly bounded canopy regions bend near their tops; trunks stay rooted.
    float foliage = smoothstep(0.06, 0.14, original.g - original.b);
    float breeze = tree(p, vec2(0.10, 0.51), vec2(0.035, 0.085), 0.0)
      + tree(p, vec2(0.27, 0.58), vec2(0.035, 0.065), 0.8)
      + tree(p, vec2(0.85, 0.63), vec2(0.035, 0.070), 1.6)
      + tree(p, vec2(0.94, 0.56), vec2(0.045, 0.085), 0.5)
      + tree(p, vec2(0.21, 0.75), vec2(0.045, 0.070), 1.2)
      + tree(p, vec2(0.72, 0.78), vec2(0.045, 0.065), 2.0)
      + tree(p, vec2(0.94, 0.86), vec2(0.045, 0.080), 0.3)
      + tree(p, vec2(0.10, 0.85), vec2(0.050, 0.080), 1.0);
    vec2 moving = source + flow + vec2(breeze * foliage * 0.018, 0.0);
    vec3 colour = texture2D(landscape, clamp(moving, 0.001, 0.999)).rgb;
    float ripple = sin(p.y * 140.0 - time * 4.2 + sin(p.x * 32.0));
    colour += water * depth * (0.03 * ripple + 0.018 * smoothstep(0.65, 0.98, ripple));
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export default function HomeLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!context) return; // The CSS image remains visible on devices without WebGL.
    const gl = context;
    const shaders: WebGLShader[] = [];
    function compile(type: number, code: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      shaders.push(shader);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, vertex);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!vertexShader || !fragmentShader || !program) {
      shaders.forEach((shader) => gl.deleteShader(shader));
      if (program) gl.deleteProgram(program);
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const clock = gl.getUniformLocation(program, 'time');
    const crop = gl.getUniformLocation(program, 'crop');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const image = new Image();
    let ready = false;
    let disposed = false;
    let lost = false;
    let frame = 0;
    let lastFrame = 0;
    let elapsed = 0;

    function draw() {
      const ratio = canvas!.clientWidth / canvas!.clientHeight / (image.naturalWidth / image.naturalHeight);
      gl.viewport(0, 0, canvas!.width, canvas!.height);
      gl.uniform2f(crop, Math.min(1, ratio), Math.min(1, 1 / ratio));
      gl.uniform1f(clock, (elapsed / 1000) % (Math.PI * 40));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function tick(now: number) {
      if (disposed || lost) return;
      if (!lastFrame || now - lastFrame >= 1000 / 24) {
        if (lastFrame) elapsed += Math.min(now - lastFrame, 100);
        lastFrame = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function syncMotion() {
      cancelAnimationFrame(frame);
      lastFrame = 0;
      canvas!.hidden = !ready || lost || reducedMotion.matches;
      if (ready && !lost && !reducedMotion.matches && document.visibilityState === 'visible') {
        resize();
        frame = requestAnimationFrame(tick);
      }
    }
    function resize() {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.max(1, Math.round(canvas!.clientWidth * scale));
      canvas!.height = Math.max(1, Math.round(canvas!.clientHeight * scale));
      if (ready && !lost && !reducedMotion.matches) draw();
    }
    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      syncMotion();
    }
    image.onload = () => {
      if (disposed || lost) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      ready = true;
      resize();
      syncMotion();
    };
    image.src = imageUrl;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    reducedMotion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    canvas.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      image.onload = null;
      reducedMotion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
      canvas.removeEventListener('webglcontextlost', contextLost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
  }, []);

  return (
    <div className="home-landscape" aria-hidden="true">
      <canvas ref={canvasRef} className="landscape-motion" hidden />
    </div>
  );
}
