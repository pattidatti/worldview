export const THERMAL_SHADER = /*glsl*/`
    uniform sampler2D colorTexture;
    in vec2 v_textureCoordinates;

    vec3 thermalPalette(float t) {
        vec3 c0 = vec3(0.0, 0.0, 0.0);
        vec3 c1 = vec3(0.0, 0.0, 1.0);
        vec3 c2 = vec3(0.0, 1.0, 1.0);
        vec3 c3 = vec3(0.0, 1.0, 0.0);
        vec3 c4 = vec3(1.0, 1.0, 0.0);
        vec3 c5 = vec3(1.0, 0.0, 0.0);
        float s = clamp(t, 0.0, 1.0) * 5.0;
        int i = int(s);
        float f = fract(s);
        if (i == 0) return mix(c0, c1, f);
        if (i == 1) return mix(c1, c2, f);
        if (i == 2) return mix(c2, c3, f);
        if (i == 3) return mix(c3, c4, f);
        return mix(c4, c5, f);
    }

    void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        float noise = sin(v_textureCoordinates.x * 800.0) * sin(v_textureCoordinates.y * 600.0) * 0.03;
        lum = clamp(lum + noise, 0.0, 1.0);
        out_FragColor = vec4(thermalPalette(lum), 1.0);
    }
`;
