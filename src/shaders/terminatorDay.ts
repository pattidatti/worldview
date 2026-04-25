export const TERMINATOR_DAY_SHADER = /*glsl*/`
    uniform sampler2D colorTexture;
    uniform float u_time;
    in vec2 v_textureCoordinates;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);

        // Rekonstruer omtrentlig world-space retning for denne pikselen
        // czm_inverseViewProjection og czm_sunDirectionWC er Cesium built-ins
        vec2 ndc = v_textureCoordinates * 2.0 - 1.0;
        vec4 farPoint = czm_inverseViewProjection * vec4(ndc, 1.0, 1.0);
        vec3 worldDir = normalize(farPoint.xyz / farPoint.w);

        // Solvinkel: > 0 = dagside, < 0 = nattside
        float sunDot = dot(worldDir, czm_sunDirectionWC);

        float tw = 0.09;
        float inTerminator = 1.0 - smoothstep(-tw, tw, sunDot);
        float nightFactor  = 1.0 - smoothstep(-tw * 2.0, 0.0, sunDot);

        // Bykjerner: hash-grid per 2px, vises kun på mørke piksler (nattside)
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec2 grid = floor(gl_FragCoord.xy / 2.0);
        float flicker = 0.92 + 0.08 * sin(u_time * 3.7 + hash(grid) * 6.28);
        float cityLight = step(1.0 - 0.022, hash(grid)) * flicker;
        vec3 cityColor  = mix(vec3(1.0, 0.85, 0.4), vec3(0.7, 0.9, 1.0), hash(grid + 13.7));
        float cityB = cityLight * nightFactor * smoothstep(0.09, 0.0, lum) * 3.0;

        // Terminator-gløde: gyllen/oransje atmosfærisk bånd
        vec3 glowColor = mix(vec3(1.0, 0.55, 0.1), vec3(1.0, 0.85, 0.3),
                             smoothstep(-0.05, 0.06, sunDot));
        float glowStr = inTerminator * 0.38;

        // Nattside blåtone (atmosfærisk lysspredning)
        vec3 blueShift = vec3(0.05, 0.08, 0.20) * nightFactor * 0.45;

        vec3 result = color.rgb;
        result += cityColor * cityB;
        result = mix(result, result + glowColor, glowStr);
        result += blueShift;

        out_FragColor = vec4(clamp(result, 0.0, 1.0), color.a);
    }
`;
