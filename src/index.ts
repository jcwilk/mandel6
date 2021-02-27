import _ from 'lodash';
import './style.css';
import Buttons from './buttons.png';
import REGL from "regl";

const regl = REGL(); // default fullscreen behavior

const RADIUS = 512
const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0)

const state = (Array(2)).fill(0).map(() =>
    regl.framebuffer({
        color: regl.texture({
            radius: RADIUS,
            data: INITIAL_CONDITIONS,
            wrap: 'repeat'
        }),
        colorFormat: 'rgba32f',
        depthStencil: false
    }))

const updateFractal = regl({
    frag: `
    precision mediump float;

    varying vec2 uv;
    uniform sampler2D prevState;
    uniform int mandelRes;

    void main()
    {
        vec4 data = texture2D(prevState, uv);
        float x = data.x*2.;
        float y = data.y*2.;
        int i = int(data.z*256.);
        float signs = data.a;
        vec2 c = (uv-vec2(0.5))*4.;

        if (i == 0) {
            x = 0.;
            y = 0.;
            signs = 0.;
        }

        if (signs >= .5) x = -x;
        if (mod(signs,.5) > 0.) y = -y;

        if (abs(x) < 2. && abs(y) < 2.) {
            float zx = x*x - y*y + c.x;
            y = (x+x)*y + c.y;
            x = zx;
            i+= 1;
        } else {
            x = 2.;
            y = 2.;
        }
        signs = 0.;
        if (x < 0.) signs+=.5;
        if (y < 0.) signs+=.25;
        gl_FragColor = vec4(abs(x)/2.,abs(y)/2.,float(i)/256.,signs);
    }`,

    framebuffer: ({ tick }) => state[(tick + 1) % 2],

    uniforms: {
        mandelRes: RADIUS
    },
})

const setupQuad = regl({
    frag: `
  precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  void main() {
    float state = texture2D(prevState, uv).r;
    gl_FragColor = vec4(vec3(state), 1);
  }`,

    vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,

    attributes: {
        position: [-4, -4, 4, -4, 0, 4]
    },

    uniforms: {
        prevState: ({ tick }) => state[tick % 2]
    },

    depth: { enable: false },

    count: 3
})

regl.frame(() => {
    setupQuad(() => {
        regl.draw()
        updateFractal()
    })
})