const canvasSketch = require('canvas-sketch');
const p5 = require('p5');

const preload = p5 => {
  // You can use p5.loadImage() here, etc...
};

const settings = {
  // Pass the p5 instance, and preload function if necessary
  p5: { p5, preload },
  // Turn on a render loop
  animate: true
};

canvasSketch(() => {
  // Return a renderer, which is like p5.js 'draw' function
  return ({ p5, time, width, height }) => {
    // Draw with p5.js things
    p5.background(0);
    p5.fill(255);
    p5.noStroke();

    const anim = p5.sin(time - p5.PI / 2) * 0.5 + 0.5;
    p5.rect(0, 0, width * anim, height);
  };
}, settings);
