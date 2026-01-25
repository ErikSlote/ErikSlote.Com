// lava-canvas.js - Shared lava lamp background

const config = {
  blobCount: 75,
  minBlobSize: 14,
  maxBlobSize: 20,
  blobSpeed: 3.5,
  blobStickiness: 0.9,
  color1: '#1B02A3',
  color2: '#8A00C4',
  backgroundColor: '#000000',
  threshold: 0.3
};

const canvas = document.getElementById('lava-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
  console.error('WebGL not supported.');
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function hexToRGB(hex) {
  let h = hex.replace('#','');
  if (h.length === 3) {
    h = h.split('').map(ch => ch + ch).join('');
  }
  const num = parseInt(h, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >>  8) & 255) / 255,
    ( num        & 255) / 255
  ];
}

const rgb1 = hexToRGB(config.color1);
const rgb2 = hexToRGB(config.color2);
const bgColor = hexToRGB(config.backgroundColor);

class Blob {
  constructor(x, y, vx, vy, r, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    this.color = color;
  }
}

function createBlob() {
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  let vx, vy;
  do {
    vx = (Math.random() - 0.5) * config.blobSpeed;
    vy = (Math.random() - 0.5) * config.blobSpeed;
  } while (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05);

  const radius = Math.random() * (config.maxBlobSize - config.minBlobSize) + config.minBlobSize;
  const w = Math.random();
  const blend = [
    w * rgb1[0] + (1 - w) * rgb2[0],
    w * rgb1[1] + (1 - w) * rgb2[1],
    w * rgb1[2] + (1 - w) * rgb2[2]
  ];
  return new Blob(x, y, vx, vy, radius, blend);
}

let blobs = [];
for (let i = 0; i < config.blobCount; i++) {
  blobs.push(createBlob());
}

function updateBlob(b) {
  b.x += b.vx;
  b.y += b.vy;

  if (b.x < b.r || b.x > canvas.width - b.r) {
    b.vx = -b.vx * config.blobStickiness;
    b.vx = Math.sign(b.vx) * Math.max(Math.abs(b.vx), 0.5);
    b.vx = Math.sign(b.vx) * Math.min(Math.abs(b.vx), config.blobSpeed);
  }

  if (b.y < b.r || b.y > canvas.height - b.r) {
    b.vy = -b.vy * config.blobStickiness;
    b.vy = Math.sign(b.vy) * Math.max(Math.abs(b.vy), 0.7);
    b.vy = Math.sign(b.vy) * Math.min(Math.abs(b.vy), config.blobSpeed);
  }
}

function compileShader(src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(vSrc, fSrc) {
  const vs = compileShader(vSrc, gl.VERTEX_SHADER);
  const fs = compileShader(fSrc, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

const vShader = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fShader = `
  precision highp float;
  const float threshold = ${config.threshold};
  uniform vec3 u_blobs[${config.blobCount}];
  uniform vec3 u_blobColors[${config.blobCount}];
  uniform vec3 u_bgColor;

  void main() {
    float x = gl_FragCoord.x;
    float y = gl_FragCoord.y;
    float totalInfl = 0.0;
    vec3 colorSum = vec3(0.0);
    for (int i = 0; i < ${config.blobCount}; i++) {
      vec3 blob = u_blobs[i];
      float dx = blob.x - x;
      float dy = blob.y - y;
      float infl = (blob.z * blob.z) / (dx*dx + dy*dy);
      totalInfl += infl;
      colorSum += infl * u_blobColors[i];
    }
    if (totalInfl > threshold) {
      gl_FragColor = vec4(colorSum / totalInfl, 1.0);
    } else {
      gl_FragColor = vec4(u_bgColor, 1.0);
    }
  }
`;

const program = createProgram(vShader, fShader);
gl.useProgram(program);

const posData = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]);
const posBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

const aPosLoc = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(aPosLoc);
gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

const uBlobsLoc = gl.getUniformLocation(program, 'u_blobs');
const uBlobColorsLoc = gl.getUniformLocation(program, 'u_blobColors');
const uBgColorLoc = gl.getUniformLocation(program, 'u_bgColor');

function animate() {
  blobs.forEach(updateBlob);

  const blobArray = [];
  const colorArray = [];
  for (let b of blobs) {
    blobArray.push(b.x, b.y, b.r);
    colorArray.push(b.color[0], b.color[1], b.color[2]);
  }
  
  gl.uniform3fv(uBlobsLoc, new Float32Array(blobArray));
  gl.uniform3fv(uBlobColorsLoc, new Float32Array(colorArray));
  gl.uniform3fv(uBgColorLoc, new Float32Array(bgColor));

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(animate);
}

animate();