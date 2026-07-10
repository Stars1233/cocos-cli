import { renderer } from 'cc';

const _d2r = Math.PI / 180.0;

function toRadian(a: number) {
    return a * _d2r;
}

export function applyCamera(cameraComponent: any, camera: renderer.scene.Camera | null = null) {
    if (camera) {
        camera.setViewportInOrientedSpace(cameraComponent.rect);
        camera.fov = toRadian(cameraComponent.fov);
        camera.fovAxis = cameraComponent.fovAxis;
        camera.orthoHeight = cameraComponent.orthoHeight;
        camera.nearClip = cameraComponent.near;
        camera.farClip = cameraComponent.far;
        camera.projectionType = cameraComponent.camera ? cameraComponent.camera.projectionType : 1;
        const x = cameraComponent.clearColor.x;
        const y = cameraComponent.clearColor.y;
        const z = cameraComponent.clearColor.z;
        const w = cameraComponent.clearColor.w;
        camera.clearColor = { x, y, z, w };
        camera.clearDepth = cameraComponent.clearDepth;
        camera.clearStencil = cameraComponent.clearStencil;
        camera.clearFlag = cameraComponent.clearFlags;
        camera.visibility = cameraComponent.visibility;
        camera.aperture = cameraComponent.aperture;
        camera.shutter = cameraComponent.shutter;
        camera.iso = cameraComponent.iso;
    }
    return camera;
}

export function attachToScene(node: any, camera: any) {
    if (!node.scene || !node._camera) {
        return;
    }
    if (camera && camera.scene) {
        camera.scene.removeCamera(camera);
    }
    const scene = node.scene.renderScene();
    scene.addCamera(camera);
}

export function detachFromScene(camera: any) {
    if (camera && camera.scene) {
        camera.scene.removeCamera(camera);
    }
}
