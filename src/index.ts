import _ from 'lodash';
import './style.css';
import Buttons from './buttons.png';
import REGL from "regl";

const regl = REGL({
    // TODO: why do these seem to do nothing?
    // extensions: ['OES_texture_float'],
    // optionalExtensions: ['oes_texture_float_linear'],
});

const RADIUS = 2048 // TODO - make this not just square
const MAX_ITERATIONS = 128
const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0)

const state = (Array(2)).fill(0).map(() =>
    regl.framebuffer({
        color: regl.texture({
            radius: RADIUS,
            data: INITIAL_CONDITIONS,
            wrap: 'repeat'
        }),
        // semingly no effect (yet?)
        // colorFormat: 'rgba32f',
        // colorType: 'float',
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
        float x = data.x+data.x;
        float y = data.y+data.y;
        int i = int(data.z*${MAX_ITERATIONS}.);
        float signs = data.a;
        vec2 c = (uv-vec2(0.5))*4.;

        if (i == 0) {
            x = 0.;
            y = 0.;
            signs = 0.;
        }

        if (signs > .5) {
            x = -x;
            signs-=.5;
        }
        if (signs > .25) {
            y = -y;
        }

        if (i >= ${MAX_ITERATIONS}) {
            i = ${MAX_ITERATIONS};
        } else if (abs(x) < 2. && abs(y) < 2.) {
            float zx = x*x - y*y + c.x;
            y = (x+x)*y + c.y;
            x = zx;
            i+= 1;
        } else {
            x = 2.;
            y = 2.;
        }
        signs = 0.;
        if (x < 0.) signs+=.6;
        if (y < 0.) signs+=.3;
        gl_FragColor = vec4(abs(x)/2.,abs(y)/2.,float(i)/${MAX_ITERATIONS}.,signs);
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
    float state = texture2D(prevState, uv).z;
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

    count: 3,

    // TODO
    //primitive: "triangle fan"
})

regl.frame(() => {
    // TODO - we probably don't want these to share the same vertices?
    setupQuad(() => {
        regl.draw()
        updateFractal()
    })
})