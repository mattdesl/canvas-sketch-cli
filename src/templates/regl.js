const canvasSketch = require('canvas-sketch');
const createRegl = require('regl');

const settings = {
  // Make the loop animated
  animate: true,
  // Get a WebGL canvas rather than 2D
  context: 'webgl',
  // Turn on MSAA
  attributes: { antialias: true }
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
