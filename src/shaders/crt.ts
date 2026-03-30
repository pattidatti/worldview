export const CRT_SHADER = /*glsl*/`
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;

    vec2 barrelDistort(vec2 uv, float k) {
        vec2 c = uv * 2.0 - 1.0;
        c = c * (1.0 + k * dot(c, c));
        return c * 0.5 + 0.5;
    }

    void main() {
        vec2 uv = barrelDistort(v_textureCoordinates, 0.15);

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec2 off = vec2(0.0025, 0.0);
        float r = texture(colorTexture, uv + off).r;
        float g = texture(colorTexture, uv).g;
        float b = texture(colorTexture, uv - off).b;

        float scanline = mod(gl_FragCoord.y, 2.0) < 1.0 ? 0.70 : 1.0;

        vec2 centered = v_textureCoordinates - 0.5;
        float vignette = 1.0 - smoothstep(0.45, 0.75, length(centered));

        out_FragColor = vec4(vec3(r, g, b) * scanline * vignette, 1.0);
    }
`;
