const canvasSketch = require('canvas-sketch');
const Two = require('two.js');

const settings = {
  dimensions: [ 1280, 1280 ],
  animate: true
};

const sketch = ({ canvas, width, height }) => {
  // Create a new Two.js instance with our existing canvas
  const two = new Two({ domElement: canvas });

  // Make a new rectangle that is placed in world center
  const size = width * 0.5;
  const background = new Two.Rectangle(0, 0, size, size);
  background.stroke = 'hsl(0, 0%, 25%)';
  background.linewidth = width * 0.025;
  background.fill = 'tomato';
  two.add(background);

  return {
    resize ({ pixelRatio, width, height }) {
      // Update width and height of Two.js scene based on
      // canvas-sketch auto changing viewport parameters
      two.width = width;
      two.height = height;
      two.ratio = pixelRatio;

      // This needs to be passed down to the renderer's width and height as well
      two.renderer.width = width;
      two.renderer.height = height;

      // Orient the scene to make 0, 0 the center of the canvas
      two.scene.translation.set(two.width / 2, two.height / 2);
    },
    render ({ time }) {
      // Animate the rectangle
      background.rotation = time * 1.5;

      // Update two.js via the `render` method - *not* the `update` method.
      two.render();
    }
  };
};

canvasSketch(sketch, settings);
