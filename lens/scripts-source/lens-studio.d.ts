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

declare namespace CameraModule {
    enum CameraId {
        Left_Color,
        Right_Color,
        Default_Color,
    }
    class CameraRequest {
        cameraId: CameraModule.CameraId;
        imageSmallerDimension?: number;
    }
    class CameraFrame {}
}
declare type CameraModule = {
    requestCamera(req: CameraModule.CameraRequest): any;
};
declare const CameraModule: {
    createCameraRequest(): CameraModule.CameraRequest;
    CameraId: typeof CameraModule.CameraId;
};
