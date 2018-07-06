const canvasSketch = require('canvas-sketch');
const createRegl = require('regl');

// Parameters for the sketch
const settings = {
  animate: true, // Optional: Enable the animation loop
  context: 'webgl', // Setup WebGL instead of 2D canvas
  attributes: { antialias: true } // Turn on MSAA
};

const sketch = ({ gl }) => {
  // Setup REGL with our canvas context
  const regl = createRegl({ gl });

  // Regl GL draw commands
  // ...

  // Return the renderer function
  return ({ time }) => {
    // Update regl sizes
    regl.poll();

    // Clear back buffer
    regl.clear({
      color: [ 0, 0, 0, 1 ]
    });

    // Draw meshes to scene
    // ...
  };
};

canvasSketch(sketch, settings);
