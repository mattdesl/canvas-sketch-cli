const canvasSketch = require('canvas-sketch');

const settings = {
  dimensions: [ 2048, 2048 ]
};

const sketch = () => {
  
  /**
   * @param {{context: CanvasRenderingContext2D}} 
   */
  const render = ({ context, width, height }) => {
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
  };
  
  return render;
};

canvasSketch(sketch, settings);
