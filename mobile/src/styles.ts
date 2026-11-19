// Native: no stylesheet. NativeWind v5's CSS compiler fails to bundle for iOS/Android with this toolchain
// ("failed to deserialize ... Specifier"), and the app styles itself with style props + the theme palette, so nothing needs it.
export {};
