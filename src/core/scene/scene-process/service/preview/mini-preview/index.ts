import * as apply from './apply';
import { createPreviewNode } from './private';
import { Camera, CameraComponent, Node, renderer } from 'cc';
import { PreviewBase } from '../preview-base';
import PreviewBuffer from '../buffer';
import { Service } from '../../core/decorator';

export class MiniPreview extends PreviewBase {
    previewNodes: any = {};
    scene: any = null;
    renderScene: any = null;
    currNode: any = null;
    _previewInfo: any;

    public init(registerName: string, queryName: string) {
        this.previewBuffer = new PreviewBuffer(registerName, queryName);
        if (this.previewBuffer.window) {
            cc.director.root.destroyWindow(this.previewBuffer.window);
        }
        this._previewInfo = {
            width: 320,
            height: 240,
        };
    }

    public setPreviewResolution(width: number, height: number) {
        this._previewInfo = { width, height };
    }

    setAspect(srcCamCom: any, tarCam: any) {
        if (srcCamCom.targetTexture) {
            tarCam._aspect = srcCamCom.camera.aspect;
        } else {
            tarCam._aspect = this._previewInfo.width / this._previewInfo.height;
        }
    }

    public onNodeChanged(node: Node, opts: any) {
        if (!node) return;
        const srcCamera = node.getComponent('cc.Camera') as CameraComponent;
        if (!srcCamera) return;
        if (node === this.currNode && srcCamera) {
            if (!this.previewNodes[srcCamera.uuid]) {
                this.createPreviewNode(srcCamera);
            }
            const previewNode = this.previewNodes[srcCamera.uuid];
            apply.applyCamera(srcCamera, previewNode.camera);
            this.setAspect(srcCamera, previewNode.camera);
            Service.Engine.repaintInEditMode();
        }
    }

    public onNodeRemoved(node: Node) {
        const srcCamera = node.getComponent('cc.Camera') as CameraComponent;
        if (!srcCamera) return;
        this.removePreviewNode(srcCamera);
    }

    handleSelect(uuid: string) {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const currComp = EditorExtends?.Component?.getComponent?.(uuid);
        if (!currComp) return;
        if (!currComp.node.active || !currComp.node.activeInHierarchy || !currComp.enabled) {
            return;
        }
        Service.Engine.repaintInEditMode();
        this.createPreviewNode(currComp as CameraComponent);
    }

    handleUnselect(uuid: string) {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const currComp = EditorExtends?.Component?.getComponent?.(uuid);
        if (!currComp || !(currComp instanceof Camera)) return;
        this.removePreviewNode(currComp);
    }

    public onComponentRemoved(comp: CameraComponent) {
        if (!(comp instanceof Camera)) return;
        Service.Engine.repaintInEditMode();
        this.removePreviewNode(comp);
    }

    private clearByComponent(comp: CameraComponent) {
        if (comp instanceof Camera) {
            const { uuid } = comp;
            if (this.previewBuffer.windows[uuid]) {
                this.previewBuffer.removeWindow(uuid);
            }
            if (this.previewNodes[uuid]) {
                this.previewNodes[uuid].node.destroy();
                this.previewNodes[uuid].camera.destroy();
                delete this.previewNodes[uuid];
            }
        }
    }

    removePreviewNode(srcCamera: CameraComponent) {
        const currNode = srcCamera.node;
        for (let i = 0; i < currNode.children.length; ++i) {
            const privateCamera = currNode.children[i].getComponent('cc.Camera');
            // @ts-expect-error
            if (currNode.children[i].isPrivatePreview && privateCamera) {
                const privateNode = currNode.children[i];
                privateNode.destroy();
                srcCamera.node.removeChild(privateNode);
            }
        }
        this.currNode = null;
        this.clearByComponent(srcCamera);
    }

    createPreviewNode(srcCamera: CameraComponent) {
        this.clearByComponent(srcCamera);
        const name = srcCamera.node.name;
        const privateNode = createPreviewNode(name);
        const privateCamera = privateNode.addComponent('cc.Camera') as Camera;
        srcCamera.node.addChild(privateNode);

        if (!privateCamera.camera) {
            return;
        }

        privateCamera.camera.cameraUsage = renderer.scene.CameraUsage.PREVIEW;
        this.previewNodes[srcCamera.uuid] = { node: privateNode, camera: privateCamera.camera };

        const previewNode = this.previewNodes[srcCamera.uuid];
        apply.applyCamera(srcCamera, previewNode.camera);
        this.setAspect(srcCamera, previewNode.camera);

        if (!this.previewBuffer.windows[srcCamera.uuid]) {
            this.previewBuffer.createWindow(srcCamera.uuid);
        } else {
            this.previewBuffer.window = this.previewBuffer.windows[srcCamera.uuid];
            this.clearPreviewBuffer();
        }
        this.previewBuffer.switchCameras(previewNode.camera, this.previewBuffer.window);
        this.currNode = srcCamera.node;
        return previewNode;
    }

    public getPreviewInfo() {
        return this._previewInfo;
    }
}
