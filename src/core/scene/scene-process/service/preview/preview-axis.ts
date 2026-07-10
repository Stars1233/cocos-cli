import { Node, Vec3, Camera, Color, Quat, assetManager, Layers, gfx, Rect } from 'cc';
import ControllerBase from '../gizmo/controller/base';
import ControllerUtils from '../gizmo/utils/controller-utils';
import ControllerShape from '../gizmo/utils/controller-shape';
import { setNodeOpacity, setMaterialProperty, create3DNode, setMeshColor } from '../gizmo/utils/engine-utils';
import { Service } from '../core/decorator';

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function LimitLerp(a: number, b: number, t: number, tMin: number, tMax: number) {
    t = clamp((t - tMin) / (tMax - tMin), 0, 1);
    return a * (1 - t) + b * t;
}

const camera_forward = new Vec3(0, 0, -1);
const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const tempQuat_a = new Quat();

export class PreviewWorldAxis extends ControllerBase {
    public _sceneGizmoCamera: Camera;
    private _cameraOffset: Vec3 = new Vec3(0, 0, 40);
    private _textNodeMap: Map<string, Node> = new Map<string, Node>();
    private synchronizeCamera: Camera;

    constructor(rootNode: Node, synchronizeCamera: Camera) {
        super(rootNode);
        this._sceneGizmoCamera = new Node('axis-camera').addComponent(Camera);
        this._sceneGizmoCamera.node.parent = rootNode;
        this._sceneGizmoCamera.camera.visibility = Layers.Enum.SCENE_GIZMO;
        this._sceneGizmoCamera.camera.clearFlag = gfx.ClearFlagBit.DEPTH_STENCIL;
        this._sceneGizmoCamera.clearColor = synchronizeCamera.clearColor;

        const curWindow = (cc as any).director.root.curWindow;
        const winWidth = curWindow?.width ?? 800;
        const winHeight = curWindow?.height ?? 600;
        const height = winHeight / 3;
        const heightPercent = height / winHeight;
        const delta = ((winWidth - winHeight) * heightPercent) / 2 / winWidth;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
        const padding = 30 * dpr / winHeight;
        this._sceneGizmoCamera.rect = new Rect(1 - heightPercent + delta, padding, heightPercent, heightPercent);

        this.synchronizeCamera = synchronizeCamera;

        this.initShape();
    }

    initShape() {
        this.createShapeNode('PreviewWorldAxis');
        // x axis
        this.createAxis('x', cc.Color.RED, cc.v3(0, 0, -90));

        // y axis
        this.createAxis('y', cc.Color.GREEN, cc.v3());

        // z axis
        this.createAxis('z', cc.Color.BLUE, cc.v3(90, 0, 0));

        this.createAxisText(AxisName.x, 'ac74fa2b-1f5b-4ff5-a3f0-f127f4483e91@6c48a', Color.RED);
        this.createAxisText(AxisName.y, '7b5313d0-f1aa-4b1b-a3c8-59d523c35301@6c48a', Color.GREEN);
        this.createAxisText(AxisName.z, '389d5fee-e29c-4221-b397-a4934a0a5694@6c48a', Color.BLUE);

        this.registerCameraMovedEvent();
    }

    private _hide = false;

    public hide(): void {
        if (this.shape) {
            this.shape.active = false;
        }
        this._hide = true;
        this._sceneGizmoCamera.enabled = false;
    }

    public show(): void {
        if (this.shape) {
            this.shape.active = true;
        }
        this._hide = false;
        this._sceneGizmoCamera.enabled = true;
    }

    public createShapeNode(name: string) {
        const node = create3DNode(name);
        node.parent = this._rootNode;
        this.shape = node;
    }

    createAxis(axisName: string, color: Color, rotation: Vec3) {
        const baseArrowBodyHeight = 6;

        const axisNode = new Node();
        // line
        const lineData = ControllerShape.calcLineData(new Vec3(0, 0, 0), new Vec3(0, baseArrowBodyHeight, 0));
        const bodyOpts: any = { noDepthTestForLines: true, forwardPipeline: true, bodyBBSize: 0 };
        const lineNode = ControllerUtils.createShapeByData(lineData, color, bodyOpts);
        lineNode.name = 'ArrowLine';
        lineNode.parent = axisNode;
        setMeshColor(lineNode, color);

        axisNode.name = axisName + 'Axis';
        axisNode.children.forEach((node: Node) => {
            node.layer = cc.Layers.Enum.SCENE_GIZMO;
        });
        axisNode.parent = this.shape;
        axisNode.setRotationFromEuler(rotation);

        this.initHandle(axisNode, axisName);
    }

    createAxisText(axis: string, uuid: string, color: Color) {
        const axisNode = this._handleDataMap[axis];
        const textNode = ControllerUtils.quad(Vec3.ZERO, 3, 3, Vec3.UNIT_Z, color, { texture: true, needBoundingBox: false });
        this.setTextureByUUID(textNode, uuid);
        textNode.setPosition(0, 9, 0);
        textNode.parent = axisNode.topNode;
        textNode.layer = cc.Layers.Enum.SCENE_GIZMO;
        this._textNodeMap.set(axis, textNode);
    }

    setTextureByUUID(node: Node, uuid: string) {
        assetManager.loadAny(uuid, (err: any, img: any) => {
            if (img) {
                setMaterialProperty(node, 'mainTexture', img);
                if (!this._hide) {
                    Service.Engine.repaintInEditMode();
                }
            }
        });
    }

    public registerCameraMovedEvent() {
        this.synchronizeCamera.node.on('transform-changed', this.onEditorCameraMoved, this);
    }

    onEditorCameraMoved() {
        if (this._hide) { return; }
        const cameraRot = tempQuat_a;
        this.adjustControllerSize();
        this.synchronizeCamera.camera.node.getWorldRotation(cameraRot);

        // face text to camera
        this._textNodeMap.forEach((textNode: Node) => {
            textNode?.setWorldRotation(cameraRot);
        });

        // alpha
        Vec3.transformQuat(tempVec3_a, camera_forward, cameraRot);
        Object.keys(this._handleDataMap).forEach((key) => {
            const axisData = this._handleDataMap[key];
            const dir = axisDirMap[key];
            if (dir) {
                const opacity = LimitLerp(1, 0, Math.abs(Vec3.dot(tempVec3_a, dir)), 0.9, 1.0) * 255;

                const rendererNodes = axisData.rendererNodes;
                if (rendererNodes) {
                    rendererNodes.forEach((node: Node, index: number) => {
                        if (opacity < 10) {
                            node.active = false;
                        } else {
                            node.active = true;
                            setNodeOpacity(node, opacity);
                            axisData.oriOpacities[index] = opacity;
                        }
                    });
                }
            }
        });

        // sync rotation of Editor Camera
        const sceneGizmoCameraNode = this._sceneGizmoCamera!.node;

        Vec3.transformQuat(tempVec3_b, this._cameraOffset, cameraRot);
        Vec3.add(tempVec3_b, this.getPosition(), tempVec3_b);
        sceneGizmoCameraNode.setWorldPosition(tempVec3_b);

        Vec3.transformQuat(tempVec3_b, Vec3.UNIT_Y, cameraRot);
        Vec3.normalize(tempVec3_b, tempVec3_b);
        sceneGizmoCameraNode.lookAt(this.getPosition(), tempVec3_b);
    }
}
