const canvasSketch = require('canvas-sketch');
const polylinesToSVG = () => `<svg></svg>`;

const settings = {
  scaleToView: true,
  pixelsPerInch: 300,
  dimensions: [ 8.5, 11 ],
  units: 'in'
};

const sketch = ({ width, height }) => {
  let lines = [];

  // Draw some circles expanding outward
  const steps = 5;
  const count = 20;
  const spacing = 1;
  const radius = 2;
  for (let j = 0; j < count; j++) {
    const r = radius + j * spacing;
    const circle = [];
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      const angle = Math.PI * 2 * t;
      circle.push([
        width / 2 + Math.cos(angle) * r,
        height / 2 + Math.sin(angle) * r
      ]);
    }
    lines.push(circle);
  }

  return ({ context }) => {
    // Draw background
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    // Set stroke thickness to X inches
    context.lineWidth = 0.05;

    // Draw content
    lines.forEach(points => {
      context.beginPath();
      points.forEach(p => context.lineTo(p[0], p[1]));
      context.stroke();
    });

    // Render SVG
    return [ context.canvas, { data: polylinesToSVG(lines, settings), extension: '.svg' } ];
  };
};

canvasSketch(sketch, settings);
