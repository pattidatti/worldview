export const NIGHT_VISION_SHADER = /*glsl*/`
    uniform sampler2D colorTexture;
    uniform float u_time;
    in vec2 v_textureCoordinates;

    void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        lum = clamp(lum * 1.8, 0.0, 1.0);

        // Scanlines med vertikal drift
        float scanY = mod(gl_FragCoord.y + u_time * 12.0, 3.0);
        float scanline = scanY < 1.0 ? 0.65 : 1.0;

        vec2 uv = v_textureCoordinates - 0.5;
        float vignette = 1.0 - smoothstep(0.45, 0.75, length(uv));

        // Subtil grønn shimmer
        float shimmer = 1.0 + 0.04 * sin(u_time * 3.0 + v_textureCoordinates.y * 20.0);

        out_FragColor = vec4(vec3(0.0, lum * shimmer, 0.0) * scanline * vignette, 1.0);
    }
`;
