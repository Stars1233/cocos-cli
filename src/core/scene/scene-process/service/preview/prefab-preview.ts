import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { DirectionalLight, Scene, assetManager, Prefab, instantiate, UITransform, Canvas, Node } from 'cc';

export class PrefabPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    private canvasNode: Node | null = null;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Prefab Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    public async setPrefab(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to instantiate prefab in Prefab preview, by uuid: ${uuid}`);
            return null;
        }

        if (this._modelNode && this._modelNode.isValid) {
            this._modelNode.destroy();
            this._modelNode.parent = null;
        }
        if (this.canvasNode && this.canvasNode.isValid) {
            this.canvasNode.destroy();
            this.canvasNode.parent = null;
        }

        if (assetManager.assets.has(uuid)) {
            assetManager.releaseAsset(assetManager.assets.get(uuid)!);
            assetManager.assets.remove(uuid);
        }
        try {
            const prefabAsset = await new Promise<Prefab>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`Load prefab timeout: ${uuid}`)), 10000);
                assetManager.loadAny(uuid, (err: any, asset: any) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(asset);
                });
            });
            this._modelNode = instantiate(prefabAsset);

            const needCreateCanvas = this._modelNode.getComponentsInChildren(UITransform).length > 0
                && this._modelNode.getComponentsInChildren(Canvas).length === 0;
            if (needCreateCanvas) {
                this.canvasNode = new Node('New Canvas');
                this.canvasNode.addComponent(Canvas);
                this.scene.addChild(this.canvasNode);
                this.canvasNode.addChild(this._modelNode);
            } else {
                this.scene.addChild(this._modelNode);
            }

            this._modelNode.setPosition(0, 0, 0);
            this.cameraComp.enabled = true;
            this.resetCameraView();
        } catch (e) {
            console.warn(e);
        }
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }
}
