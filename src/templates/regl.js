const canvasSketch = require('canvas-sketch');
const createRegl = require('regl');

const settings = {
  // Setup WebGL context
  context: 'webgl',
  // WebGL context attributes
  attributes: {
    antialias: true
  }
};

canvasSketch(({ gl }) => {
  // Setup REGL with our canvas context
  const regl = createRegl({ gl });

  // Regl GL draw commands...

  // Return the renderer function
  return () => {
    // Update regl sizes
    regl.poll();

    // Clear back buffer
    regl.clear({
      color: [ 0, 0, 0, 1 ]
    });

    // Draw meshes...
  };
}, settings);
