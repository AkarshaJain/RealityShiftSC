// Minimal ambient declarations so the workspace TypeScript server doesn't
// flag Lens-Studio-injected globals as errors. These symbols are provided
// at compile time by Lens Studio itself — this file is only for the editor.
//
// DO NOT rely on these types for real API shapes. The Lens Studio docs are
// the source of truth:
//   https://developers.snap.com/lens-studio/api/lens-scripting

declare function component(target: any): any;
declare function input(target: any, key: string): void;
declare function print(message: any): void;
declare function require(name: string): any;

declare class BaseScriptComponent {
    createEvent(name: string): { bind: (cb: () => void) => void };
}

declare class SceneObject {
    getComponent(typeName: string): any;
}

declare namespace GestureModule {
    enum HandType {
        Left,
        Right,
    }
}
declare type GestureModule = {
    getPinchDownEvent(hand: GestureModule.HandType): { add: (cb: (args?: any) => void) => any };
    getPinchUpEvent(hand: GestureModule.HandType): { add: (cb: (args?: any) => void) => any };
};

// CameraModule is injected as a global by Lens Studio. We declare it as a
// single const whose shape contains both the factory/enum and the runtime
// methods. Using `any` for the inner enum avoids fighting TS about how
// namespaces merge with consts — this file is editor-hint only.
declare const CameraModule: any;

declare class Request {
    constructor(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> });
}

declare class Response {
    status: number;
    text(): Promise<string>;
    json(): Promise<any>;
}

declare type InternetModule = {
    fetch(request: string | Request, options?: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
    }): Promise<Response>;
};

declare const CompressionQuality: {
    LowQuality: number;
    Low: number;
    Medium: number;
    HighQuality: number;
    High: number;
};

declare const EncodingType: {
    Jpg: number;
    JPG: number;
    JPEG: number;
    Png: number;
    PNG: number;
};

declare const Base64: {
    encodeTextureAsync(
        texture: any,
        onSuccess: (encoded: string) => void,
        onFailure: () => void,
        compressionQuality: number,
        encodingType: number,
    ): void;
    decode(encoded: string): string;
};
