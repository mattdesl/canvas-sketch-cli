const canvasSketch = require('canvas-sketch');

// Assign THREE to global for the examples/
global.THREE = require('three');

// Include any additional ThreeJS utilities
require('three/examples/js/controls/OrbitControls');

// Parameters for the sketch
const settings = {
  animate: true, // Ensure we get an animation loop
  context: 'webgl', // Setup WebGL instead of 2D canvas
  attributes: { antialias: true } // Turn on MSAA
};

const sketch = ({ context }) => {
  const renderer = new THREE.WebGLRenderer({
    context
  });

  // Setup a 3D perspective camera
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(2, 2, -4);
  camera.lookAt(new THREE.Vector3());

  // Orbit controls for click + drag interaction
  const controls = new THREE.OrbitControls(camera);
  const scene = new THREE.Scene();

  // Add a basic ThreeJS mesh
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 'black',
      wireframe: true
    })
  );
  scene.add(mesh);

  return {
    // Handle window resize events
    resize ({ pixelRatio, viewportWidth, viewportHeight }) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(viewportWidth, viewportHeight);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    },
    // Render each frame
    render ({ time, deltaTime }) {
      // Rotate our mesh slowly
      mesh.rotation.y += deltaTime * (10 * Math.PI / 180);

      controls.update();
      renderer.render(scene, camera);
    }
  };
};

canvasSketch(sketch, settings);
