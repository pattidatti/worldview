export const ANIME_SHADER = /*glsl*/`
    uniform sampler2D colorTexture;
    uniform float u_time;
    in vec2 v_textureCoordinates;

    float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
        float tl = dot(texture(tex, uv + texelSize * vec2(-1.0,  1.0)).rgb, vec3(0.299, 0.587, 0.114));
        float  t = dot(texture(tex, uv + texelSize * vec2( 0.0,  1.0)).rgb, vec3(0.299, 0.587, 0.114));
        float tr = dot(texture(tex, uv + texelSize * vec2( 1.0,  1.0)).rgb, vec3(0.299, 0.587, 0.114));
        float  l = dot(texture(tex, uv + texelSize * vec2(-1.0,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float  r = dot(texture(tex, uv + texelSize * vec2( 1.0,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float bl = dot(texture(tex, uv + texelSize * vec2(-1.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114));
        float  b = dot(texture(tex, uv + texelSize * vec2( 0.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114));
        float br = dot(texture(tex, uv + texelSize * vec2( 1.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114));

        float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
        float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
        return sqrt(gx*gx + gy*gy);
    }

    float quantize(float v, float steps) {
        return floor(v * steps) / steps;
    }

    void main() {
        vec2 texelSize = vec2(1.0 / czm_viewport.z, 1.0 / czm_viewport.w);
        vec4 color = texture(colorTexture, v_textureCoordinates);

        // Saturation pulserer subtilt med u_time (0.15–0.25 syklus)
        float satBoost = 2.2 + 0.3 * sin(u_time * 0.8);

        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 saturated = mix(vec3(lum), color.rgb, satBoost);

        vec3 pastel = mix(saturated, vec3(0.95, 0.95, 1.0), 0.18);

        float lumPastel = dot(pastel, vec3(0.299, 0.587, 0.114));
        float q = quantize(lumPastel, 5.0);
        vec3 cel = pastel * (q / max(lumPastel, 0.001));

        float edge = sobel(colorTexture, v_textureCoordinates, texelSize * 1.5);
        float outline = smoothstep(0.18, 0.28, edge);

        vec3 finalColor = mix(cel, vec3(0.0), outline * 0.85);

        out_FragColor = vec4(finalColor, 1.0);
    }
`;
